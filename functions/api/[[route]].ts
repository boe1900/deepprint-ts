import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { convertToModelMessages, stepCountIs, streamText, tool } from 'ai'
import { frontendTools } from '@assistant-ui/react-ai-sdk'
import { z } from 'zod'
import { createAuth } from '../lib/auth'
import { resolveModelFromConfig, resolveModelFromEnv } from '../lib/ai-provider'
import { evaluateTrialGenerationLimit, recordSuccessfulGeneration } from '../lib/trial-generation-limit'
import { compileTemplateBundle, validateTemplateBundle } from '../lib/render-client'
import { normalizeTemplateBundleFiles, type RenderFormat, type TemplateBundleFiles } from '../lib/template-bundle'
import { getDesignBriefForDocumentType, getStarterContext, listTemplateStarters } from '../lib/template-assets'
import type { AppDatabase } from '../lib/db-types'

export type Bindings = {
  deepprint_auth: AppDatabase
  AI_PROVIDER_TYPE?: string
  AI_PROVIDER?: string
  AI_API_KEY?: string
  AI_BASE_URL?: string
  AI_MODEL?: string
  AI_API_MODE?: string
  GOOGLE_GENERATIVE_AI_API_KEY?: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  TRIAL_LIMIT_ENABLED?: string
  TRIAL_SUCCESSFUL_GENERATIONS_PER_24H?: string
  TRIAL_SUCCESSFUL_GENERATION_DEDUP_MINUTES?: string
  TRIAL_LIMIT_EXEMPT_EMAILS?: string
  TJR_RENDER_BASE_URL?: string
  TJR_RENDER_API_KEY?: string
  DEEPPRINT_DEV_AUTH?: string
}

export type Variables = {
  session: { user: { id: string; name: string; email: string; image?: string | null } }
}

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath('/api')

// 鉴权中间件 - 需要登录的路由加上 requireAuth 即可
const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  if (c.env.DEEPPRINT_DEV_AUTH === 'true') {
    const userId = c.req.header('x-deepprint-dev-user-id') || 'dev-user'
    await c.env.deepprint_auth
      .prepare('INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT ("id") DO NOTHING')
      .bind(userId, 'Dev User', `${userId}@local.test`, true, new Date().toISOString(), new Date().toISOString())
      .run()
    c.set('session', {
      user: {
        id: userId,
        name: 'Dev User',
        email: `${userId}@local.test`,
      },
    })
    await next()
    return
  }

  const auth = createAuth(c.env, c.req.url)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    return c.json({ error: '请先登录' }, 401)
  }
  c.set('session', session as any)
  await next()
})

// Auth 路由 - 处理所有 /api/auth/* 请求
app.on(['GET', 'POST'], '/auth/*', (c) => {
  const auth = createAuth(c.env, c.req.url)
  return auth.handler(c.req.raw)
})

const TYPST_SYSTEM_PROMPT = `你是 DeepPrint 的 Typst 模版编辑 Agent。

工作方式：
1. 只有在用户明确要求“修改/生成/应用模版”时，才调用修改工具。
2. 当不需要修改时，只进行自然中文对话，不能调用工具。
3. 首次生成、切换模板类型、或大范围重构时，调用 \`update_template_bundle\` 提交完整 TemplateBundle files map，至少包含 manifest.json、template.typ、data.json、data.schema.json。
4. 修复编译错误、调整局部样式、或只改少量文本/几行代码时，按代码代理风格处理：先用 \`read_template_bundle_file\` 读取当前文件相关行，再调用 \`apply_template_bundle_patch\` 做局部修改。不要为一个小错误重写整个 template.typ。
5. 工具结果会返回编译结果：
   - \`ok=true\`：编译成功，可以给出简短说明并结束。
   - \`ok=false\`：本次修改没有生效，严禁说“已修改/已编译通过/已完成”。必须根据 \`error\` 继续修复；若是局部错误，优先重新读取当前文件后再次调用 \`apply_template_bundle_patch\`。
6. \`read_template_bundle_file\` 只读取，不会修改模板。读取成功后严禁说“已修正/已修改”；若用户要求变更，必须继续调用 \`apply_template_bundle_patch\` 或 \`update_template_bundle\`，且修改工具返回 \`ok=true\` 后才算完成。
7. 如果某次 \`apply_template_bundle_patch\` 或 \`update_template_bundle\` 返回 \`ok=false\`，后续只调用 \`read_template_bundle_file\` 不能清除失败状态，必须再次调用修改工具并成功。
8. \`apply_template_bundle_patch\` 必须使用原始 patch 文本，不要包 Markdown 代码围栏。格式为 \`*** Begin Patch\`、\`*** Update File: path\`、\`@@ optional anchor\`、空格上下文行、\`-\` 删除行、\`+\` 新增行、\`*** End Patch\`。patch 要尽量小，只包含必要上下文。patch 可以同时修改 template.typ、data.json、data.schema.json、manifest.json。
9. data.json 是完整模拟数据，字段必须与 data.schema.json 和 template.typ 一致。
10. 优先保留用户已有结构，仅修改用户要求的部分。
11. template.typ 通过 \`#let data = json("data.json")\` 读取数据，请确保代码可编译。
12. 只要用户要求生成完整领域模板，或请求明显属于内置类型（小票、面单、试卷、商务文档、邀请函），必须按顺序显式调用工具：先 \`list_template_starters\`，再从返回列表中选择 starterId 调用 \`get_starter_context\`；不能直接手写整套 Typst。
13. 必须基于 \`get_starter_context\` 返回的 starter、componentSource 和 designBrief 排版，优先内联/改造现有组件模式；只有 starter 和组件源码都覆盖不了时，才少量手写 Typst。
14. 最终 files map 不能包含 lib/ 文件；不要保留本地 \`#import "lib/..."\`。Typst package import 只允许 \`@preview/tiaoma:0.3.0\`，用于条码/二维码；不要使用其他 package import。
15. files["template.typ"] 必须是原始 Typst 源码，严禁包在 Markdown 代码围栏（如 \`\`\`typst）里。
16. Typst 模式规则必须严格遵守：顶层 markup 调用写 \`#text(...)\`；\`#let ... = { ... }\`、\`#for ... { ... }\`、函数参数列表是 code mode，里面不要写 \`#text\`；内容块 \`[ ... ]\` 是 markup mode，里面函数调用和变量插值必须写 \`#text(...)\`、\`#data.xxx\`。
17. 修复 \`the character # is not valid in code\` 时，先检查是否在函数参数、字典、数组、\`#let ... = { ... }\` 或 \`#for ... { ... }\` 内误写了 \`#\`。
18. \`text(fill: ...)\` 只能接收颜色、渐变或 tiling，不能传 \`none\`。可选颜色参数使用 \`fill: auto\` 表示继承；如果变量可能是 \`none\`，必须先判断再决定是否传入 \`fill\`。
19. 窄小票的 grid 列宽不要依赖 \`auto\`；商品/汇总/键值行优先使用 \`1fr + 固定物理宽度\`，如 \`columns: (1fr, 18mm)\`。
Typst 模式速查：
- 正确：\`#grid(columns: (1fr, 18mm), [品名], align(right)[#str(value)])\`
- 错误：\`#grid(columns: (1fr, 18mm), [品名], #align(right)[#str(value)])\`
- 正确：\`#let helper(value) = align(right)[#str(value)]\`
- 错误：\`#let helper(value) = align(right)[str(value)]\`
- 正确：\`#align(center)[#text(size: 15pt)[#store.name]]\`
- 错误：\`#align(center)[text(size: 15pt)[store.name]]\`
- 正确：\`#let safe-text(body, fill: auto) = if fill == auto { text[#body] } else { text(fill: fill)[#body] }\`
- 错误：\`#let safe-text(body, fill: none) = text(fill: fill)[#body]\`
- 正确：\`#grid(columns: (1fr, 18mm), [合计], align(right)[#total])\`
- 避免：\`#grid(columns: (1fr, auto), [合计], align(right)[#total])\`

输出风格：
- 纯咨询时，直接回答问题，不输出代码块。
- 修改场景下，先执行工具，再用一句中文解释本次变更。
- 不要让用户手动复制代码。`

