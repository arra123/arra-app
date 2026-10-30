-- «Поделиться в Arra»: what the phone sends to the knowledge base (a link, a
-- text, a file). The computer takes the items into ~/Claude/helper/ara-kb/inbox
-- and marks them taken. One share key per user lets the PC and an iOS Shortcut
-- in without a login session.
SET search_path TO apple;

CREATE TABLE IF NOT EXISTS kb_share_keys (
  user_id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_inbox (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL,            -- link | text | file
  url text,
  title text,
  body text,
  file_name text,
  file_path text,
  file_mime text,
  created_at timestamptz NOT NULL DEFAULT now(),
  taken_at timestamptz
);
CREATE INDEX IF NOT EXISTS kb_inbox_waiting ON kb_inbox(user_id, created_at) WHERE taken_at IS NULL;
