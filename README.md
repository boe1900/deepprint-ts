# DeepPrint TS

## 模型配置说明

当前 `/api/generate` 已支持多模型提供方，且采用**严格模式**：
- 选择哪个 provider/model，就只调用哪个。
- 不会自动回退到其他模型。

## 支持的 Provider Type

- `google`（Gemini）
- `openai`（任何 OpenAI-compatible 平台，如 GLM / DeepSeek / Ark Coding Plan）
- `anthropic`（预留类型，当前构建未启用 SDK 适配）

## 环境变量

通用（推荐统一使用这一套）：
- `AI_PROVIDER_TYPE`：`google | openai | anthropic`
- `AI_API_KEY`：`google/openai` 必填
- `AI_BASE_URL`：`openai` 必填（例如 GLM/DeepSeek/Ark 的兼容地址）
- `AI_MODEL`：可选，默认 `google: gemini-flash-latest`，`openai: gpt-4o-mini`
- `AI_API_MODE`：仅 `openai` 生效，`chat | responses`，默认 `chat`

兼容过渡：
- `AI_PROVIDER` 可作为 `AI_PROVIDER_TYPE` 的别名（仅过渡期建议）
- `GOOGLE_GENERATIVE_AI_API_KEY` 可作为 `google` 的备用 key 来源

## 模型选择优先级

后端实际使用模型时，优先级如下：
1. `AI_MODEL`
2. 默认值（`google: gemini-flash-latest`，`openai: gpt-4o-mini`）

Provider 选择优先级：
1. `AI_PROVIDER_TYPE`
2. `AI_PROVIDER`（兼容别名）
3. 默认 `google`

## 示例配置

Google：

```env
AI_PROVIDER_TYPE=google
AI_API_KEY=your_google_key
AI_MODEL=gemini-flash-latest
```

GLM（OpenAI-compatible）：

```env
AI_PROVIDER_TYPE=openai
AI_API_KEY=your_glm_key
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
AI_MODEL=glm-4.7
AI_API_MODE=chat
```

DeepSeek（OpenAI-compatible）：

```env
AI_PROVIDER_TYPE=openai
AI_API_KEY=your_deepseek_key
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AI_API_MODE=chat
```

## 常见问题

- 报错“未配置 AI_API_KEY”：说明当前 provider 需要统一 key 变量。
- 报错“未配置 AI_BASE_URL”：说明当前 `AI_PROVIDER_TYPE=openai` 但缺少兼容接口地址。
- 想临时切模型：改 `AI_PROVIDER_TYPE / AI_BASE_URL / AI_MODEL`，重启服务即可。

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