const TYPST_QUICK_RULES = [
  '每次输出完整可编译 Typst 代码，不要省略必要的 #set / #let；最终模板必须自包含。',
  '不要编造函数参数；不确定参数时，优先采用更保守写法。',
  '先复用已有变量名和结构，避免大范围重写。',
  '使用 data 时优先 data.at("key", default: "...") 兜底，避免缺字段报错。',
  '新增函数调用时，参数名和值保持简洁，避免传入未知参数。',
  '二维码需要保留白底与静区；条码/二维码只允许使用 @preview/tiaoma:0.3.0，优先复用 starter/componentSource 里已有写法。',
  '在网格/表格布局中，列数和内容数量保持一致。',
  '字符串插值和引号必须成对闭合。',
  'Typst code mode 里不要写 #；Typst 内容块 [...] 里调用函数或插入变量必须写 #。',
  '函数参数中传内容块时，写 align(right)[#str(value)]，不要写 #align(right)[...]。',
  '内容块 [...] 里不要裸写 text(...), str(...), data.xxx；必须写 #text(...), #str(...), #data.xxx。',
  '不要把 none 传给 text(fill: ...)。可选颜色用 fill:auto 或先判断 fill != none。',
  '窄小票 grid 的右侧金额/键值列使用固定宽度，不要使用 auto。',
  'template.typ 只能是原始 Typst 文件内容，不要返回 Markdown 代码块围栏。',
  '局部修复前先 read_template_bundle_file，再用 apply_template_bundle_patch。patch 可同时改多个文件，不需要每个文件都单独 read。',
  'read_template_bundle_file 只读不改；读取成功不能说已经修好。修改工具 ok=false 后，必须再次调用修改工具并 ok=true 才能结束。',
  '任何工具返回 ok=false 时，本次修改没有生效；严禁在最终回复里说已修改、已保存或编译通过。',
  '修改后若工具返回编译错误，必须基于失败草稿继续修复。',
  '非修改场景只答疑，不输出代码块。',
];

// 健康检查端点
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/render/validate', requireAuth, async (c) => {
  try {
    const body = await c.req.json<RenderApiRequest>()
    const files = normalizeTemplateBundleFiles(body.files)
    const result = await validateTemplateBundle(c.env, {
      files,
      data_json: body.data_json,
      format: body.format || 'png',
    })
    return c.json(result)
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : 'Render validate failed' }, 400)
  }
})

app.post('/render/compile', requireAuth, async (c) => {
  try {
    const body = await c.req.json<RenderApiRequest>()
    const files = normalizeTemplateBundleFiles(body.files)
    const result = await compileTemplateBundle(c.env, {
      files,
      data_json: body.data_json,
      format: body.format || 'png',
      include_artifact_base64: body.include_artifact_base64 ?? true,
    })
    return c.json(result)
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : 'Render compile failed' }, 400)
  }
})

type RequestScopedAIConfig = {
  provider_type?: string
  api_key?: string
  base_url?: string
  model?: string
  api_mode?: string
}

