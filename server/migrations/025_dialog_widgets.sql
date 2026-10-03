SET search_path TO apple;
ALTER TABLE ara_live_activities ADD COLUMN IF NOT EXISTS layout_version integer NOT NULL DEFAULT 1;
ALTER TABLE ara_live_start ADD COLUMN IF NOT EXISTS layout_version integer NOT NULL DEFAULT 1;
