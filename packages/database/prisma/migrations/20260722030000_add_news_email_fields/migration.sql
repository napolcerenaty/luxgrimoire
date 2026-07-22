-- Migration: newsletter e-mail ingestion fields (Phase 5 of the news aggregator plan)
--
-- 1. NewsSourceType.EMAIL_ACTION_REQUIRED — subscription-confirmation emails
--    (spec 2.2.1) never go through news classification; they land in a
--    separate "needs action" admin queue instead.
-- 2. news_source_records.actionUrl — the confirm/verify link extracted from
--    an EMAIL_ACTION_REQUIRED email, for the admin to click manually.
-- 3. news_source_records.companyName — EMAIL_ACTION_REQUIRED records have no
--    NewsItem (nothing to publish), so this is the only place the company
--    context lives; also used by the stale-newsletter monitor (spec 2.2).
--
-- NOTE (feature branch): written but intentionally NOT applied locally — apply
-- after merge to development, per CLAUDE.md.

-- Plain form (not wrapped in a DO block) — ALTER TYPE ... ADD VALUE cannot run
-- inside a PL/pgSQL block in all Postgres versions; IF NOT EXISTS alone already
-- makes this safe to re-run.
ALTER TYPE "NewsSourceType" ADD VALUE IF NOT EXISTS 'EMAIL_ACTION_REQUIRED';

ALTER TABLE "news_source_records" ADD COLUMN IF NOT EXISTS "actionUrl" TEXT;
ALTER TABLE "news_source_records" ADD COLUMN IF NOT EXISTS "companyName" TEXT;

CREATE INDEX IF NOT EXISTS "news_source_records_sourceType_idx" ON "news_source_records"("sourceType");
