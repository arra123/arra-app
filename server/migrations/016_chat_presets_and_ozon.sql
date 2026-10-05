-- Пресеты помощника и исправление старой опечатки «зон» в названии Ozon.
SET search_path TO apple;

ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS preset text NOT NULL DEFAULT 'finance';

UPDATE chat_threads
SET preset = 'finance'
WHERE preset NOT IN ('finance', 'general', 'tech');

UPDATE debts
SET
  counterparty = CASE
    WHEN lower(trim(counterparty)) IN ('zone', 'зон', 'ozon', 'озон') THEN 'Озон'
    ELSE counterparty
  END,
  note = regexp_replace(note, 'Пополнение баланса зон', 'Пополнение баланса Ozon', 'gi')
WHERE lower(trim(counterparty)) IN ('zone', 'зон', 'ozon', 'озон')
   OR note ~* 'Пополнение баланса зон';

UPDATE transactions
SET
  merchant = CASE
    WHEN lower(trim(merchant)) IN ('zone', 'зон', 'ozon', 'озон') THEN 'Озон'
    ELSE merchant
  END,
  title = regexp_replace(title, 'Пополнение баланса зон', 'Пополнение баланса Ozon', 'gi')
WHERE lower(trim(merchant)) IN ('zone', 'зон', 'ozon', 'озон')
   OR title ~* 'Пополнение баланса зон';
