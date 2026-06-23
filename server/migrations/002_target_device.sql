-- Куда отправлен файл: конкретный ПК (устройство). NULL = всем устройствам.
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS target_token_id uuid REFERENCES pc_tokens(id) ON DELETE SET NULL;
