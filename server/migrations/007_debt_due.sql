-- Срок долга (когда должны вернуть). NULL = бессрочный/неограниченный.
SET search_path TO apple;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS settled_at timestamptz;
