-- Все объекты создаются в схеме apple (изоляция от чужих 94 таблиц в public)
CREATE SCHEMA IF NOT EXISTS apple;
SET search_path TO apple;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- для gen_random_uuid()

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Финансовые операции
CREATE TABLE IF NOT EXISTS transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('expense','income')),
  amount      numeric(14,2) NOT NULL,
  currency    text NOT NULL DEFAULT 'RUB',
  category    text NOT NULL DEFAULT 'Прочее',
  title       text,
  note        text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL DEFAULT 'text' CHECK (source IN ('text','voice','screenshot','manual')),
  raw_input   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(user_id, occurred_at DESC);

-- Долги
CREATE TABLE IF NOT EXISTS debts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counterparty text NOT NULL,
  amount       numeric(14,2) NOT NULL,
  currency     text NOT NULL DEFAULT 'RUB',
  direction    text NOT NULL CHECK (direction IN ('owes_me','i_owe')),
  note         text,
  settled      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debt_user ON debts(user_id, settled);

-- Файлы (перенос телефон -> ПК)
CREATE TABLE IF NOT EXISTS files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name text NOT NULL,
  mime          text,
  size          bigint,
  storage_path  text NOT NULL,
  status        text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','delivered')),
  delivered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_user_time ON files(user_id, created_at DESC);

-- Токены агента на ПК (для аутентификации десктоп-клиента)
CREATE TABLE IF NOT EXISTS pc_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      text UNIQUE NOT NULL,
  name       text,
  last_seen  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
