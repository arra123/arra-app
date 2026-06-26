-- УльянаOS — секретное «приложение в приложении» (Слёзометр + Пинг-Контроль).
-- Данные привязаны к пользователю (аккаунт «ульяна»), живут в схеме apple.
SET search_path TO apple;

-- Журнал плача («диагнозы» Слёзометра)
CREATE TABLE IF NOT EXISTS cry_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intensity    int  NOT NULL DEFAULT 5,        -- сила плача 1..10
  reason       text,                            -- причина (сериал/лук/жизнь/…)
  duration_min numeric(6,1) NOT NULL DEFAULT 0, -- длительность, минут
  napkins      int  NOT NULL DEFAULT 0,         -- израсходовано салфеток
  mood_before  text,
  mood_after   text,
  score        int  NOT NULL DEFAULT 0,         -- итоговый «балл слёз» 0..100
  verdict      text,                            -- рофельный диагноз
  recommendation text,                          -- рекомендация
  note         text,
  media_path   text,                            -- путь к прикреплённому медиа на сервере
  media_mime   text,
  media_kind   text,                            -- 'image' | 'video' | 'audio'
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cry_user_time ON cry_logs(user_id, created_at DESC);

-- История партий настольного тенниса
CREATE TABLE IF NOT EXISTS pingpong_matches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_a   text NOT NULL DEFAULT 'Игрок A',
  player_b   text NOT NULL DEFAULT 'Игрок B',
  sets_a     int  NOT NULL DEFAULT 0,           -- выиграно сетов A
  sets_b     int  NOT NULL DEFAULT 0,
  sets       jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{a,b}, …] по сетам
  winner     text,                               -- 'a' | 'b' | null
  best_of    int  NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_user_time ON pingpong_matches(user_id, created_at DESC);
