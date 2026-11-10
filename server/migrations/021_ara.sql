-- «Ара»: последнее известное состояние каждого агента (working / waiting / error / old).
-- Сервер сравнивает с ним новые снимки ara-link и шлёт push при переходе
-- working → waiting / error. Снимки целиком живут только в памяти сервера.
SET search_path TO apple;

CREATE TABLE IF NOT EXISTS ara_agent_states (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_key  text NOT NULL,
  state      text NOT NULL,
  project    text,
  since      timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent_key)
);
