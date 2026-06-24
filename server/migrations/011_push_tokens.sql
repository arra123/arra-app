-- Push-токены устройств (Expo) для уведомлений: файл получен, Claude закончил и т.п.
SET search_path TO apple;

CREATE TABLE IF NOT EXISTS push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL,
  platform text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_tokens(user_id);
