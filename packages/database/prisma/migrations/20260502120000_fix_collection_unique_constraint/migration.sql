-- Fix: actually drop the unique constraint on user_book_entries (correct table name)
-- The previous migration used wrong index name (model name vs table name)
DROP INDEX IF EXISTS "user_book_entries_userId_bookId_editionId_key";

-- Ensure the non-unique index exists
CREATE INDEX IF NOT EXISTS "user_book_entries_userId_bookId_editionId_idx" ON "user_book_entries"("userId", "bookId", "editionId");
