-- ============================================================
-- CIPHER: evidence_kind + competitor_profiles — v3 schema
-- Запустить в Supabase → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Добавляем evidence_kind в cipher_evidence
-- ────────────────────────────────────────────────────────────
ALTER TABLE cipher_evidence
  ADD COLUMN IF NOT EXISTS evidence_kind TEXT
    CHECK (evidence_kind IN ('search','review','pricing','ad','content','profile','social','map'));

-- ────────────────────────────────────────────────────────────
-- 2. Новая таблица competitor_profiles — глубокий профиль
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id         UUID        REFERENCES analyses(id) ON DELETE CASCADE,
  competitor_id       UUID        REFERENCES cipher_competitors(id) ON DELETE CASCADE,
  company_name        TEXT,
  -- Оффер и продажи
  offer_ladder        TEXT,        -- как выстроена линейка офферов
  sales_model         TEXT,        -- как продают: онлайн / звонок / автоворонка
  trust_signals       TEXT,        -- кейсы, сертификаты, отзывы как аргументы
  -- Контент и реклама
  content_strategy    TEXT,        -- о чём пишут, какие темы доминируют
  ad_strategy         TEXT,        -- где рекламируются, какой угол боли
  -- Аудитория
  audience_fit        TEXT,        -- кому реально подходит
  founder_visibility  TEXT,        -- личный бренд основателя (есть/нет/уровень)
  -- Прочее
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 3. RLS — разрешить anon key читать и писать
-- ────────────────────────────────────────────────────────────
ALTER TABLE competitor_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_competitor_profiles" ON competitor_profiles;
CREATE POLICY "anon_insert_competitor_profiles"
  ON competitor_profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_competitor_profiles" ON competitor_profiles;
CREATE POLICY "anon_select_competitor_profiles"
  ON competitor_profiles FOR SELECT USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. Исправляем threat_score — пока не заполнялся автоматом
--    Добавляем индексы для быстрых запросов по analysis_id
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cipher_competitors_analysis_id
  ON cipher_competitors(analysis_id);

CREATE INDEX IF NOT EXISTS idx_cipher_evidence_analysis_id
  ON cipher_evidence(analysis_id);

CREATE INDEX IF NOT EXISTS idx_competitor_profiles_analysis_id
  ON competitor_profiles(analysis_id);

CREATE INDEX IF NOT EXISTS idx_analyses_client_key
  ON analyses(client_key);