type GenerateRequest = {
  messages: Array<Omit<any, 'id'>>
  trigger?: string
  // AssistantChatTransport forwards the browser-registered toolkit schemas.
  // Keep tool definitions in the UI because these tools mutate editor state.
  tools?: Record<string, any>
  ai_config?: RequestScopedAIConfig
  context?: {
    template_id?: string
    base_typst?: string
    base_data?: Record<string, unknown>
    bundle_files?: TemplateBundleFiles
  }
}

type TemplateRow = {
  id: string
  folder_id: string
  user_id: string
  name: string
  content: string
  mock_data: string
  files_json?: string
  status: string
  updated_at: number
}

type RenderApiRequest = {
  files?: TemplateBundleFiles
  data_json?: string
  format?: RenderFormat
  include_artifact_base64?: boolean
}

const parseMockData = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

const parseFilesJson = (raw: unknown): TemplateBundleFiles => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeTemplateBundleFiles(raw)
  }
  if (typeof raw !== 'string') return {}
  try {
    return normalizeTemplateBundleFiles(JSON.parse(raw))
  } catch {
    return {}
  }
}

const normalizeOptionalString = (value: unknown) => {
  return typeof value === 'string' ? value.trim() : ''
}

const isPrivateIpv4Hostname = (hostname: string) => {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!ipv4Pattern.test(hostname)) return false

  const octets = hostname.split('.').map((segment) => Number(segment))
  if (octets.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 255)) {
    return false
  }

  const [a, b] = octets
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

const assertSafeRequestScopedBaseURL = (rawBaseURL: string) => {
  if (!rawBaseURL) {
    throw new Error('OpenAI-compatible 需要提供 Base URL')
  }

  let parsed: URL
  try {
    parsed = new URL(rawBaseURL)
  } catch {
    throw new Error('Base URL 格式不合法')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Base URL 必须使用 https')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === 'localhost'
    || hostname === '::1'
    || hostname.endsWith('.local')
    || isPrivateIpv4Hostname(hostname)
  ) {
    throw new Error('出于安全考虑，Base URL 不能指向本地或内网地址')
  }

  return rawBaseURL.replace(/\/+$/, '')
}

const parseRequestScopedAIConfig = (raw?: RequestScopedAIConfig) => {
  if (!raw) return null

  const apiKey = normalizeOptionalString(raw.api_key)
  if (!apiKey) {
    throw new Error('请先配置本地 AI Key')
  }

  const providerType = normalizeOptionalString(raw.provider_type) || 'google'
  const model = normalizeOptionalString(raw.model)
  const apiMode = normalizeOptionalString(raw.api_mode)
  const baseURL = providerType === 'openai'
    ? assertSafeRequestScopedBaseURL(normalizeOptionalString(raw.base_url))
    : undefined

  return {
    providerType,
    apiKey,
    model,
    apiMode,
    baseURL,
  }
}

