SET search_path TO apple;

-- Расходы, которые пользователь оплатил сам и должен получить обратно от компании.
-- Это отдельная сущность: она не смешивается с личными тратами и долгами между людьми.
CREATE TABLE IF NOT EXISTS reimbursements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  currency      text NOT NULL DEFAULT 'RUB',
  purpose       text NOT NULL,
  merchant      text,
  location      text,
  company       text NOT NULL DEFAULT 'Компания',
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  due_date      date,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','submitted','reimbursed','rejected')),
  note          text,
  source        text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','text','voice','photo','assistant')),
  raw_input     text,
  reimbursed_at timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reimbursements_user_status
  ON reimbursements(user_id, status, occurred_at DESC);
