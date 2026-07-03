-- Migration: book_series entity
-- Creates book_series table and backfills from existing books.seriesName
-- Slug = slugified seriesName; if collision (same slug, different name) append primary author slug

-- ── 1. Create book_series table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "book_series" (
  "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
  "slug"      TEXT        NOT NULL,
  "name"      TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "book_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "book_series_slug_key" UNIQUE ("slug")
);

CREATE INDEX IF NOT EXISTS "book_series_name_idx" ON "book_series"("name");

-- ── 2. Add seriesId to books ──────────────────────────────────────────────────

ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "seriesId" UUID;

CREATE INDEX IF NOT EXISTS "books_seriesId_idx" ON "books"("seriesId");

-- ── 3. Helper function: slugify text ─────────────────────────────────────────
-- Converts e.g. "A Court of Thorns & Roses" → "a-court-of-thorns-roses"

CREATE OR REPLACE FUNCTION _luxg_slugify(input TEXT) RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  result := lower(input);
  -- replace accented chars with ascii equivalents (basic)
  result := translate(result,
    'àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ',
    'aaaaaaeceeeeiiiidnoooooouuuuyty');
  -- replace non-alphanumeric (except spaces/hyphens) with space
  result := regexp_replace(result, '[^a-z0-9\s\-]', ' ', 'g');
  -- collapse whitespace/hyphens to single hyphen
  result := regexp_replace(trim(result), '[\s\-]+', '-', 'g');
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 4. Backfill: create one book_series row per distinct seriesName ───────────
-- For each unique seriesName:
--   base_slug = slugify(seriesName)
--   If base_slug is unique → use it
--   If collision (same slug but different name) → append "-" + slugify(first author name)

DO $$
DECLARE
  rec         RECORD;
  base_slug   TEXT;
  final_slug  TEXT;
  author_slug TEXT;
  series_id   UUID;
BEGIN
  FOR rec IN
    SELECT
      b."seriesName" AS series_name,
      -- Primary author: first alphabetically for determinism
      MIN(a.name) AS primary_author
    FROM books b
    LEFT JOIN book_authors ba ON ba."bookId" = b.id
    LEFT JOIN authors a ON a.id = ba."authorId"
    WHERE b."seriesName" IS NOT NULL AND b."seriesName" != ''
    GROUP BY b."seriesName"
    ORDER BY b."seriesName"
  LOOP
    base_slug := _luxg_slugify(rec.series_name);

    -- Check if this slug already exists in book_series (from a previously inserted row)
    IF EXISTS (SELECT 1 FROM "book_series" WHERE "slug" = base_slug) THEN
      -- Slug collision: append author slug
      author_slug := _luxg_slugify(COALESCE(rec.primary_author, 'unknown'));
      final_slug := base_slug || '-' || author_slug;
      -- If still collides (extremely unlikely), append short hash
      IF EXISTS (SELECT 1 FROM "book_series" WHERE "slug" = final_slug) THEN
        final_slug := base_slug || '-' || left(md5(rec.series_name), 6);
      END IF;
    ELSE
      final_slug := base_slug;
    END IF;

    INSERT INTO "book_series" ("id", "slug", "name")
    VALUES (gen_random_uuid(), final_slug, rec.series_name)
    ON CONFLICT ("slug") DO NOTHING
    RETURNING "id" INTO series_id;

    -- If ON CONFLICT fired (row already exists with this slug), fetch existing id
    IF series_id IS NULL THEN
      SELECT "id" INTO series_id FROM "book_series" WHERE "slug" = final_slug;
    END IF;

    -- Backfill books.seriesId
    UPDATE "books"
    SET "seriesId" = series_id
    WHERE "seriesName" = rec.series_name
      AND "seriesId" IS NULL;
  END LOOP;
END;
$$;

-- ── 5. Add FK constraint ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'books_seriesId_fkey' AND table_name = 'books'
  ) THEN
    ALTER TABLE "books"
      ADD CONSTRAINT "books_seriesId_fkey"
      FOREIGN KEY ("seriesId") REFERENCES "book_series"("id") ON DELETE SET NULL;
  END IF;
END;
$$;

-- ── 6. Drop helper function ───────────────────────────────────────────────────

DROP FUNCTION IF EXISTS _luxg_slugify(TEXT);
