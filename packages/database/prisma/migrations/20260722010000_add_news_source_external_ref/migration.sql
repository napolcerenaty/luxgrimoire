-- Migration: news_source_records.externalRef — dedupe key for automated pollers
-- (Phase 3 of the news aggregator plan). Lets the RSS/blog poller (and, later,
-- the email ingester) recognise "I already ingested this exact entry" across
-- cron ticks without creating a fresh draft every time the same feed item is
-- still present in the source's recent-items list.
--
-- NOTE (feature branch): written but intentionally NOT applied locally — apply
-- after merge to development, per CLAUDE.md.

ALTER TABLE "news_source_records" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_source_records_externalRef_key') THEN
    ALTER TABLE "news_source_records" ADD CONSTRAINT "news_source_records_externalRef_key" UNIQUE ("externalRef");
  END IF;
END $$;
