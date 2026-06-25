import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { frontendTools } from '@assistant-ui/react-ai-sdk'
import { createAuth } from '../lib/auth'
import { resolveModelFromConfig, resolveModelFromEnv } from '../lib/ai-provider'
import { evaluateTrialGenerationLimit, recordSuccessfulGeneration } from '../lib/trial-generation-limit'
import { compileTemplateBundle, validateTemplateBundle } from '../lib/render-client'
import { normalizeTemplateBundleFiles, type RenderFormat, type TemplateBundleFiles } from '../lib/template-bundle'
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
1. 只有在用户明确要求“修改/生成/应用模版”时，才调用工具 \`update_template_bundle\`。
2. 当不需要修改时，只进行自然中文对话，不能调用工具。
3. 每次修改都提交完整 TemplateBundle files map，至少包含 manifest.json、template.typ、data.json、data.schema.json。
4. 工具结果会返回编译结果：
   - \`ok=true\`：编译成功，可以给出简短说明并结束。
   - \`ok=false\`：必须根据 \`error\` 继续修复并再次调用 \`update_template_bundle\`。
5. data.json 是完整模拟数据，字段必须与 data.schema.json 和 template.typ 一致。
6. 优先保留用户已有结构，仅修改用户要求的部分。
7. template.typ 通过 \`#let data = json("data.json")\` 读取数据，请确保代码可编译。

输出风格：
- 纯咨询时，直接回答问题，不输出代码块。
- 修改场景下，先执行工具，再用一句中文解释本次变更。
- 不要让用户手动复制代码。`

const TYPST_QUICK_RULES = [
  '每次输出完整可编译 Typst 代码，不要省略 import / #set / #let 依赖。',
  '不要编造函数参数；不确定参数时，优先采用更保守写法。',
  '先复用已有变量名和结构，避免大范围重写。',
  '使用 data 时优先 data.at("key", default: "...") 兜底，避免缺字段报错。',
  '新增函数调用时，参数名和值保持简洁，避免传入未知参数。',
  '二维码需要保留白底与静区；具体 Typst 包以编译结果为准。',
  '在网格/表格布局中，列数和内容数量保持一致。',
  '字符串插值和引号必须成对闭合。',
  '修改后若工具返回编译错误，必须基于错误继续修复。',
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
  // AssistantChatTransport forwards the browser-registered toolkit schemas.
  // Keep tool definitions in the UI because these tools mutate editor state.
  tools?: Record<string, any>
  ai_config?: RequestScopedAIConfig
  context?: {
    template_id?: string
    base_typst?: string
    base_data?: Record<string, unknown>
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

const buildTemplateContextSection = (context?: GenerateRequest['context']) => {
  const rawTypst = typeof context?.base_typst === 'string' ? context.base_typst : ''
  const rawData = context?.base_data ?? {}
  const dataText = JSON.stringify(rawData, null, 2)

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

当前 Typst 模板代码：
\`\`\`typst
${typstContent}
\`\`\`

当前 mock_data：
\`\`\`json
${dataContent}
\`\`\``
}

const aiStreamErrorMessage = (error: unknown) => {
  const err = error as { message?: string; statusCode?: number; lastError?: { message?: string; statusCode?: number } }
  const statusCode = err?.statusCode ?? err?.lastError?.statusCode
  const message = err?.lastError?.message || err?.message || '上游服务异常'
  return statusCode
    ? `AI 请求失败（HTTP ${statusCode}）：${message}`
    : `AI 请求失败：${message}`
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

    const modelMessages = await convertToModelMessages(messages, {
      tools: clientTools,
      ignoreIncompleteToolCalls: true,
    })

    const requestScopedAIConfig = parseRequestScopedAIConfig(ai_config)
    const { providerType, model, apiMode, languageModel } = requestScopedAIConfig
      ? resolveModelFromConfig(requestScopedAIConfig)
      : resolveModelFromEnv(c.env)

    const templateContextSection = buildTemplateContextSection(context)

    const systemPrompt = `${TYPST_SYSTEM_PROMPT}

高频规则（只列最易错点）：
${TYPST_QUICK_RULES.map((rule, idx) => `${idx + 1}. ${rule}`).join('\n')}

约束：
1. Typst 字体、包解析与可用性以 typst-json-render 的编译结果为准，DeepPrint 不维护白名单。
2. 需要条码或二维码时可以使用 Typst 生态常见包；若编译失败，按错误信息最小改动修复。
3. 工具错误中若包含 line/column/snippet，优先围绕该位置最小改动修复。

当前上下文：
- template_id=${context?.template_id || 'unknown'}
- provider_type=${providerType}
- model=${model}
- api_mode=${apiMode}

${templateContextSection}`

    const runGenerate = (model: any) => streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: clientTools,
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
    .prepare('SELECT id, role, parts_json, created_at FROM ai_messages WHERE thread_id = ? ORDER BY created_at ASC')
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

  await db.prepare('DELETE FROM ai_messages WHERE thread_id = ?').bind(thread.id).run()
  for (const message of messages) {
    const role = typeof message.role === 'string' ? message.role : 'assistant'
    const parts = Array.isArray(message.parts) ? message.parts : []
    await db
      .prepare('INSERT INTO ai_messages (id, thread_id, role, parts_json) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), thread.id, role, JSON.stringify(parts))
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
