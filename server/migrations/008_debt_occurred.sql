-- Дата, КОГДА возник долг (когда дал/взял, когда был каршеринг и т.п.).
-- Отдельно от created_at (когда запись внесена) и due_date (срок возврата).
SET search_path TO apple;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();