const createTemplateVersionIfChanged = async (params: {
  db: AppDatabase
  userId: string
  templateId: string
  content: string
  mockDataString: string
  filesJsonString?: string
  source: 'ai' | 'manual' | 'rollback'
  summary?: string
}) => {
  const { db, userId, templateId, content, mockDataString, filesJsonString, source, summary } = params
  const latest = await db
    .prepare('SELECT content, mock_data, files_json FROM template_versions WHERE user_id = ? AND template_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId, templateId)
    .first<{ content: string; mock_data: string; files_json?: string }>()

  if (latest && latest.content === content && latest.mock_data === mockDataString && (latest.files_json || '') === (filesJsonString || '')) {
    return null
  }

  const versionId = crypto.randomUUID()
  if (filesJsonString !== undefined) {
    await db
      .prepare('INSERT INTO template_versions (id, user_id, template_id, content, mock_data, files_json, source, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(versionId, userId, templateId, content, mockDataString, filesJsonString, source, (summary || '').trim())
      .run()
  } else {
    await db
      .prepare('INSERT INTO template_versions (id, user_id, template_id, content, mock_data, source, summary) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(versionId, userId, templateId, content, mockDataString, source, (summary || '').trim())
      .run()
  }

  return versionId
}

const MAX_FULL_TYPST_CHARS = 20000
const MAX_FULL_DATA_CHARS = 12000

const trimMiddle = (input: string, keepHead: number, keepTail: number) => {
  if (input.length <= keepHead + keepTail) return input
  return `${input.slice(0, keepHead)}\n\n...（中间内容已省略）...\n\n${input.slice(-keepTail)}`
}

const hashText = (content: string) => {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const buildTemplateContextSection = (context?: GenerateRequest['context']) => {
  const rawTypst = typeof context?.base_typst === 'string' ? context.base_typst : ''
  const rawData = context?.base_data ?? {}
  const bundleFiles = context?.bundle_files && typeof context.bundle_files === 'object' && !Array.isArray(context.bundle_files)
    ? normalizeTemplateBundleFiles(context.bundle_files)
    : undefined
  const dataText = JSON.stringify(rawData, null, 2)
  const fileSummary = bundleFiles
    ? Object.entries(bundleFiles)
      .map(([file, content]) => `- ${file}: length=${content.length}, lines=${content.split('\n').length}, hash=${hashText(content)}`)
      .join('\n')
    : '- template.typ\n- data.json'

  const typstFull = rawTypst.length > 0 && rawTypst.length <= MAX_FULL_TYPST_CHARS
  const dataFull = dataText.length <= MAX_FULL_DATA_CHARS

  const typstContent = rawTypst.length === 0
    ? '（当前无模板代码）'
    : typstFull
      ? rawTypst
      : trimMiddle(rawTypst, 9000, 9000)

  const dataContent = dataFull
    ? dataText
    : trimMiddle(dataText, 5000, 5000)

  return `模板上下文（请优先基于以下内容回答与修改）：
- typst_context_mode=${typstFull ? 'full' : 'truncated'}
- data_context_mode=${dataFull ? 'full' : 'truncated'}

当前 TemplateBundle 文件快照：
${fileSummary}

当前 Typst 模板代码：
\`\`\`typst
${typstContent}
\`\`\`

当前 mock_data：
\`\`\`json
${dataContent}
\`\`\``
}

const getBundleManifest = (context?: GenerateRequest['context']): Record<string, unknown> => {
  const rawManifest = context?.bundle_files?.['manifest.json']
  if (typeof rawManifest !== 'string') return {}
  try {
    const parsed = JSON.parse(rawManifest)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

const inferDocumentTypeFromContext = (context: GenerateRequest['context'] | undefined, messages: GenerateRequest['messages']) => {
  const manifest = getBundleManifest(context)
  const manifestType = typeof manifest.document_type === 'string' ? manifest.document_type : ''
  if (manifestType) return manifestType

  const starterId = inferStarterId(`${latestUserText(messages)}\n${context?.base_typst || ''}`)
  if (starterId === 'receipt-basic') return 'receipt'
  if (starterId === 'shipping-label-basic') return 'shipping_label'
  if (starterId === 'exam-paper-basic') return 'exam_paper'
  if (starterId === 'business-document-basic') return 'business_document'
  if (starterId === 'invitation-basic') return 'invitation'
  return ''
}

const buildDesignBriefSection = (documentType: string) => {
  const designBrief = documentType ? getDesignBriefForDocumentType(documentType) : ''
  if (!designBrief) return ''
  return `当前文档类型设计规范 (${documentType})：
${designBrief}`
}

const extractText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n')
  const record = value as Record<string, unknown>
  return [record.text, record.content, record.parts].map(extractText).filter(Boolean).join('\n')
}

const latestUserText = (messages: GenerateRequest['messages']) => {
  for (const message of [...messages].reverse()) {
    if ((message as { role?: string }).role === 'user') return extractText(message)
  }
  return ''
}

const SERVER_TOOL_HISTORY_KEEP_MESSAGES = 12
const SERVER_MAX_TEXT_PART_CHARS = 1200
const LEGACY_TEMPLATE_EDIT_TOOL_TYPES = new Set([
  'tool-edit_template_bundle_file',
  'tool-edit_template_bundle_file_range',
  'tool-patch_template_bundle',
])
const LEGACY_REVISION_NOTE = '[历史旧版编辑工具状态已归档；当前模板编辑不再使用 revision，请以当前 TemplateBundle 快照为准。]'
const LEGACY_REVISION_PATTERN = /expectedRevision|currentRevision|workspaceRevision|当前 revision|版本已过期|已经分叉|File has changed since read|File has not been read yet|Call read_template_bundle_file/i

const sanitizeHistoricalTextForModel = (value: string, role?: string) => {
  if (role === 'user') return value
  return LEGACY_REVISION_PATTERN.test(value) ? LEGACY_REVISION_NOTE : value
}

const compactToolPartForModel = (part: Record<string, unknown>) => {
  const type = typeof part.type === 'string' ? part.type : 'tool'
  if (LEGACY_TEMPLATE_EDIT_TOOL_TYPES.has(type)) {
    return { type: 'text', text: LEGACY_REVISION_NOTE }
  }
  const input = part.input && typeof part.input === 'object' ? part.input as Record<string, unknown> : {}
  const output = part.output && typeof part.output === 'object' ? part.output as Record<string, unknown> : undefined
  const file = typeof input.file === 'string' ? input.file : typeof output?.file === 'string' ? output.file : undefined
  const starterId = typeof input.starterId === 'string' ? input.starterId : undefined
  const fileCount = input.files && typeof input.files === 'object' ? Object.keys(input.files as Record<string, unknown>).length : undefined
  const ok = typeof output?.ok === 'boolean' ? output.ok : undefined
  const error = typeof output?.error === 'string' ? sanitizeHistoricalTextForModel(output.error).slice(0, 600) : undefined
  const changedFiles = Array.isArray(output?.changedFiles) ? output.changedFiles.filter((item): item is string => typeof item === 'string') : []

  return {
    type,
    ...(typeof part.toolCallId === 'string' ? { toolCallId: part.toolCallId } : {}),
    state: typeof part.state === 'string' ? part.state : undefined,
    input: {
      ...(file ? { file } : {}),
      ...(starterId ? { starterId } : {}),
      ...(fileCount !== undefined ? { fileCount } : {}),
    },
    output: {
      ...(ok !== undefined ? { ok } : {}),
      ...(error ? { error } : {}),
      ...(changedFiles.length > 0 ? { changedFiles } : {}),
    },
  }
}

const compactMessagesForModel = (messages: GenerateRequest['messages'], keepRecentToolDetails: boolean): GenerateRequest['messages'] => {
  const firstToolMessageToKeep = keepRecentToolDetails ? Math.max(0, messages.length - SERVER_TOOL_HISTORY_KEEP_MESSAGES) : messages.length
  return messages.map((message, messageIndex) => {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : []
    const keepToolDetails = messageIndex >= firstToolMessageToKeep
    const role = typeof (message as any).role === 'string' ? (message as any).role : undefined
    return {
      ...message,
      role: (message as any).role,
      parts: parts
        .map((part: unknown) => {
          if (!part || typeof part !== 'object') return part
          const record = part as Record<string, unknown>
          const type = typeof record.type === 'string' ? record.type : ''
          if (type === 'text' && typeof record.text === 'string') {
            const text = sanitizeHistoricalTextForModel(record.text, role)
            if (text.length > SERVER_MAX_TEXT_PART_CHARS) {
              return { ...record, text: `${text.slice(0, SERVER_MAX_TEXT_PART_CHARS)}\n\n[历史消息已截断]` }
            }
            return text === record.text ? record : { ...record, text }
          }
          if (LEGACY_TEMPLATE_EDIT_TOOL_TYPES.has(type)) {
            return { type: 'text', text: LEGACY_REVISION_NOTE }
          }
          if (type.startsWith('tool-') && !keepToolDetails) {
            return compactToolPartForModel(record)
          }
          return part
        })
        .filter((part: unknown) => {
          if (!part || typeof part !== 'object') return true
          return (part as Record<string, unknown>).type !== 'step-start'
        }),
    }
  })
}

// ponytail: keyword matcher; replace with explicit user template selection if this grows.
const inferStarterId = (text: string) => {
  const normalized = text.toLowerCase()
  const matchers: Array<[string, string[]]> = [
    ['receipt-basic', ['小票', '收据', '点单', '取货码', '取餐码', '热敏', '奶茶', 'receipt', 'cashier']],
    ['shipping-label-basic', ['面单', '快递', '物流', '运单', 'shipping label', 'waybill']],
    ['exam-paper-basic', ['试卷', '考试', '练习题', 'quiz', 'exam', 'worksheet']],
    ['business-document-basic', ['发票', '报价单', '账单', '合同', 'invoice', 'quotation', 'statement']],
    ['invitation-basic', ['请帖', '邀请函', '婚礼', '活动邀请', 'invitation', 'wedding']],
  ]
  return matchers.find(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))?.[0]
}

const buildStarterHintSection = (messages: GenerateRequest['messages']) => {
  if (!inferStarterId(latestUserText(messages))) return ''
  return `用户请求疑似命中内置模板类型。
首次生成完整模板时，在调用 update_template_bundle 前，必须按顺序显式调用工具：
1. list_template_starters({})
2. 从返回列表中选择最合适的 starterId，再调用 get_starter_context({ "starterId": "..." })
不要跳过 list_template_starters，也不要只根据当前模板上下文直接手写整套 Typst。
如果当前已经有模板，用户只是要求修复编译错误或做局部调整，必须先调用 read_template_bundle_file，再使用 apply_template_bundle_patch 局部修改，不要整份重写。`
}

const aiStreamErrorMessage = (error: unknown) => {
  const err = error as { message?: string; statusCode?: number; lastError?: { message?: string; statusCode?: number } }
  const statusCode = err?.statusCode ?? err?.lastError?.statusCode
  const message = err?.lastError?.message || err?.message || '上游服务异常'
  return statusCode
    ? `AI 请求失败（HTTP ${statusCode}）：${message}`
    : `AI 请求失败：${message}`
}

const starterTools = {
  list_template_starters: tool({
    description: '列出 DeepPrint 内置的全部模板 starter 摘要。生成完整领域模板或请求小票/面单/试卷/商务文档/邀请函时必须先调用它，然后只选择一个最合适的 starterId。',
    inputSchema: z.object({}),
    execute: async () => ({
      starters: listTemplateStarters(),
    }),
  }),
  get_starter_context: tool({
    description: '读取一个 starter 的完整上下文，包含 starter 四个文件、同领域 componentSource 和 designBrief。拿到后必须优先基于这些内容生成自包含 TemplateBundle，不能跳过后直接手写整套 Typst。',
    inputSchema: z.object({
      starterId: z.string().describe('来自 list_template_starters 返回结果的 starterId。'),
    }),
    execute: async ({ starterId }) => getStarterContext(starterId),
  }),
}

// AI 生成端点
app.post('/generate', requireAuth, async (c) => {
  try {
    const { messages, tools, context, ai_config } = await c.req.json<GenerateRequest>()
    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'messages 参数不合法' }, 400)
    }
    // Convert assistant-ui frontend tools into AI SDK tools without duplicating
    // their schema on the server.
    const clientTools = tools && typeof tools === 'object' ? frontendTools(tools) : {}
    const allTools = {
      ...starterTools,
      ...clientTools,
    }

    const compactedMessages = compactMessagesForModel(messages, true)
    const modelMessages = await convertToModelMessages(compactedMessages, {
      tools: allTools,
      ignoreIncompleteToolCalls: true,
    })

    const requestScopedAIConfig = parseRequestScopedAIConfig(ai_config)
    const { providerType, model, apiMode, languageModel } = requestScopedAIConfig
      ? resolveModelFromConfig(requestScopedAIConfig)
      : resolveModelFromEnv(c.env)

    const templateContextSection = buildTemplateContextSection(context)
    const documentType = inferDocumentTypeFromContext(context, messages)
    const designBriefSection = buildDesignBriefSection(documentType)
    const starterHintSection = buildStarterHintSection(messages)

    const systemPrompt = `${TYPST_SYSTEM_PROMPT}

高频规则（只列最易错点）：
${TYPST_QUICK_RULES.map((rule, idx) => `${idx + 1}. ${rule}`).join('\n')}

约束：
1. Typst 字体、包解析与可用性以 typst-json-render 的编译结果为准，DeepPrint 不维护白名单。
2. 需要条码或二维码时，只允许使用 allowlist 包 \`@preview/tiaoma:0.3.0\`；若编译失败，按错误信息最小改动修复。
3. 工具错误中若包含 line/column/snippet，优先围绕该位置最小改动修复。

当前上下文：
- template_id=${context?.template_id || 'unknown'}
- document_type=${documentType || 'unknown'}
- provider_type=${providerType}
- model=${model}
- api_mode=${apiMode}

${templateContextSection}
${designBriefSection ? `\n\n${designBriefSection}` : ''}
${starterHintSection ? `\n\n${starterHintSection}` : ''}`

    const runGenerate = (model: any) => streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: allTools,
      providerOptions: providerType === 'openai' && apiMode === 'responses'
        ? { openai: { store: false } }
        : undefined,
      stopWhen: stepCountIs(6),
    })

    return runGenerate(languageModel).toUIMessageStreamResponse({
      onError: aiStreamErrorMessage,
    })
  } catch (error) {
    console.error('Generate error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    )
  }
})

