-- Магазин/сервис, где совершена операция (Озон, Пятёрочка, Netflix…). Категория остаётся отдельно.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant text;
CREATE INDEX IF NOT EXISTS idx_tx_merchant ON transactions(user_id, merchant) WHERE merchant IS NOT NULL;
