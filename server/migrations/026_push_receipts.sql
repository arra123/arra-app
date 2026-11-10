CREATE TABLE IF NOT EXISTS push_receipts (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_after TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes'
);