// ─── Folders & Templates CRUD ────────────────────────────────────────────────

// GET /folders — 获取当前用户所有分组及模版列表
app.get('/folders', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const db = c.env.deepprint_auth

  const folders = await db
    .prepare('SELECT id, name, sort_order, created_at FROM folders WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(userId)
    .all<any>()

  const templates = await db
    .prepare('SELECT id, folder_id, name, status, updated_at FROM templates WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(userId)
    .all<any>()

  // 按 folder_id 分组
  const templatesByFolder: Record<string, any[]> = {}
  for (const t of templates.results) {
    const fid = t.folder_id as string
    if (!templatesByFolder[fid]) templatesByFolder[fid] = []
    templatesByFolder[fid].push(t)
  }

  const result = folders.results.map((f: any) => ({
    ...f,
    templates: templatesByFolder[f.id] || [],
  }))

  return c.json({ folders: result })
})

// POST /folders — 创建新分组
app.post('/folders', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const { name } = await c.req.json<{ name: string }>()
  if (!name || !name.trim()) {
    return c.json({ error: '分组名称不能为空' }, 400)
  }

  const id = crypto.randomUUID()
  const db = c.env.deepprint_auth
  const trimmedName = name.trim()

  const duplicate = await db
    .prepare('SELECT id FROM folders WHERE user_id = ? AND lower(name) = lower(?) LIMIT 1')
    .bind(userId, trimmedName)
    .first()
  if (duplicate) return c.json({ error: '分组名称不能重复' }, 409)

  await db
    .prepare('INSERT INTO folders (id, user_id, name) VALUES (?, ?, ?)')
    .bind(id, userId, trimmedName)
    .run()

  return c.json({ id, name: trimmedName, sort_order: 0 }, 201)
})

