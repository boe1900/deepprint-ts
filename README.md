# DeepPrint TS

DeepPrint TS 是一个面向 Typst 模板生产的实验性工作台：你可以管理模板、编辑 mock data、实时预览编译结果，并用 AI 在当前上下文里协助修改模板。

项目状态：`alpha / experimental`

> 新开发路线已经切到 Docker + PostgreSQL + `typst-json-render` 渲染服务。详见 [DeepPrint TS Restart Plan V1](./docs/restart-plan-v1.md)、[Template Component Inline V1](./docs/template-component-inline-v1.md) 和 [DeepPrint Template Memory V1](./docs/template-memory-v1.md)。

## 它现在已经能做什么

- 管理业务分组与模板
- 在浏览器里编辑 Typst 模板与 JSON mock data
- 通过 `typst-json-render` 做服务端 PNG 预览和 PDF 导出
- 通过 AI 对话修改当前模板，并把成功应用的变更写回数据库
- 为模板保存 AI 会话和历史版本，支持回滚
- 运行在 Node/Hono + PostgreSQL 上

## 为什么开源

这个仓库更像“正在成长中的产品原型”，不是一个已经完全打磨好的 SaaS。它适合：

- 想研究 Typst 在线编辑器怎么做
- 想做垂直文档/票据/标签/条码模板工具
- 想把 AI 编辑体验接进现有模板系统
- 想用 Docker + PostgreSQL 快速搭一个 AI 模板产品原型

如果你期待的是一个稳定、抽象完善、接口长期兼容的框架，这个项目现在还没到那个阶段。

## 技术栈

- React 19 + Vite + TypeScript
- Hono + Node server
- PostgreSQL
- Better Auth（GitHub 登录）
- `typst-json-render` 渲染服务
- AI SDK（Google 与 OpenAI-compatible provider）

## 快速开始

### 1. 准备依赖

- Node.js 20+
- npm 10+
- Docker（推荐用于本地 PostgreSQL）
- 一个可用的 GitHub OAuth App
- 如果你要调试“服务端默认 AI”模式，需要一个可用的 AI provider key

### 2. 安装依赖

```bash
npm ci
```

DeepPrint TS 不下载 Typst Universe 包，也不内置 Typst 字体/插件资产；这些都由 `typst-json-render` 渲染服务负责解析。

### 3. 配置环境变量

复制示例文件：

```bash
cp .env.example .env
cp .env.local.example .env.local
```

然后按需填写：

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `AI_PROVIDER_TYPE`（可选，仅服务端默认 AI 模式需要）
- `AI_API_KEY`（可选，仅服务端默认 AI 模式需要）
- `AI_BASE_URL`（可选，仅 OpenAI-compatible provider 需要）
- `AI_MODEL`（可选）
- `AI_API_MODE`（可选）
- `TJR_RENDER_BASE_URL`（必填，指向本地或远程 `typst-json-render` 服务）
- `TJR_RENDER_API_KEY`（可选，对应 render 服务的 Bearer token）
- `TRIAL_LIMIT_ENABLED`（可选，开启试用成品额度限制）
- `TRIAL_SUCCESSFUL_GENERATIONS_PER_24H`（可选）
- `TRIAL_SUCCESSFUL_GENERATION_DEDUP_MINUTES`（可选）
- `TRIAL_LIMIT_EXEMPT_EMAILS`（可选）

说明：

- `.env` 给 Docker 使用，`.env.local` 给本机 `npm run ...` 覆盖本地地址。
- `BETTER_AUTH_URL` 不填也可以；本地开发时会从请求 URL 自动推断。
- 现在默认推荐使用“本地用户 Key”模式：用户在浏览器里自行配置 Gemini 或 OpenAI-compatible 的 `API Key`，配置只保存在当前浏览器。
- 如果只想体验模板编辑和预览，不使用 AI，可以不填 AI 相关变量。
- 如果你想保留一个“服务端默认 AI”兜底，也可以继续填写 AI 环境变量。

### 4. 初始化 PostgreSQL

推荐直接用 Docker 启动数据库，首次启动会自动执行 `migrations-postgres/`：

```bash
cp .env.example .env
docker compose up db
```

如果你不用 Docker，也可以手动创建 PostgreSQL 数据库后执行 `migrations-postgres/0001_initial.sql`。

### 5. 启动开发环境

只跑前端界面：

```bash
npm run dev
```

跑完整前后端（推荐）：

```bash
npm run dev:full
```

Docker 方式：

```bash
cp .env.example .env
docker compose up
```

当前 `docker-compose.yml` 只启动 DeepPrint Web 和 PostgreSQL。`typst-json-render` 仍需单独启动，并让 `TJR_RENDER_BASE_URL` 指向它。

本地接口冒烟可以临时设置 `DEEPPRINT_DEV_AUTH=true`，再用 `x-deepprint-dev-user-id` 请求头模拟登录用户。不要在生产环境开启。

