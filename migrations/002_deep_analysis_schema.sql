-- ============================================================
-- CIPHER: Глубокий анализ конкурентов — v3 schema
-- Запустить в Supabase → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Расширяем cipher_competitors
-- ────────────────────────────────────────────────────────────
ALTER TABLE cipher_competitors
  -- Тип и скоринг
  ADD COLUMN IF NOT EXISTS competitor_type    TEXT CHECK (competitor_type IN ('direct','substitute','indirect','reference')),
  ADD COLUMN IF NOT EXISTS confidence_score   SMALLINT CHECK (confidence_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS relevance_score    SMALLINT CHECK (relevance_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS threat_score       SMALLINT CHECK (threat_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS local_fit_score    SMALLINT CHECK (local_fit_score BETWEEN 0 AND 100),
  -- Источник
  ADD COLUMN IF NOT EXISTS found_in           TEXT,
  ADD COLUMN IF NOT EXISTS matched_query      TEXT,
  ADD COLUMN IF NOT EXISTS evidence_snippet   TEXT,
  -- Гео и профиль
  ADD COLUMN IF NOT EXISTS market_scope       TEXT CHECK (market_scope IN ('local','kz','cis','global')),
  ADD COLUMN IF NOT EXISTS domain             TEXT,
  ADD COLUMN IF NOT EXISTS country            TEXT,
  ADD COLUMN IF NOT EXISTS city               TEXT,
  ADD COLUMN IF NOT EXISTS segment            TEXT,
  ADD COLUMN IF NOT EXISTS business_model     TEXT,
  ADD COLUMN IF NOT EXISTS main_platform      TEXT,
  ADD COLUMN IF NOT EXISTS platform_link      TEXT,
  -- Оффер и цена
  ADD COLUMN IF NOT EXISTS positioning        TEXT,
  ADD COLUMN IF NOT EXISTS core_offer         TEXT,
  ADD COLUMN IF NOT EXISTS price_from         NUMERIC,
  ADD COLUMN IF NOT EXISTS price_model        TEXT,
  ADD COLUMN IF NOT EXISTS lead_magnet        TEXT,
  ADD COLUMN IF NOT EXISTS funnel_entry       TEXT,
  -- Аудитория и слабости
  ADD COLUMN IF NOT EXISTS target_audience    TEXT,
  ADD COLUMN IF NOT EXISTS main_pain_point    TEXT,
  ADD COLUMN IF NOT EXISTS main_objection     TEXT,
  ADD COLUMN IF NOT EXISTS weakness           TEXT,
  ADD COLUMN IF NOT EXISTS why_choose_them    TEXT,
  ADD COLUMN IF NOT EXISTS why_leave_them     TEXT,
  -- Отзывы
  ADD COLUMN IF NOT EXISTS review_rating      NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS review_count       INTEGER,
  -- Соцсети
  ADD COLUMN IF NOT EXISTS channels_active    JSONB,
  ADD COLUMN IF NOT EXISTS last_seen_at       TIMESTAMPTZ DEFAULT now();

-- ────────────────────────────────────────────────────────────
-- 2. Расширяем analyses
-- ────────────────────────────────────────────────────────────
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS client_name          TEXT,
  ADD COLUMN IF NOT EXISTS client_type          TEXT,
  ADD COLUMN IF NOT EXISTS analysis_mode        TEXT CHECK (analysis_mode IN ('saas','local','hybrid')),
  ADD COLUMN IF NOT EXISTS geo_primary          TEXT,
  ADD COLUMN IF NOT EXISTS direct_count         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS substitute_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_confidence_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_version       INTEGER DEFAULT 1;

-- ────────────────────────────────────────────────────────────
-- 3. Доказательная база — cipher_evidence
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cipher_evidence (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id     UUID          REFERENCES analyses(id) ON DELETE CASCADE,
  competitor_id   UUID          REFERENCES cipher_competitors(id) ON DELETE CASCADE,
  company_name    TEXT,
  source_type     TEXT          CHECK (source_type IN ('search','review','pricing','ad','content','social','map','marketplace')),
  source_url      TEXT,
  matched_query   TEXT,
  title           TEXT,
  snippet         TEXT,
  captured_at     TIMESTAMPTZ   DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 4. Офферы конкурентов — cipher_offers
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cipher_offers (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id     UUID          REFERENCES analyses(id) ON DELETE CASCADE,
  competitor_id   UUID          REFERENCES cipher_competitors(id) ON DELETE CASCADE,
  company_name    TEXT,
  offer_name      TEXT,
  offer_type      TEXT,
  format          TEXT,
  duration        TEXT,
  price           NUMERIC,
  currency        TEXT          DEFAULT 'KZT',
  trial_or_demo   TEXT,
  guarantee       TEXT,
  main_promise    TEXT,
  audience_fit    TEXT,
  offer_link      TEXT,
  lead_magnet     TEXT,
  sales_model     TEXT,
  funnel_entry    TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ   DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 5. Отзывы — cipher_reviews
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cipher_reviews (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id         UUID        REFERENCES analyses(id) ON DELETE CASCADE,
  competitor_id       UUID        REFERENCES cipher_competitors(id) ON DELETE CASCADE,
  company_name        TEXT,
  platform            TEXT,
  review_date         DATE,
  rating              NUMERIC(3,1),
  review_title        TEXT,
  review_text         TEXT,
  pain_point          TEXT,
  positive_driver     TEXT,
  objection           TEXT,
  pain_category       TEXT,
  switch_trigger      TEXT,
  sentiment           TEXT        CHECK (sentiment IN ('positive','mixed','negative','neutral')),
  response_from_brand BOOLEAN,
  review_link         TEXT,
  language            TEXT,
  insight_priority    TEXT        CHECK (insight_priority IN ('High','Medium','Low')),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 6. Реклама конкурентов — cipher_ads
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cipher_ads (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id     UUID          REFERENCES analyses(id) ON DELETE CASCADE,
  competitor_id   UUID          REFERENCES cipher_competitors(id) ON DELETE CASCADE,
  company_name    TEXT,
  platform        TEXT,
  ad_status       TEXT          CHECK (ad_status IN ('Active','Paused','Inactive','Testing')),
  launch_date     DATE,
  format          TEXT,
  hook            TEXT,
  pain_angle      TEXT,
  offer_cta       TEXT,
  funnel_stage    TEXT,
  creative_type   TEXT,
  target_audience TEXT,
  landing_page    TEXT,
  ad_library_link TEXT,
  campaign_goal   TEXT,
  promise         TEXT,
  priority        TEXT          CHECK (priority IN ('High','Medium','Low')),
  notes           TEXT,
  created_at      TIMESTAMPTZ   DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 7. Контент — cipher_content
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cipher_content (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id       UUID        REFERENCES analyses(id) ON DELETE CASCADE,
  competitor_id     UUID        REFERENCES cipher_competitors(id) ON DELETE CASCADE,
  company_name      TEXT,
  platform          TEXT,
  content_date      DATE,
  content_type      TEXT,
  topic             TEXT,
  main_hook         TEXT,
  audience_problem  TEXT,
  engagement_signal TEXT,
  cta               TEXT,
  content_url       TEXT,
  best_takeaway     TEXT,
  replicate_or_avoid TEXT       CHECK (replicate_or_avoid IN ('Replicate','Avoid','Neutral')),
  tone_of_voice     TEXT,
  frequency_signal  TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 8. Возможности — cipher_opportunities
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cipher_opportunities (
  id                    UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id           UUID      REFERENCES analyses(id) ON DELETE CASCADE,
  competitor_id         UUID      REFERENCES cipher_competitors(id) ON DELETE CASCADE,
  company_name          TEXT,
  main_weakness         TEXT,
  missed_audience       TEXT,
  best_entry_point      TEXT,
  best_platform         TEXT,
  next_action           TEXT,
  why_choose_them       TEXT,
  why_we_can_win        TEXT,
  priority              TEXT      CHECK (priority IN ('High','Medium','Low')),
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 9. Контакты в компаниях конкурентов — cipher_contacts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cipher_contacts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id         UUID        REFERENCES analyses(id) ON DELETE CASCADE,
  competitor_id       UUID        REFERENCES cipher_competitors(id) ON DELETE CASCADE,
  company_name        TEXT,
  contact_name        TEXT,
  role                TEXT,
  department          TEXT,
  decision_level      TEXT        CHECK (decision_level IN ('High','Medium','Low')),
  platform            TEXT,
  platform_profile_url TEXT,
  email               TEXT,
  phone               TEXT,
  whatsapp_or_telegram TEXT,
  linkedin_or_social  TEXT,
  location            TEXT,
  language            TEXT,
  reach_priority      TEXT        CHECK (reach_priority IN ('High','Medium','Low')),
  last_seen_date      DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 10. RLS — разрешить anon key читать и писать
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cipher_evidence','cipher_offers','cipher_reviews','cipher_ads','cipher_content','cipher_opportunities','cipher_contacts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%I" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_insert_%I" ON %I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_select_%I" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_select_%I" ON %I FOR SELECT USING (true)', t, t);
  END LOOP;
END $$;