// PUT /folders/:id — 更新分组
app.put('/folders/:id', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const folderId = c.req.param('id')
  const body = await c.req.json<{ name?: string }>()
  const db = c.env.deepprint_auth

  const existing = await db
    .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?')
    .bind(folderId, userId)
    .first()

  if (!existing) return c.json({ error: '分组不存在' }, 404)

  if (!body.name || !body.name.trim()) {
    return c.json({ error: '分组名称不能为空' }, 400)
  }

  const trimmedName = body.name.trim()
  const duplicate = await db
    .prepare('SELECT id FROM folders WHERE user_id = ? AND lower(name) = lower(?) AND id != ? LIMIT 1')
    .bind(userId, trimmedName, folderId)
    .first()
  if (duplicate) return c.json({ error: '分组名称不能重复' }, 409)

  await db
    .prepare('UPDATE folders SET name = ? WHERE id = ? AND user_id = ?')
    .bind(trimmedName, folderId, userId)
    .run()

  return c.json({ success: true })
})

// DELETE /folders/:id — 删除分组（若有模版则禁止）
app.delete('/folders/:id', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const folderId = c.req.param('id')
  const db = c.env.deepprint_auth

  const existing = await db
    .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?')
    .bind(folderId, userId)
    .first()

  if (!existing) return c.json({ error: '分组不存在' }, 404)

  const countResult = await db
    .prepare('SELECT COUNT(1) as cnt FROM templates WHERE folder_id = ? AND user_id = ?')
    .bind(folderId, userId)
    .first<{ cnt: number | string }>()

  const count = (countResult?.cnt as number) || 0
  if (count > 0) {
    return c.json({ error: '分组下存在模版，无法删除' }, 400)
  }

  await db
    .prepare('DELETE FROM folders WHERE id = ? AND user_id = ?')
    .bind(folderId, userId)
    .run()

  return c.json({ success: true })
})

// POST /templates — 在指定分组下创建新模版
app.post('/templates', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const { folder_id, name } = await c.req.json<{ folder_id: string; name: string }>()

  if (!folder_id) return c.json({ error: 'folder_id 不能为空' }, 400)
  if (!name || !name.trim()) return c.json({ error: '模版名称不能为空' }, 400)

  const id = crypto.randomUUID()
  const db = c.env.deepprint_auth
  const trimmedName = name.trim()

  const duplicate = await db
    .prepare('SELECT id FROM templates WHERE user_id = ? AND folder_id = ? AND lower(name) = lower(?) LIMIT 1')
    .bind(userId, folder_id, trimmedName)
    .first()
  if (duplicate) return c.json({ error: '同一分组下模版名称不能重复' }, 409)

  await db
    .prepare('INSERT INTO templates (id, folder_id, user_id, name) VALUES (?, ?, ?, ?)')
    .bind(id, folder_id, userId, trimmedName)
    .run()

  return c.json({ id, folder_id, name: trimmedName, status: 'draft', updated_at: Math.floor(Date.now() / 1000) }, 201)
})

// GET /templates/:id — 获取单个模版详情（含 content 和 mock_data）
app.get('/templates/:id', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const templateId = c.req.param('id')
  const db = c.env.deepprint_auth

  const result = await db
    .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first<{ mock_data?: string; files_json?: string } & Record<string, unknown>>()

  if (!result) return c.json({ error: '模版不存在' }, 404)

  // mock_data 存储为 JSON 字符串，返回时解析
  let mockData: Record<string, unknown> = {}
  try {
    mockData = JSON.parse((result.mock_data as string) || '{}')
  } catch {
    mockData = {}
  }

  return c.json({ ...result, mock_data: mockData, files_json: parseFilesJson((result as any).files_json) })
})

