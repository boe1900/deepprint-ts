CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "createdAt" text NOT NULL DEFAULT now()::text,
  "updatedAt" text NOT NULL DEFAULT now()::text
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expiresAt" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" text NOT NULL DEFAULT now()::text,
  "updatedAt" text NOT NULL DEFAULT now()::text,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" text,
  "refreshTokenExpiresAt" text,
  "scope" text,
  "password" text,
  "createdAt" text NOT NULL DEFAULT now()::text,
  "updatedAt" text NOT NULL DEFAULT now()::text
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" text NOT NULL,
  "createdAt" text NOT NULL DEFAULT now()::text,
  "updatedAt" text NOT NULL DEFAULT now()::text
);

CREATE TABLE IF NOT EXISTS folders (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS templates (
  id text PRIMARY KEY,
  folder_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL DEFAULT '',
  mock_data text NOT NULL DEFAULT '{}',
  files_json text NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'previewed', 'saved', 'active')),
  updated_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint,
  UNIQUE (user_id, folder_id, name)
);

CREATE INDEX IF NOT EXISTS idx_templates_folder ON templates(folder_id);
CREATE INDEX IF NOT EXISTS idx_templates_user_updated ON templates(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS template_versions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  content text NOT NULL,
  mock_data text NOT NULL,
  files_json text NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'manual',
  summary text NOT NULL DEFAULT '',
  created_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_created
  ON template_versions(template_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_threads (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  created_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint,
  updated_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint,
  UNIQUE(user_id, template_id)
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role text NOT NULL,
  parts_json text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint
);

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created
  ON ai_messages(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_position
  ON ai_messages(thread_id, position);

CREATE TABLE IF NOT EXISTS trial_generation_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  created_at bigint NOT NULL DEFAULT extract(epoch FROM now())::bigint
);

CREATE INDEX IF NOT EXISTS idx_trial_generation_events_user_created
  ON trial_generation_events(user_id, created_at DESC);
