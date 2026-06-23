-- Позиции внутри операции: один заказ (напр. Озон 859 ₽) можно разбить на товары
-- (йогурт/роллы/тефтели), каждый со своей категорией — для точной статистики.
SET search_path TO apple;

CREATE TABLE IF NOT EXISTS transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric(14,2) NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_txitem_tx ON transaction_items(transaction_id);
