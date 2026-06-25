# DeepPrint Template Memory V1

Template Memory 是 DeepPrint 让 AI “越用越好”的产品层能力。

它从 `typst-json-render` 迁移到 `deepprint-ts` 实现。原因很简单：Memory 需要用户、模板、会话、采纳、共享、搜索和权限，这些都是产品态能力；`typst-json-render` 继续只负责 TemplateBundle 校验、Typst 编译和诊断返回。

## 1. 目标

用户每完成并采纳一个好模板，后续相似需求就不再从零开始。

目标链路：

```text
用户提出模板需求
-> DeepPrint 搜索该用户的已采纳 Memory
-> 必要时搜索共享 Memory
-> 选择一个最接近的 anchor case
-> AI 基于当前模板 + anchor case 生成 TemplateBundle
-> typst-json-render 编译校验
-> 用户确认效果
-> DeepPrint 将最终结果沉淀为新的 Memory case
```

这不是让 Rust 变聪明，而是让 DeepPrint 在调用 AI 前给它更好的上下文。

## 2. 所属边界

`deepprint-ts` 负责：

- 用户与 workspace 作用域
- Memory case 的保存、搜索、权限
- AI prompt 注入 Memory 上下文
- 用户采纳与共享动作
- 平台方 promotion 审核

`typst-json-render` 负责：

- `validate_template_bundle_files`
- `compile_template_bundle_files`
- PNG/PDF artifact 输出
- Typst 编译错误和行列诊断
- 渲染安全边界

Memory 不进入 Rust runtime。

## 3. 三层 Memory

### Private Memory

用户私有的已采纳案例，只对该用户可检索。

这是第一版的重点。它直接决定“我越用越顺”。

### Shared Memory

用户主动发布出来的案例。发布不是自动行为，需要用户确认。

远程产品形态下，数据本来就在 DeepPrint 服务端，所以“共享”不是重新上传，而是一次授权与审核动作。

### Official Assets / Promotion

平台方从多个高质量案例中提炼出的 starter、组件或 `core-v1.typ` 能力。

Promotion 不是用户自动触发，也不是 AI 自动合并。AI 可以给建议，最终由项目方确认、命名、版本化和回归编译。

## 4. 第一版存储

DeepPrint 已经使用 PostgreSQL，所以 V1 直接用 PostgreSQL 做 Memory 的事实来源和搜索入口。

不引入向量库，不要求 embedding 模型。

旧设计里 Tantivy 的职责是“本地全文搜索索引”。迁移到 DeepPrint 后，V1 用 PostgreSQL 承担这个职责：

- `pg_trgm`：负责标题、摘要、prompt、feedback 的模糊匹配和相似度排序
- 数组 GIN index：负责 `tags`、`aliases` 过滤
- 普通 btree index：负责 `user_id`、`visibility`、`status`、`document_type` 过滤

不要一开始就用 `tsvector` 作为主搜索方案。PostgreSQL full-text search 对中文分词不够自然，而 DeepPrint 的检索更依赖明确的 `document_type`、`tags`、`aliases` 和短文本相似度。`pg_trgm + 结构化字段` 更简单，也更贴近第一版需求。

推荐新增表：

```sql
CREATE TABLE template_memory_cases (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source_template_id text REFERENCES templates(id) ON DELETE SET NULL,
  source_version_id text REFERENCES template_versions(id) ON DELETE SET NULL,

  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'shared', 'official')),
  status text NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'archived')),

  title text NOT NULL,
  document_type text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  aliases text[] NOT NULL DEFAULT '{}',

  memory_text text NOT NULL DEFAULT '',
  prompt_text text NOT NULL DEFAULT '',
  feedback_text text NOT NULL DEFAULT '',
  files_json jsonb NOT NULL,
  preview_artifact_url text,

  usage_count integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint,
  updated_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint
);

CREATE INDEX idx_template_memory_private
  ON template_memory_cases(user_id, status, updated_at DESC);

CREATE INDEX idx_template_memory_visibility
  ON template_memory_cases(visibility, status, updated_at DESC);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_template_memory_title_trgm
  ON template_memory_cases USING gin (title gin_trgm_ops);

CREATE INDEX idx_template_memory_text_trgm
  ON template_memory_cases USING gin (memory_text gin_trgm_ops);

CREATE INDEX idx_template_memory_prompt_trgm
  ON template_memory_cases USING gin (prompt_text gin_trgm_ops);

CREATE INDEX idx_template_memory_tags
  ON template_memory_cases USING gin (tags);

CREATE INDEX idx_template_memory_aliases
  ON template_memory_cases USING gin (aliases);
```

搜索第一版可以先用 PostgreSQL 文本查询：

- `document_type` 精确/近似匹配
- `tags` / `aliases` 匹配
- `title` / `memory_text` / `prompt_text` / `feedback_text` 关键词匹配
- 中文场景优先依赖 tags、aliases、document_type，必要时再加 `pg_trgm`

推荐排序：

```text
scope filter:
  private: user_id = current_user
  shared/official: visibility IN ('shared', 'official')
  status = accepted

score:
  document_type match +3
  tags overlap +2
  aliases overlap +2
  title similarity +1
  memory_text similarity +1
  prompt_text similarity +0.5
  usage_count small boost
```

V1 不需要精确复刻 BM25。只要能稳定找到“最像的已采纳案例”，就足够支撑 anchor case 生成。

后续如果搜索质量或规模真的不够，再替换为 Meilisearch、Tantivy 服务或向量检索。不要一开始就上两套。

## 5. Memory Case 内容

一个 case 存的是“最终可复用结果”，不是每次失败尝试。

建议内容：

