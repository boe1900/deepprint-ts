# DeepPrint TS

DeepPrint TS 是一个面向 Typst 模板生产的实验性工作台：你可以管理模板、编辑 mock data、实时预览编译结果，并用 AI 在当前上下文里协助修改模板。

项目状态：`alpha / experimental`

> 新开发路线已经切到 Docker + PostgreSQL + `typst-json-render` 渲染服务。旧的 Cloudflare/D1/浏览器 Typst 编译路径会被替换。详见 [DeepPrint TS Restart Plan V1](./docs/restart-plan-v1.md)。

## 它现在已经能做什么

- 管理业务分组与模板
- 在浏览器里编辑 Typst 模板与 JSON mock data
- 使用 Typst Web 编译器做实时预览
- 通过 AI 对话修改当前模板，并把成功应用的变更写回数据库
- 为模板保存 AI 会话和历史版本，支持回滚
- 运行在 Cloudflare Pages Functions + D1 上

## 为什么开源

这个仓库更像“正在成长中的产品原型”，不是一个已经完全打磨好的 SaaS。它适合：

- 想研究 Typst 在线编辑器怎么做
- 想做垂直文档/票据/标签/条码模板工具
- 想把 AI 编辑体验接进现有模板系统
- 想在 Cloudflare Pages + D1 上快速搭一个全栈应用

如果你期待的是一个稳定、抽象完善、接口长期兼容的框架，这个项目现在还没到那个阶段。

## 技术栈

- React 19 + Vite + TypeScript
- Hono + Cloudflare Pages Functions
- Cloudflare D1
- Better Auth（GitHub 登录）
- Typst Web Compiler / Renderer
- AI SDK（Google 与 OpenAI-compatible provider）

## 快速开始

### 1. 准备依赖

- Node.js 20+
- npm 10+
- Wrangler 4（`npm ci` 会自动安装本地版本）
- 一个可用的 GitHub OAuth App
- 如果你要调试“服务端默认 AI”模式，需要一个可用的 AI provider key

### 2. 安装依赖

```bash
npm ci
```

`npm run dev` 和 `npm run build` 会自动执行 `npm run sync`，从 `typst-packages.json` 下载所需的 Typst Universe 包。如果你是第一次 clone，这一步需要联网。

### 3. 配置环境变量

复制示例文件：

```bash
cp .dev.vars.example .dev.vars
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

- `BETTER_AUTH_URL` 不填也可以；本地开发时会从请求 URL 自动推断。
- 现在默认推荐使用“本地 BYOK”模式：用户在浏览器里自行配置 Gemini 或 OpenAI-compatible 的 `API Key`，配置只保存在当前浏览器。
- 如果只想体验模板编辑和预览，不使用 AI，可以不填 AI 相关变量。
- 如果你想保留一个“服务端默认 AI”兜底，也可以继续填写 AI 环境变量。

### 4. 初始化本地 D1

本项目目前提供的是 SQL migration 文件，按顺序执行即可：

```bash
wrangler d1 execute deepprint-auth --local --file=./migrations/0001_auth.sql
wrangler d1 execute deepprint-auth --local --file=./migrations/0002_deepprint_schema.sql
wrangler d1 execute deepprint-auth --local --file=./migrations/0003_ai_threads_and_template_versions.sql
wrangler d1 execute deepprint-auth --local --file=./migrations/0004_trial_generation_limits.sql
wrangler d1 execute deepprint-auth --local --file=./migrations/0005_template_bundle_files.sql
```

如果你准备部署自己的实例，请把 `wrangler.toml` 里的 D1 配置替换成你自己的数据库信息。

### 5. 启动开发环境

只跑前端界面：

```bash
npm run dev
```

跑完整前后端（推荐）：

```bash
npm run dev:full
```

可用脚本：

- `npm run dev`：前端开发模式
- `npm run dev:full`：构建后用 Wrangler 启动完整应用
- `npm run lint`：运行 ESLint
- `npm run build`：同步 Typst 包、类型检查并打包
- `npm run check`：执行 lint + build
- `npm run deploy`：部署到 Cloudflare Pages

## 环境变量

### 本地 BYOK

- 前端提供本地 AI 设置弹窗，当前支持 `Gemini` 与 `OpenAI-compatible`
- 用户配置会保存在浏览器 `localStorage`
- 发起 `/api/generate` 时，配置只会随当前请求临时传给服务端使用，不会写入数据库
- 如果你完全不想提供服务端默认 AI，可以不设置下面的 AI 环境变量

### 通用 AI 配置

- `AI_PROVIDER_TYPE`：`google | openai | anthropic`
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

本地 BYOK 推荐配置：

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
functions/              Cloudflare Pages Functions API
migrations/             D1 schema 与迁移脚本
scripts/update-universe.mjs
public/fonts/           Typst 预览需要的字体资源
typst-packages.json     需要同步的 Typst Universe 包清单
```

## 当前限制

- 项目仍以单体文件为主，部分核心逻辑还需要继续拆分
- 自动化测试覆盖仍然很少
- AI 编辑能力目前针对中文 Typst 模板场景做了较多提示词约束
- `anthropic` provider 只保留了类型入口，尚未接入 SDK
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
