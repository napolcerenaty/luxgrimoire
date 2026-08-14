-- Per-book price allocation within a UserPurchaseGroup.
-- Additive only: both columns are safe defaults for existing rows, no backfill needed.
-- basePrice stays NULL on legacy entries; readers fall back to totalAmount / entryCount.

ALTER TABLE "user_purchase_groups" ADD COLUMN IF NOT EXISTS "priceDistribution" TEXT NOT NULL DEFAULT 'EQUAL';

ALTER TABLE "user_book_entries" ADD COLUMN IF NOT EXISTS "basePrice" DECIMAL(10,2);
