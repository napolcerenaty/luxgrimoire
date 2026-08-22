-- Series-discovery: periodically checks free book APIs (Google Books, Open Library, Wikidata)
-- for volumes of a tracked series we don't have yet, and surfaces them to an admin for review.
-- Additive only: all new BookSeries columns are safe defaults for existing rows.

ALTER TABLE "book_series" ADD COLUMN IF NOT EXISTS "isCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "book_series" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "book_series" ADD COLUMN IF NOT EXISTS "googleBooksSeriesId" TEXT;
ALTER TABLE "book_series" ADD COLUMN IF NOT EXISTS "openLibraryId" TEXT;
ALTER TABLE "book_series" ADD COLUMN IF NOT EXISTS "wikidataId" TEXT;
ALTER TABLE "book_series" ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "book_series_isCompleted_lastCheckedAt_idx" ON "book_series"("isCompleted", "lastCheckedAt");

CREATE TABLE IF NOT EXISTS "series_volume_suggestions" (
    "id"            TEXT NOT NULL,
    -- book_series.id is a native UUID column (unlike books.id, which is TEXT) — must match for the FK below.
    "seriesId"      UUID NOT NULL,
    "title"         TEXT NOT NULL,
    "authorNames"   TEXT[] NOT NULL DEFAULT '{}',
    "volumeNumber"  DOUBLE PRECISION,
    "genres"        TEXT[] NOT NULL DEFAULT '{}',
    "source"        VARCHAR(20) NOT NULL,
    "sourceId"      TEXT NOT NULL,
    "sourceUrl"     TEXT,
    "description"   TEXT,
    "publishedDate" TEXT,
    "status"        VARCHAR(20) NOT NULL DEFAULT 'pending',
    "adminNote"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "series_volume_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "series_volume_suggestions_seriesId_source_sourceId_key" ON "series_volume_suggestions"("seriesId", "source", "sourceId");
CREATE INDEX IF NOT EXISTS "series_volume_suggestions_status_idx" ON "series_volume_suggestions"("status");
CREATE INDEX IF NOT EXISTS "series_volume_suggestions_seriesId_idx" ON "series_volume_suggestions"("seriesId");

DO $$ BEGIN
    ALTER TABLE "series_volume_suggestions" ADD CONSTRAINT "series_volume_suggestions_seriesId_fkey"
        FOREIGN KEY ("seriesId") REFERENCES "book_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
