-- Migration: Media Asset Library
-- Adds MediaAsset table, FK columns on all image-bearing models,
-- and join tables for edition + sale announcement images.
-- Existing string image fields are KEPT for backward compat — removed in follow-up migration.

-- ─── 1. media_assets table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "media_assets" (
  "id"           TEXT NOT NULL,
  "publicId"     TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "folder"       TEXT,
  "label"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedById" TEXT,
  CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_publicId_key" ON "media_assets"("publicId");
CREATE INDEX IF NOT EXISTS "media_assets_uploadedById_idx" ON "media_assets"("uploadedById");

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 2. book_edition_media_assets join table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS "book_edition_media_assets" (
  "editionId" TEXT    NOT NULL,
  "assetId"   TEXT    NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "book_edition_media_assets_pkey" PRIMARY KEY ("editionId", "assetId")
);

CREATE INDEX IF NOT EXISTS "book_edition_media_assets_assetId_idx" ON "book_edition_media_assets"("assetId");

ALTER TABLE "book_edition_media_assets"
  ADD CONSTRAINT "book_edition_media_assets_editionId_fkey"
  FOREIGN KEY ("editionId") REFERENCES "book_editions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "book_edition_media_assets"
  ADD CONSTRAINT "book_edition_media_assets_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "media_assets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 3. sale_announcement_media_assets join table ─────────────────────────────

CREATE TABLE IF NOT EXISTS "sale_announcement_media_assets" (
  "announcementId" TEXT    NOT NULL,
  "assetId"        TEXT    NOT NULL,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "sale_announcement_media_assets_pkey" PRIMARY KEY ("announcementId", "assetId")
);

CREATE INDEX IF NOT EXISTS "sale_announcement_media_assets_assetId_idx" ON "sale_announcement_media_assets"("assetId");

ALTER TABLE "sale_announcement_media_assets"
  ADD CONSTRAINT "sale_announcement_media_assets_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "sale_announcements"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_announcement_media_assets"
  ADD CONSTRAINT "sale_announcement_media_assets_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "media_assets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 4. FK columns on existing models ────────────────────────────────────────

ALTER TABLE "authors"
  ADD COLUMN IF NOT EXISTS "photoAssetId" TEXT;
ALTER TABLE "authors"
  ADD CONSTRAINT "authors_photoAssetId_fkey"
  FOREIGN KEY ("photoAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "artists"
  ADD COLUMN IF NOT EXISTS "photoAssetId" TEXT;
ALTER TABLE "artists"
  ADD CONSTRAINT "artists_photoAssetId_fkey"
  FOREIGN KEY ("photoAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "book_box_companies"
  ADD COLUMN IF NOT EXISTS "logoAssetId" TEXT;
ALTER TABLE "book_box_companies"
  ADD CONSTRAINT "book_box_companies_logoAssetId_fkey"
  FOREIGN KEY ("logoAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "coverImageAssetId" TEXT;
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "logoAssetId" TEXT;
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_coverImageAssetId_fkey"
  FOREIGN KEY ("coverImageAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_logoAssetId_fkey"
  FOREIGN KEY ("logoAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscription_series"
  ADD COLUMN IF NOT EXISTS "coverImageAssetId" TEXT;
ALTER TABLE "subscription_series"
  ADD CONSTRAINT "subscription_series_coverImageAssetId_fkey"
  FOREIGN KEY ("coverImageAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscription_months"
  ADD COLUMN IF NOT EXISTS "coverImageAssetId" TEXT;
ALTER TABLE "subscription_months"
  ADD COLUMN IF NOT EXISTS "spoilerImageAssetId" TEXT;
ALTER TABLE "subscription_months"
  ADD CONSTRAINT "subscription_months_coverImageAssetId_fkey"
  FOREIGN KEY ("coverImageAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_months"
  ADD CONSTRAINT "subscription_months_spoilerImageAssetId_fkey"
  FOREIGN KEY ("spoilerImageAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_announcements"
  ADD COLUMN IF NOT EXISTS "imageAssetId" TEXT;
ALTER TABLE "sale_announcements"
  ADD CONSTRAINT "sale_announcements_imageAssetId_fkey"
  FOREIGN KEY ("imageAssetId") REFERENCES "media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
