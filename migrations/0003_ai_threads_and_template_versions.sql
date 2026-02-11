-- AI 会话（MVP：每个用户在每个模板下仅一条线程）
CREATE TABLE IF NOT EXISTS ai_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_threads_user_template
  ON ai_threads(user_id, template_id);

-- AI 消息记录
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  parts_json TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created
  ON ai_messages(thread_id, created_at);

-- 模板版本快照
CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  content TEXT NOT NULL,
  mock_data TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  summary TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_created
  ON template_versions(template_id, created_at DESC);
