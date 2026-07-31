SET search_path TO apple;

-- Один аккаунт используют Тима и Дани. Получатель хранится в самой записи,
-- поэтому компенсации не смешиваются при просмотре с разных устройств.
ALTER TABLE reimbursements
  ADD COLUMN IF NOT EXISTS recipient text NOT NULL DEFAULT 'Тима';

CREATE INDEX IF NOT EXISTS idx_reimbursements_user_recipient_status
  ON reimbursements(user_id, recipient, status, occurred_at DESC);
