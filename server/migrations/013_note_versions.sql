-- Вторая, структурированная ИИ-версия заметки. Оригинал всегда остаётся в body.
SET search_path TO apple;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS structured_body text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS structured_at timestamptz;
