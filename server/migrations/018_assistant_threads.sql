CREATE TABLE IF NOT EXISTS assistant_threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_key   text NOT NULL,
  title        text NOT NULL DEFAULT 'Новая задача',
  project_name text,
  project_path text,
  device_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, thread_key)
);

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS thread_key text NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_chat_user_thread_time
  ON chat_messages(user_id, thread_key, created_at);

CREATE INDEX IF NOT EXISTS idx_assistant_threads_user_updated
  ON assistant_threads(user_id, updated_at DESC);
