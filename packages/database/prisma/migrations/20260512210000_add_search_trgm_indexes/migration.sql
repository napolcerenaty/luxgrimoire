-- Remove orphaned trigram index (editionName column was dropped in 20260512200000)
DROP INDEX IF EXISTS "book_editions_editionName_trgm_gin";

-- Trigram indexes for Postgres search fallback (used when TypeSense is unavailable)
-- These turn ILIKE '%query%' from a sequential scan into an index scan.
-- pg_trgm extension is already enabled (see 20260429093653_add_trgm_indexes).

CREATE INDEX IF NOT EXISTS "book_series_name_trgm_gin"
  ON books USING gin ("seriesName" gin_trgm_ops)
  WHERE "seriesName" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "authors_name_trgm_gin"
  ON authors USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "artists_name_trgm_gin"
  ON artists USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "subscriptions_name_trgm_gin"
  ON subscriptions USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "book_box_companies_name_trgm_gin"
  ON book_box_companies USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "sale_announcements_title_trgm_gin"
  ON sale_announcements USING gin (title gin_trgm_ops)
  WHERE title IS NOT NULL;

-- Also covers publisher field searched in editions fallback
CREATE INDEX IF NOT EXISTS "book_editions_publisher_trgm_gin"
  ON book_editions USING gin (publisher gin_trgm_ops)
  WHERE publisher IS NOT NULL;
