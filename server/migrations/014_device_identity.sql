-- Постоянная идентичность физического компьютера. Токен может пережить обновление
-- приложения, а device_key позволяет не создавать новый «Мой ПК» после переустановки.
ALTER TABLE pc_tokens ADD COLUMN IF NOT EXISTS device_key text;
ALTER TABLE pc_tokens ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE pc_tokens ADD COLUMN IF NOT EXISTS hostname text;
ALTER TABLE pc_tokens ADD COLUMN IF NOT EXISTS platform text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_tokens_user_device_key
  ON pc_tokens(user_id, device_key)
  WHERE device_key IS NOT NULL;

