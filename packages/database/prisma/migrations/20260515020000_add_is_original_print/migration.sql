-- Add isOriginalPrint to UserBookEntry
-- Safe: ADD COLUMN IF NOT EXISTS with DEFAULT true, backfills all existing entries as original prints
ALTER TABLE "user_book_entries" ADD COLUMN IF NOT EXISTS "isOriginalPrint" BOOLEAN NOT NULL DEFAULT true;
