-- Live Activity «Кольца» on the phone: its APNs push tokens, so the server can
-- move the rings on the lock screen while the app is closed
SET search_path TO apple;

CREATE TABLE IF NOT EXISTS ara_live_activities (
  token text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ara_live_activities_user ON ara_live_activities(user_id);
