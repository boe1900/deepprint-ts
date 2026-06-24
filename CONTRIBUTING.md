# Contributing

感谢你愿意一起把 DeepPrint 做得更好。

这个项目目前仍处在 `alpha` 阶段，所以我们更看重：

- 清晰的问题复现
- 小步、可审阅的 PR
- 对现有行为的尊重，不做“大而全”的顺手重构

## 开始之前

1. 先读一遍 [README.md](./README.md)，确认本地环境能跑起来。
2. 如果你准备做较大的改动，先开 issue 或 discussion 对齐方向。
3. 如果只是修 bug、补文档、收口 lint，可以直接发 PR。

## 本地开发

```bash
npm ci
cp .env.example .env
cp .env.local.example .env.local
docker compose up -d db
npm run db:migrate
npm run dev:full
```

如果你只需要看前端界面，也可以用：

```bash
npm run dev
```

## 提交前检查

请至少执行：

```bash
npm run check
```

如果你的改动影响了以下内容，也请顺手补充说明：

- Typst 模板编辑逻辑
- AI prompt / tool 调用逻辑
- PostgreSQL schema 或 migration
- 登录流程

## PR 建议

- 一个 PR 尽量只解决一个问题
- 标题直接说明改动，例如“fix: render template preview” 或 “docs: rewrite README quick start”
- 描述里尽量包含动机、改动点、验证方式
- 如果改了 UI 或交互，附截图或录屏会很有帮助

## 代码风格

- 优先做小而明确的改动
- 不要顺手改无关文件
- 不要提交密钥或本地状态文件
- 目前仓库还在逐步收口规则；如果你发现某条 lint 规则与现状冲突，欢迎先提 issue 讨论

## 哪些贡献最有帮助

- 拆分过大的组件和路由文件
- 增加 smoke test
- 补示例模板与演示数据
- 提升本地全栈开发体验
- 改进文档和首次启动流程
