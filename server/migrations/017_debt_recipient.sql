ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS recipient text;

UPDATE debts
SET recipient = 'Тима'
WHERE recipient IS NULL;

ALTER TABLE debts
  ALTER COLUMN recipient SET DEFAULT 'Тима';

ALTER TABLE debts
  ALTER COLUMN recipient SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_debts_user_recipient_occurred
  ON debts(user_id, recipient, occurred_at DESC);
