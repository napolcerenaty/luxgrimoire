-- DropIndex
DROP INDEX "subscriptions_type_idx";

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "intervalMonths" INTEGER NOT NULL DEFAULT 1;

-- Backfill from existing type column
UPDATE "subscriptions" SET "intervalMonths" = 2 WHERE type = 'BIMONTHLY';
UPDATE "subscriptions" SET "intervalMonths" = 3 WHERE type = 'QUARTERLY';

-- CreateIndex
CREATE INDEX "subscriptions_intervalMonths_idx" ON "subscriptions"("intervalMonths");
