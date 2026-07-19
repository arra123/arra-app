ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS client_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_id
  ON chat_messages(user_id, thread_key, client_id)
  WHERE client_id IS NOT NULL;
