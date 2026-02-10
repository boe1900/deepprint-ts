import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { createMiddleware } from 'hono/factory'
import { streamText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAuth } from '../lib/auth'

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

export const onRequest = handle(app)