// GET /templates/:id/ai-thread — 获取模板维度会话
app.get('/templates/:id/ai-thread', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const templateId = c.req.param('id')
  const db = c.env.deepprint_auth

  const template = await db
    .prepare('SELECT id FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first()
  if (!template) return c.json({ error: '模版不存在' }, 404)

  let thread = await db
    .prepare('SELECT id, title, created_at, updated_at FROM ai_threads WHERE user_id = ? AND template_id = ? LIMIT 1')
    .bind(userId, templateId)
    .first<{ id: string; title: string; created_at: number; updated_at: number }>()

  if (!thread) {
    const threadId = crypto.randomUUID()
    await db
      .prepare('INSERT INTO ai_threads (id, user_id, template_id, title) VALUES (?, ?, ?, ?)')
      .bind(threadId, userId, templateId, '模板会话')
      .run()
    thread = {
      id: threadId,
      title: '模板会话',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    }
  }

  const messagesRaw = await db
    .prepare('SELECT id, role, parts_json, position, created_at FROM ai_messages WHERE thread_id = ? ORDER BY position ASC, created_at ASC, id ASC')
    .bind(thread.id)
    .all()

  const messages = messagesRaw.results.map((item: any) => {
    let parts: unknown[] = []
    try {
      const parsed = JSON.parse(item.parts_json || '[]')
      parts = Array.isArray(parsed) ? parsed : []
    } catch {
      parts = []
    }
    return {
      id: item.id as string,
      role: item.role as string,
      parts,
      position: typeof item.position === 'number' ? item.position : Number(item.position || 0),
      created_at: item.created_at as number,
    }
  })

  return c.json({
    thread: {
      id: thread.id,
      title: thread.title,
      template_id: templateId,
      created_at: thread.created_at,
      updated_at: thread.updated_at,
    },
    messages,
  })
})

