-- ============================================================
-- CIPHER: создание таблицы clients + расширение analyses
-- Запустить в Supabase → SQL Editor
-- ============================================================

-- 1. Таблица клиентов
CREATE TABLE IF NOT EXISTS clients (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key    TEXT          NOT NULL UNIQUE,
  email         TEXT,
  -- Откуда пришёл клиент
  source_url    TEXT,                         -- страница с которой запустил Cipher
  referrer      TEXT,                         -- document.referrer браузера
  utm_source    TEXT,                         -- utm_source из URL
  utm_medium    TEXT,                         -- utm_medium из URL
  utm_campaign  TEXT,                         -- utm_campaign из URL
  -- С чем пришёл (первый запрос)
  first_area    TEXT,                         -- первая ниша клиента
  first_product TEXT,                         -- первый продукт клиента
  first_geo     TEXT[],                       -- первая география
  -- Статистика
  analyses_count INTEGER DEFAULT 0,           -- кол-во анализов
  -- Статус
  is_paid       BOOLEAN DEFAULT false,
  paid_at       TIMESTAMPTZ,
  -- Время
  created_at    TIMESTAMPTZ DEFAULT now(),    -- первый визит
  last_seen_at  TIMESTAMPTZ DEFAULT now()     -- последний визит
);

-- 2. Добавить новые поля в analyses (если их нет)
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS source_url   TEXT,
  ADD COLUMN IF NOT EXISTS referrer     TEXT,
  ADD COLUMN IF NOT EXISTS utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- 3. Добавить rank в cipher_competitors
ALTER TABLE cipher_competitors
  ADD COLUMN IF NOT EXISTS rank SMALLINT;

-- 3. RLS: разрешить вставку и чтение по anon ключу
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert" ON clients
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon select own" ON clients
  FOR SELECT USING (true);

CREATE POLICY "Allow anon update" ON clients
  FOR UPDATE USING (true) WITH CHECK (true);
