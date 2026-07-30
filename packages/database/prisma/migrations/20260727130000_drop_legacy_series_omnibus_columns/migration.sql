-- Drops the structures superseded by 20260721000000_multiple_series_and_omnibus.
-- That migration deliberately left these in place so a rollback of that release would
-- still have them to fall back to (per CLAUDE.md migration policy). The multi-series/
-- omnibus feature has been live on master since 2026-07-21 and confirmed stable —
-- application code has not read any of these since that release shipped.

-- book_edition_components: replaced by book_components (omnibus composition moved
-- from BookEdition to Book — see 20260721000000 migration comment).
DROP TABLE IF EXISTS "book_edition_components";

-- book_editions.isOmnibus / componentCount: replaced by books.isOmnibus / componentCount
-- (same rationale — omnibus-ness is a property of the work, not a specific print run).
ALTER TABLE "book_editions" DROP COLUMN IF EXISTS "isOmnibus";
ALTER TABLE "book_editions" DROP COLUMN IF EXISTS "componentCount";

-- books.volumeNumber (single Float): replaced by books.volumeNumbers (Float[]), backfilled
-- in 20260721000000.
ALTER TABLE "books" DROP COLUMN IF EXISTS "volumeNumber";