- `files_json`：最终 TemplateBundle 文件映射
- `memory_text`：给搜索和 AI 阅读的摘要
- `prompt_text`：用户原始需求或整理后的需求
- `feedback_text`：用户关键修改意见
- `document_type`：如 `receipt`、`invitation`、`exam-paper`
- `tags`：如 `58mm`、`中文`、`二维码`、`餐饮`
- `aliases`：如 `小票`、`点单单`、`收据`
- `preview_artifact_url`：最终预览图引用，可为空

`memory_text` 示例：

```md
# 肯德基点单小票

document_type: receipt
aliases: 小票, 点单单, 快餐收据, KFC receipt
tags: 58mm, 中文, 二维码, 餐饮, 明细列表
good_for: 快餐点单, 外卖小票, 餐饮收据
avoid: A4 文档, 请帖, 试卷
summary: 58mm 中文点单小票，包含品牌标题、商品明细、合计金额、二维码和简单图标。
```

## 6. 采纳规则

AI 成功编译不等于进入 Memory。

推荐规则：

```text
AI 生成并编译通过
-> 用户看到预览
-> 用户点击“保存/采纳为案例”
-> DeepPrint 创建 immutable memory case
-> 后续检索可用
```

原因：

- 编译通过只说明语法没错，不说明设计好
- 用户采纳才是质量信号
- Memory 只存好东西，避免越用越乱

如果同一个模板后续继续修改并再次采纳，创建新的 memory case。旧 case 不覆盖，最多归档。

## 7. 检索规则

在 `/api/generate` 调用 AI 前做检索。

推荐顺序：

1. 搜索当前用户 Private Memory
2. 如果结果弱，再搜索 Shared/Official Memory
3. 返回 1 个 full anchor case
4. 额外返回 0-2 个 summary-only reference cases
5. 注入 prompt 时明确：只能 fork 一个 anchor，不要拼多个完整模板

不要把多个完整 `template.typ` 全塞给 AI。那会诱发模板缝合，质量反而下降。

Memory 注入结构：

```json
{
  "anchor_case": {
    "id": "mem_kfc_receipt_001",
    "title": "肯德基点单小票",
    "document_type": "receipt",
    "memory_text": "...",
    "files_json": {
      "manifest.json": "...",
      "template.typ": "...",
      "data.json": "...",
      "data.schema.json": "..."
    }
  },
  "reference_cases": [
    {
      "id": "mem_fast_food_receipt_002",
      "title": "快餐点单小票",
      "memory_text": "..."
    }
  ]
}
```

如果没有强相关结果，就不注入 anchor。宁可从当前模板出发，也不要硬套错案例。

## 8. AI 工作流接入点

当前 DeepPrint 已经有：

```text
Browser ChatPanel
-> /api/generate
-> AI SDK streamText
-> frontend tool update_template_bundle
-> typst-json-render compile
-> tool result steps
-> AI 自动修复或完成
```

Memory 接入点应该在 `/api/generate` 构造 prompt 之前：

```text
receive user message + current template context
-> build memory search query
-> search template_memory_cases
-> build memory_context
-> streamText(messages, tools, memory_context)
```

`update_template_bundle` 工具不需要知道 Memory。它只负责应用和校验 TemplateBundle。

## 9. Identity 规则

DeepPrint 里已经有 `templates.id`，所以不用再照搬旧文档里的 `templateId` 设计。

规则改成：

- 正在编辑的模板身份是 `templates.id`
- AI 会话绑定当前 `template_id`
- Memory case 是已采纳快照，身份是 `template_memory_cases.id`
- Memory case immutable，不作为正在编辑的模板
- 如果用户基于某个 Memory 继续编辑，先 fork 到一个普通 template，再按普通模板流程走

这样用户不会困惑 “accepted 后为什么又被改了”。

## 10. Shared Memory

共享是显式动作：

```text
private memory case
-> 用户点击发布
-> 平台审核
-> visibility = shared
-> 其他用户可被检索到
```

共享内容应以模板设计为核心，使用合成示例数据。用户如果没有主动发布，任何 private case 都不能进入 shared 检索。

第一版可以先不做审核后台，只保留字段与产品入口设计；真正开放共享前再补审核流。

## 11. Promotion

Promotion 是平台方行为，不是普通用户行为。

证据规则：

- 一个好案例：留在 case
- 两三个相似好案例：考虑提取 bundle-local helper
- 多个领域反复出现：考虑进入 official starter 或 shared component
- QR/barcode 这种底层能力：继续留在 `typst-json-render` 或受控组件库边界内

Promotion 必须满足：

1. 只从 accepted cases 提取
2. 保留原始 cases 不变
3. 新组件命名和版本化
4. 至少用一个旧 case 和一个新 case 编译回归
5. 项目方确认后才进入 official assets

## 12. 第一版开发顺序

最短可落地路径：

1. 新增 `template_memory_cases` 表
2. 增加“采纳为案例”动作，从当前 template/version 生成 memory case
3. 写一个内部 `searchTemplateMemory(userId, query)` 服务
4. 在 `/api/generate` 前检索 private memory，注入 top anchor
5. 在 prompt 中加入 anchor rule
6. 记录 `usage_count`，观察哪些 case 真被复用
7. 再做 shared publishing
8. 最后做 promotion/admin 能力

第一版不用做：

- embedding
- RAG 框架
- 自动 promotion
- 多检索引擎
- Memory 进入 Rust

## 13. 判断是否有效

这个系统是否值得继续做，看三个指标：

- 相似需求首次编译通过率是否提升
- 用户微调轮数是否减少
- 被复用的 memory case 是否集中在少数高质量案例上

如果 Memory 只是堆案例但没有提升生成质量，就应该先改采纳规则和搜索摘要，而不是上更复杂的数据库。
