-- 试用期“成功成品生成”计次
-- 用于限制过去 24 小时内，用户通过 AI 成功产出的模板数量。
CREATE TABLE IF NOT EXISTS trial_generation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_trial_generation_events_user_created
  ON trial_generation_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trial_generation_events_user_template_created
  ON trial_generation_events(user_id, template_id, created_at DESC);
