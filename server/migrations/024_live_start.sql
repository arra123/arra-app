-- The push-to-start token of the phone: the server starts the lock screen block
-- («агент ждёт тебя») while the app is closed
SET search_path TO apple;

CREATE TABLE IF NOT EXISTS ara_live_start (
  user_id uuid PRIMARY KEY,
  token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
