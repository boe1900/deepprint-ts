CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  image text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folders (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS templates (
  id text PRIMARY KEY,
  folder_id text NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  files_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'previewed', 'saved')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, folder_id, name)
);

CREATE INDEX IF NOT EXISTS idx_templates_user_updated
  ON templates(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS template_versions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  files_json jsonb NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_created
  ON template_versions(template_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_threads (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, template_id)
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role text NOT NULL,
  parts_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created
  ON ai_messages(thread_id, created_at);