// PUT /templates/:id/ai-thread/messages — 覆盖保存模板会话消息
app.put('/templates/:id/ai-thread/messages', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const templateId = c.req.param('id')
  const db = c.env.deepprint_auth
  const body = await c.req.json<{ messages?: Array<{ role: string; parts?: unknown[] }> }>()
  const messages = Array.isArray(body.messages) ? body.messages : []

  const template = await db
    .prepare('SELECT id FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first()
  if (!template) return c.json({ error: '模版不存在' }, 404)

  if (messages.length > 200) {
    return c.json({ error: '会话消息过多，最多保存 200 条' }, 400)
  }

  let thread = await db
    .prepare('SELECT id FROM ai_threads WHERE user_id = ? AND template_id = ? LIMIT 1')
    .bind(userId, templateId)
    .first<{ id: string }>()

  if (!thread) {
    const threadId = crypto.randomUUID()
    await db
      .prepare('INSERT INTO ai_threads (id, user_id, template_id, title) VALUES (?, ?, ?, ?)')
      .bind(threadId, userId, templateId, '模板会话')
      .run()
    thread = { id: threadId }
  }

  if (messages.length === 0) {
    const existingCount = await db
      .prepare('SELECT COUNT(1) as cnt FROM ai_messages WHERE thread_id = ?')
      .bind(thread.id)
      .first<{ cnt: number | string }>()
    if (Number(existingCount?.cnt || 0) > 0) {
      return c.json({ success: true, skipped: 'empty_messages_preserved' })
    }
  }

  await db.prepare('DELETE FROM ai_messages WHERE thread_id = ?').bind(thread.id).run()
  for (const [index, message] of messages.entries()) {
    const role = typeof message.role === 'string' ? message.role : 'assistant'
    const parts = Array.isArray(message.parts) ? message.parts : []
    await db
      .prepare('INSERT INTO ai_messages (id, thread_id, role, parts_json, position) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), thread.id, role, JSON.stringify(parts), index)
      .run()
  }

  await db
    .prepare('UPDATE ai_threads SET updated_at = ? WHERE id = ?')
    .bind(Math.floor(Date.now() / 1000), thread.id)
    .run()

  return c.json({ success: true })
})

// GET /templates/:id/versions — 获取模板历史版本
app.get('/templates/:id/versions', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const templateId = c.req.param('id')
  const db = c.env.deepprint_auth

  const limitRaw = Number(c.req.query('limit') || '20')
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20

  const template = await db
    .prepare('SELECT id FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first()
  if (!template) return c.json({ error: '模版不存在' }, 404)

  const versions = await db
    .prepare('SELECT id, source, summary, created_at FROM template_versions WHERE user_id = ? AND template_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(userId, templateId, limit)
    .all()

  return c.json({ versions: versions.results })
})

// POST /templates/:id/versions/:versionId/restore — 回滚到某版本（并创建 rollback 快照）
app.post('/templates/:id/versions/:versionId/restore', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const templateId = c.req.param('id')
  const versionId = c.req.param('versionId')
  const db = c.env.deepprint_auth

  const template = await db
    .prepare('SELECT id FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first()
  if (!template) return c.json({ error: '模版不存在' }, 404)

  const targetVersion = await db
    .prepare('SELECT id, content, mock_data, files_json FROM template_versions WHERE id = ? AND user_id = ? AND template_id = ?')
    .bind(versionId, userId, templateId)
    .first<{ id: string; content: string; mock_data: string; files_json?: string }>()
  if (!targetVersion) return c.json({ error: '版本不存在' }, 404)

  const now = Math.floor(Date.now() / 1000)
  await db
    .prepare('UPDATE templates SET content = ?, mock_data = ?, files_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(targetVersion.content, targetVersion.mock_data, targetVersion.files_json || '{}', now, templateId, userId)
    .run()

  await createTemplateVersionIfChanged({
    db,
    userId,
    templateId,
    content: targetVersion.content,
    mockDataString: targetVersion.mock_data,
    filesJsonString: targetVersion.files_json || '{}',
    source: 'rollback',
    summary: `回滚到版本 ${versionId}`,
  })

  return c.json({
    success: true,
    content: targetVersion.content,
    mock_data: parseMockData(targetVersion.mock_data),
    files_json: parseFilesJson(targetVersion.files_json),
  })
})

// PUT /templates/:id — 更新模版
app.put('/templates/:id', requireAuth, async (c) => {
  const session = c.get('session') as any
  const userId = session.user.id
  const templateId = c.req.param('id')
  const body = await c.req.json<{
    name?: string
    content?: string
    mock_data?: Record<string, unknown>
    files_json?: TemplateBundleFiles
    status?: string
    update_source?: 'ai' | 'manual' | 'rollback'
    update_summary?: string
  }>()
  const db = c.env.deepprint_auth

  // 检查模版存在且属于当前用户
  const existing = await db
    .prepare('SELECT id, folder_id, content, mock_data, files_json FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first<TemplateRow>()

  if (!existing) return c.json({ error: '模版不存在' }, 404)

  // 动态构建 SET 子句
  const sets: string[] = []
  const values: (string | number)[] = []
  const nextContent = body.content !== undefined ? body.content : existing.content
  const nextMockDataString = body.mock_data !== undefined
    ? JSON.stringify(body.mock_data)
    : (existing.mock_data || '{}')
  const nextFilesJsonString = body.files_json !== undefined
    ? JSON.stringify(body.files_json)
    : (existing.files_json || '')
  const contentOrDataChanged =
    nextContent !== existing.content
    || nextMockDataString !== (existing.mock_data || '{}')
    || nextFilesJsonString !== (existing.files_json || '')
  const shouldTrackSuccessfulAiGeneration =
    contentOrDataChanged && body.update_source === 'ai'

  let trialGenerationDecision:
    | Awaited<ReturnType<typeof evaluateTrialGenerationLimit>>
    | null = null
  if (shouldTrackSuccessfulAiGeneration) {
    trialGenerationDecision = await evaluateTrialGenerationLimit({
      db,
      env: c.env,
      templateId,
      userEmail: session.user.email,
      userId,
    })

    if (!trialGenerationDecision.allowed) {
      return c.json({ error: trialGenerationDecision.errorMessage || '试用额度已用完' }, 429)
    }
  }

  if (body.name !== undefined) {
    const trimmedName = body.name.trim()
    if (!trimmedName) return c.json({ error: '模版名称不能为空' }, 400)
    const duplicate = await db
      .prepare('SELECT id FROM templates WHERE user_id = ? AND folder_id = ? AND lower(name) = lower(?) AND id != ? LIMIT 1')
      .bind(userId, (existing as any).folder_id, trimmedName, templateId)
      .first()
    if (duplicate) return c.json({ error: '同一分组下模版名称不能重复' }, 409)
    sets.push('name = ?')
    values.push(trimmedName)
  }
  if (body.content !== undefined) { sets.push('content = ?'); values.push(body.content) }
  if (body.mock_data !== undefined) { sets.push('mock_data = ?'); values.push(nextMockDataString) }
  if (body.files_json !== undefined) { sets.push('files_json = ?'); values.push(nextFilesJsonString) }
  if (body.status !== undefined) { sets.push('status = ?'); values.push(body.status) }

  if (sets.length === 0) return c.json({ error: '没有需要更新的字段' }, 400)

  sets.push('updated_at = ?')
  values.push(Math.floor(Date.now() / 1000))

  values.push(templateId, userId)

  await db
    .prepare(`UPDATE templates SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run()

  if (contentOrDataChanged) {
    await createTemplateVersionIfChanged({
      db,
      userId,
      templateId,
      content: nextContent,
      mockDataString: nextMockDataString,
      filesJsonString: nextFilesJsonString || undefined,
      source: body.update_source || 'manual',
      summary: body.update_summary || '',
    })
  }

  if (trialGenerationDecision?.shouldRecord) {
    try {
      await recordSuccessfulGeneration({ db, templateId, userId })
    } catch (error) {
      console.error('记录试用成品额度失败:', error)
    }
  }

  return c.json({ success: true })
})

// DELETE /templates/:id — 删除模版
app.delete('/templates/:id', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const templateId = c.req.param('id')
  const db = c.env.deepprint_auth

  const existing = await db
    .prepare('SELECT id FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first()

  if (!existing) return c.json({ error: '模版不存在' }, 404)

  // 先清理模板关联数据：AI 会话消息、AI 线程、历史版本
  const threadRows = await db
    .prepare('SELECT id FROM ai_threads WHERE user_id = ? AND template_id = ?')
    .bind(userId, templateId)
    .all<{ id: string }>()

  for (const row of threadRows.results) {
    const threadId = row.id as string
    await db
      .prepare('DELETE FROM ai_messages WHERE thread_id = ?')
      .bind(threadId)
      .run()
  }

  await db
    .prepare('DELETE FROM ai_threads WHERE user_id = ? AND template_id = ?')
    .bind(userId, templateId)
    .run()

  await db
    .prepare('DELETE FROM template_versions WHERE user_id = ? AND template_id = ?')
    .bind(userId, templateId)
    .run()

  await db
    .prepare('DELETE FROM trial_generation_events WHERE user_id = ? AND template_id = ?')
    .bind(userId, templateId)
    .run()

  await db
    .prepare('DELETE FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .run()

  return c.json({ success: true })
})