服务启动后可跑：

```bash
npm run smoke
```

可用脚本：

- `npm run dev`：前端开发模式
- `npm run dev:full`：构建后启动 Node/Hono 完整应用
- `npm run lint`：运行 ESLint
- `npm run build`：类型检查并打包
- `npm run check`：执行 lint + build
- `npm run smoke`：对 Node API、PostgreSQL、render 服务做最小冒烟

## 环境变量

### 本地用户 Key

- 前端提供本地 AI 设置弹窗，当前支持 `Gemini` 与 `OpenAI-compatible`
- 用户配置会保存在浏览器 `localStorage`
- 发起 `/api/generate` 时，配置只会随当前请求临时传给服务端使用，不会写入数据库
- 如果你完全不想提供服务端默认 AI，可以不设置下面的 AI 环境变量

### 通用 AI 配置

- `AI_PROVIDER_TYPE`：`google | openai`
- `AI_API_KEY`：`google/openai` 必填
- `AI_BASE_URL`：`openai` 必填，例如 DeepSeek / GLM / Ark 的兼容接口地址
- `AI_MODEL`：可选，默认 `google: gemini-flash-latest`，`openai: gpt-4o-mini`
- `AI_API_MODE`：仅 `openai` 生效，`chat | responses`，默认 `chat`

### Render 服务

- `TJR_RENDER_BASE_URL`：`typst-json-render` 服务地址，例如 `http://127.0.0.1:8000`
- `TJR_RENDER_API_KEY`：可选。如果 render 服务配置了 API key，这里填写同一个 token

### 兼容字段

- `AI_PROVIDER`：`AI_PROVIDER_TYPE` 的兼容别名
- `GOOGLE_GENERATIVE_AI_API_KEY`：`google` 的备用 key 来源

### 登录相关

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`：可选

### 试用额度限制

- `TRIAL_LIMIT_ENABLED`：`true | false`，默认关闭
- `TRIAL_SUCCESSFUL_GENERATIONS_PER_24H`：过去 24 小时内允许成功生成的成品模板数量，默认 `5`
- `TRIAL_SUCCESSFUL_GENERATION_DEDUP_MINUTES`：同一模板在这个时间窗口内重复 AI 成功应用，只记一次成品，默认 `30`
- `TRIAL_LIMIT_EXEMPT_EMAILS`：逗号分隔的邮箱白名单，这些账号不受试用额度限制

说明：

- 这套限制按“成功产出成品”计，不按 `/api/generate` 请求次数计。
- 只有 AI 成功应用并写回模板时才会计数。
- 同一模板在短时间内连续小修不会反复扣次数。

## Provider 示例

本地用户 Key 推荐配置：

Gemini：

- `provider_type=google`
- `model=gemini-flash-latest`

OpenAI-compatible：

- `provider_type=openai`
- `base_url=https://api.openai.com/v1`
- `model=gpt-4o-mini`
- `api_mode=chat`

服务端默认 AI 环境变量示例：

Google：

```env
AI_PROVIDER_TYPE=google
AI_API_KEY=your_google_key
AI_MODEL=gemini-flash-latest
```

DeepSeek（OpenAI-compatible）：

```env
AI_PROVIDER_TYPE=openai
AI_API_KEY=your_deepseek_key
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AI_API_MODE=chat
```

GLM（OpenAI-compatible）：

```env
AI_PROVIDER_TYPE=openai
AI_API_KEY=your_glm_key
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
AI_MODEL=glm-4.7
AI_API_MODE=chat
```

## 当前项目结构

```text
src/                    前端应用
functions/              Hono API 源码
server/                 Node server 与 PostgreSQL 适配
migrations-postgres/    PostgreSQL schema
```

## 当前限制

- 项目仍以单体文件为主，部分核心逻辑还需要继续拆分
- 自动化测试覆盖仍然很少
- AI 编辑能力目前针对中文 Typst 模板场景做了较多提示词约束
- Anthropic 暂未接入；需要时再安装并使用官方 `@ai-sdk/anthropic`
- `npm run dev:full` 目前是“先构建再启动”的模式，还不是完整热更新工作流

## 路线图

- [ ] 拆分过大的前后端入口文件
- [ ] 补充最小 smoke test 与关键流程回归测试
- [ ] 增加更多示例模板
- [ ] 改善本地全栈开发体验
- [ ] 支持更多 AI provider
- [ ] 抽出更清晰的模板编辑与编译服务层

## 贡献

欢迎提 issue 和 PR。开始之前建议先看 [CONTRIBUTING.md](./CONTRIBUTING.md)。

适合的首批贡献方向：

- 修复 lint / 类型问题
- 拆分 `src/App.tsx` 和 `functions/api/[[route]].ts`
- 改进本地开发与部署文档
- 增加示例模板和演示数据
- 为模板 CRUD / 版本回滚补充测试

## License

MIT，见 [LICENSE](./LICENSE)。
