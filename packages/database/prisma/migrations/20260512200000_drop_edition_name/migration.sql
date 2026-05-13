-- Remove editionName from book_editions.
-- Safe: column is nullable, new code never reads/writes it.
-- PostgreSQL 12+ soft-deletes the column (no table rewrite), so the
-- ACCESS EXCLUSIVE lock is held only briefly.
-- Run during low-traffic window; IF EXISTS makes this idempotent.

SET lock_timeout = '5s';  -- abort rather than wait indefinitely for lock

DROP INDEX IF EXISTS "book_editions_editionName_trgm_gin";
ALTER TABLE "book_editions" DROP COLUMN IF EXISTS "editionName";
