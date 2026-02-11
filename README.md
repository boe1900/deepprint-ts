# DeepPrint TS

## 模型配置说明

当前 `/api/generate` 已支持多模型提供方，且采用**严格模式**：
- 选择哪个 provider/model，就只调用哪个。
- 不会自动回退到其他模型。

## 支持的 Provider

- `google`（Gemini）
- `glm`（通过 OpenAI-compatible 接口接入）

## 环境变量

通用：
- `AI_PROVIDER`：`google` 或 `glm`
- `AI_MODEL`：可选，通用模型名（优先级最高）

Google：
- `GOOGLE_GENERATIVE_AI_API_KEY`：必填（当 `AI_PROVIDER=google`）
- `GOOGLE_MODEL`：可选，默认 `gemini-flash-latest`

GLM：
- `GLM_API_KEY`：必填（当 `AI_PROVIDER=glm`）
- `GLM_BASE_URL`：可选，默认 `https://open.bigmodel.cn/api/paas/v4/`
- `GLM_MODEL`：可选，默认 `glm-4.5`（建议显式配置为你要的版本，如 `glm-4.7`）

## 模型选择优先级

后端实际使用模型时，优先级如下：
1. 请求体 `context.model`
2. `AI_MODEL`
3. Provider 专属模型变量（`GOOGLE_MODEL` 或 `GLM_MODEL`）
4. 默认值（Google: `gemini-flash-latest`，GLM: `glm-4.5`）

Provider 选择优先级：
1. 请求体 `context.provider`
2. `AI_PROVIDER`
3. 默认 `google`

## 示例配置

Google：

```env
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
GOOGLE_MODEL=gemini-flash-latest
```

GLM（例如 4.7）：

```env
AI_PROVIDER=glm
GLM_API_KEY=your_glm_key
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
GLM_MODEL=glm-4.7
```

## 常见问题

- 报错“未配置 GLM_API_KEY”：说明当前选择了 GLM，但没有配置 `GLM_API_KEY`。
- 报错“未配置 GOOGLE_GENERATIVE_AI_API_KEY”：说明当前选择了 Google，但没有配置 Google Key。
- 想临时切模型：改 `AI_PROVIDER` 和对应模型变量，重启服务即可。

## AI 会话与版本回滚（MVP）

已支持：
- 按模板维度持久化 AI 会话（D1）
- 模板版本快照与回滚（D1）

### 数据表

- `ai_threads`：每个 `user_id + template_id` 一条线程
- `ai_messages`：线程消息（保存 `role + parts_json`）
- `template_versions`：模板快照（`content + mock_data + source + summary`）

### 触发规则

- 手动保存模板会自动写入 `template_versions`（`source=manual`）
- AI 应用并编译成功后会自动写入 `template_versions`（`source=ai`）
- 回滚操作会再写入一条 `template_versions`（`source=rollback`）
- 若内容与最近版本完全一致，会跳过重复快照

### 相关 API

- `GET /api/templates/:id/ai-thread`
- `PUT /api/templates/:id/ai-thread/messages`
- `GET /api/templates/:id/versions?limit=30`
- `POST /api/templates/:id/versions/:versionId/restore`
