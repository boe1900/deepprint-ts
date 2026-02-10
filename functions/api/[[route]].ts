import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { createMiddleware } from 'hono/factory'
import { streamText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAuth } from '../lib/auth'
import { D1Database } from '@cloudflare/workers-types'

type Bindings = {
  deepprint_auth: D1Database
  GOOGLE_GENERATIVE_AI_API_KEY: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
}

type Variables = {
  session: { user: { id: string; name: string; email: string; image?: string | null } }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath('/api')

// 鉴权中间件 - 需要登录的路由加上 requireAuth 即可
const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
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

const TYPST_SYSTEM_PROMPT = `你是一个 Typst 排版专家。请根据用户的需求生成 Typst 代码。

## 重要规则：
1. **必须使用 Markdown 代码块格式**：所有 Typst 代码必须包裹在 \`\`\`typst ... \`\`\` 代码块中
2. 数据通过 \`data\` 变量注入（已预定义），直接使用 \`data.xxx\` 访问
3. 使用中文注释解释关键部分
4. 遵循 Typst 最佳实践，使用 #set 和 #show 规则定义样式
5. 对于小票/收据，使用 #set page(width: 80mm, height: auto) 设置页面尺寸
6. 对于 A4 文档，使用 #set page(paper: "a4")

## 输出格式（必须遵守）：
\`\`\`typst
// 你的 Typst 代码在这里
\`\`\`

## 示例模板（收据）：
\`\`\`typst
// 页面设置：80mm 热敏小票
#set page(width: 80mm, height: auto, margin: 5mm)
#set text(font: ("Noto Sans SC", "Arial"), size: 10pt)

// 店铺名称
#align(center)[
  #text(size: 14pt, weight: "bold")[#data.store_name]
]

#line(length: 100%, stroke: 0.5pt)

// 商品列表
#for item in data.items [
  #grid(
    columns: (1fr, auto),
    [#item.name],
    [¥#item.price]
  )
]

#line(length: 100%, stroke: 0.5pt)

// 合计
#align(right)[
  #text(weight: "bold")[合计: ¥#data.total]
]
\`\`\`

现在，请根据用户的需求生成 Typst 代码。记住：**必须使用 \`\`\`typst 代码块包裹输出**。`

// 健康检查端点
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// AI 生成端点
app.post('/generate', requireAuth, async (c) => {
  try {

    const { messages } = await c.req.json()

    const google = createGoogleGenerativeAI({
      apiKey: c.env.GOOGLE_GENERATIVE_AI_API_KEY,
    })

    // 将 UI 消息 (parts 格式) 转换为模型消息格式 (content 格式)
    const modelMessages = messages.map((msg: { role: string; parts?: { type: string; text: string }[]; content?: string }) => {
      // 从 parts 数组提取文本内容
      const content = msg.parts
        ?.filter(part => part.type === 'text')
        .map(part => part.text)
        .join('') || msg.content || ''

      return {
        role: msg.role as 'user' | 'assistant',
        content,
      }
    })

    const result = streamText({
      model: google('gemini-flash-latest'),
      system: TYPST_SYSTEM_PROMPT,
      messages: modelMessages,
    })

    return result.toUIMessageStreamResponse()
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
    .all()

  const templates = await db
    .prepare('SELECT id, folder_id, name, status, updated_at FROM templates WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(userId)
    .all()

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

  await db
    .prepare('INSERT INTO folders (id, user_id, name) VALUES (?, ?, ?)')
    .bind(id, userId, name.trim())
    .run()

  return c.json({ id, name: name.trim(), sort_order: 0 }, 201)
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

  await db
    .prepare('UPDATE folders SET name = ? WHERE id = ? AND user_id = ?')
    .bind(body.name.trim(), folderId, userId)
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
    .first()

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

  await db
    .prepare('INSERT INTO templates (id, folder_id, user_id, name) VALUES (?, ?, ?, ?)')
    .bind(id, folder_id, userId, name.trim())
    .run()

  return c.json({ id, folder_id, name: name.trim(), status: 'draft', updated_at: Math.floor(Date.now() / 1000) }, 201)
})

// GET /templates/:id — 获取单个模版详情（含 content 和 mock_data）
app.get('/templates/:id', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const templateId = c.req.param('id')
  const db = c.env.deepprint_auth

  const result = await db
    .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first()

  if (!result) return c.json({ error: '模版不存在' }, 404)

  // mock_data 存储为 JSON 字符串，返回时解析
  let mockData: Record<string, unknown> = {}
  try {
    mockData = JSON.parse((result.mock_data as string) || '{}')
  } catch {
    mockData = {}
  }

  return c.json({ ...result, mock_data: mockData })
})

// PUT /templates/:id — 更新模版
app.put('/templates/:id', requireAuth, async (c) => {
  const userId = (c.get('session') as any).user.id
  const templateId = c.req.param('id')
  const body = await c.req.json<{
    name?: string
    content?: string
    mock_data?: Record<string, unknown>
    status?: string
  }>()
  const db = c.env.deepprint_auth

  // 检查模版存在且属于当前用户
  const existing = await db
    .prepare('SELECT id FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .first()

  if (!existing) return c.json({ error: '模版不存在' }, 404)

  // 动态构建 SET 子句
  const sets: string[] = []
  const values: (string | number)[] = []

  if (body.name !== undefined) { sets.push('name = ?'); values.push(body.name) }
  if (body.content !== undefined) { sets.push('content = ?'); values.push(body.content) }
  if (body.mock_data !== undefined) { sets.push('mock_data = ?'); values.push(JSON.stringify(body.mock_data)) }
  if (body.status !== undefined) { sets.push('status = ?'); values.push(body.status) }

  if (sets.length === 0) return c.json({ error: '没有需要更新的字段' }, 400)

  sets.push('updated_at = ?')
  values.push(Math.floor(Date.now() / 1000))

  values.push(templateId, userId)

  await db
    .prepare(`UPDATE templates SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run()

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

  await db
    .prepare('DELETE FROM templates WHERE id = ? AND user_id = ?')
    .bind(templateId, userId)
    .run()

  return c.json({ success: true })
})

export const onRequest = handle(app)
