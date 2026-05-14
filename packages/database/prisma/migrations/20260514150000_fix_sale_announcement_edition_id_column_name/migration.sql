-- Fix column name mismatch: Prisma schema uses camelCase (saleAnnouncementEditionId)
-- but the previous migration created it as snake_case (sale_announcement_edition_id).
-- All other FK columns in user_book_entries use camelCase (purchaseGroupId, subscriptionEntryId, etc.)

ALTER TABLE "user_book_entries"
  RENAME COLUMN "sale_announcement_edition_id" TO "saleAnnouncementEditionId";

-- Rename the index to match Prisma's generated name
DROP INDEX IF EXISTS "user_book_entries_sale_announcement_edition_id_idx";
CREATE INDEX IF NOT EXISTS "user_book_entries_saleAnnouncementEditionId_idx"
  ON "user_book_entries"("saleAnnouncementEditionId");

-- Rename the FK constraint
ALTER TABLE "user_book_entries"
  RENAME CONSTRAINT "user_book_entries_sale_announcement_edition_id_fkey"
  TO "user_book_entries_saleAnnouncementEditionId_fkey";
