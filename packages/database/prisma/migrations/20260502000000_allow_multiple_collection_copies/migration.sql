-- Allow users to own multiple copies of the same edition
-- Drop the unique constraint so multiple UserBookEntry rows per (userId, bookId, editionId) are allowed
-- Keep a non-unique index for query performance

DROP INDEX IF EXISTS "user_book_entries_userId_bookId_editionId_key";

CREATE INDEX IF NOT EXISTS "user_book_entries_userId_bookId_editionId_idx" ON "user_book_entries"("userId", "bookId", "editionId");
