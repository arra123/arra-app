-- Цвет-категория заметки (визуальная подсветка): null = без категории.
SET search_path TO apple;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS color text;
