# DeepPrint TS

DeepPrint TS 是一个面向 Typst 模板生产的实验性工作台：你可以管理模板、编辑 mock data、实时预览编译结果，并用 AI 在当前上下文里协助修改模板。

项目状态：`alpha / experimental`

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
- 一个可用的 AI provider key（如果你要用 AI 编辑能力）

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
- `AI_PROVIDER_TYPE`
- `AI_API_KEY`
- `AI_BASE_URL`（仅 OpenAI-compatible provider 需要）
- `AI_MODEL`
- `AI_API_MODE`

说明：

- `BETTER_AUTH_URL` 不填也可以；本地开发时会从请求 URL 自动推断。
- 如果只想体验模板编辑和预览，不使用 AI，可以先不填 AI 相关变量。

### 4. 初始化本地 D1

本项目目前提供的是 SQL migration 文件，按顺序执行即可：

```bash
wrangler d1 execute deepprint-auth --local --file=./migrations/0001_auth.sql
wrangler d1 execute deepprint-auth --local --file=./migrations/0002_deepprint_schema.sql
wrangler d1 execute deepprint-auth --local --file=./migrations/0003_ai_threads_and_template_versions.sql
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

### 通用 AI 配置

- `AI_PROVIDER_TYPE`：`google | openai | anthropic`
- `AI_API_KEY`：`google/openai` 必填
- `AI_BASE_URL`：`openai` 必填，例如 DeepSeek / GLM / Ark 的兼容接口地址
- `AI_MODEL`：可选，默认 `google: gemini-flash-latest`，`openai: gpt-4o-mini`
- `AI_API_MODE`：仅 `openai` 生效，`chat | responses`，默认 `chat`

### 兼容字段

- `AI_PROVIDER`：`AI_PROVIDER_TYPE` 的兼容别名
- `GOOGLE_GENERATIVE_AI_API_KEY`：`google` 的备用 key 来源

### 登录相关

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`：可选

## Provider 示例

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
