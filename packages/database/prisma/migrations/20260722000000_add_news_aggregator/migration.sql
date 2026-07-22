-- Migration: News aggregator feature — schema foundation (Phase 1 of the plan)
-- See Desktop file luxgrimoire-feature-news-aggregator.md for full design.
--
-- NOTE (feature branch): written but intentionally NOT applied locally while this
-- branch is separate from `development` — apply after merge, per CLAUDE.md.

-- ── Enums ──────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "BlogCheckFrequency" AS ENUM ('HOURLY', 'EVERY_6H', 'DAILY', 'WEEKLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BlogFeedType" AS ENUM ('SHOPIFY_ATOM', 'WORDPRESS', 'HTML_SCRAPE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "NewsItemType" AS ENUM ('NEW_SUBSCRIPTION', 'CONTINUATION', 'TEASER', 'SALE_ANNOUNCEMENT', 'MONTH_THEME', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "NewsItemStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED', 'RETRACTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "NewsSourceType" AS ENUM ('RSS', 'EMAIL', 'INSTAGRAM_SCREENSHOT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "NewsSourceMergeStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'DECLINED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── book_box_companies: news-source configurator fields (spec 10.1) ─────────────

ALTER TABLE "book_box_companies" ADD COLUMN IF NOT EXISTS "newsletterSubscribed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "book_box_companies" ADD COLUMN IF NOT EXISTS "blogUrl" TEXT;
ALTER TABLE "book_box_companies" ADD COLUMN IF NOT EXISTS "rssUrlOverride" TEXT;
ALTER TABLE "book_box_companies" ADD COLUMN IF NOT EXISTS "blogCheckFrequency" "BlogCheckFrequency" NOT NULL DEFAULT 'DAILY';
ALTER TABLE "book_box_companies" ADD COLUMN IF NOT EXISTS "blogLastCheckedAt" TIMESTAMP(3);
ALTER TABLE "book_box_companies" ADD COLUMN IF NOT EXISTS "blogFeedType" "BlogFeedType";

-- ── users: read/unread cursor (spec 8.1) ────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "newsLastSeenAt" TIMESTAMP(3);

-- ── news_items ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "news_items" (
  "id"                 TEXT             NOT NULL,
  "companyName"        TEXT             NOT NULL,
  "title"              TEXT             NOT NULL,
  "type"               "NewsItemType"   NOT NULL DEFAULT 'OTHER',
  "summary"            TEXT,
  "appEntityLink"      TEXT,
  "originalSourceUrl"  TEXT,
  "status"             "NewsItemStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt"        TIMESTAMP(3),
  "lastUpdatedAt"      TIMESTAMP(3),
  "linkedDraftPayload" JSONB,
  "createdAt"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "news_items_status_idx" ON "news_items"("status");
CREATE INDEX IF NOT EXISTS "news_items_publishedAt_idx" ON "news_items"("publishedAt");
CREATE INDEX IF NOT EXISTS "news_items_companyName_idx" ON "news_items"("companyName");

-- ── news_source_records ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "news_source_records" (
  "id"            TEXT                    NOT NULL,
  "newsItemId"    TEXT,
  "sourceType"    "NewsSourceType"        NOT NULL,
  "rawContentRef" TEXT,
  "ingestedAt"    TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mergeStatus"   "NewsSourceMergeStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  CONSTRAINT "news_source_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "news_source_records_newsItemId_idx" ON "news_source_records"("newsItemId");
CREATE INDEX IF NOT EXISTS "news_source_records_mergeStatus_idx" ON "news_source_records"("mergeStatus");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_source_records_newsItemId_fkey') THEN
    ALTER TABLE "news_source_records" ADD CONSTRAINT "news_source_records_newsItemId_fkey"
      FOREIGN KEY ("newsItemId") REFERENCES "news_items"("id") ON DELETE CASCADE;
  END IF;
END $$;
