-- Разрешаем источник 'assistant' (операции, созданные помощником в Диалоге)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('text','voice','screenshot','manual','assistant'));
