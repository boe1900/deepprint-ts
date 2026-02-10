-- 1. 业务分组表
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,           -- 建议使用 nanoid
  user_id TEXT NOT NULL,         -- 归属用户
  name TEXT NOT NULL,            -- 分组名称
  sort_order INTEGER DEFAULT 0,  -- 排序权重
  created_at INTEGER DEFAULT (unixepoch())
);

-- 2. 模版表
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,           -- 建议使用 nanoid
  folder_id TEXT NOT NULL,       -- 仅仅是一个普通的字段，不再强制关联
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,            -- 模版名称
  content TEXT DEFAULT '',       -- Typst 源码
  mock_data TEXT DEFAULT '{}',   -- JSON 字符串
  status TEXT DEFAULT 'draft',   -- 'draft' | 'active'
  updated_at INTEGER DEFAULT (unixepoch())
);

-- 索引仍然需要，为了查询快
CREATE INDEX IF NOT EXISTS idx_templates_folder ON templates(folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);