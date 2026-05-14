-- DropIndex (idempotent)
DROP INDEX IF EXISTS "subscriptions_type_idx";

-- AlterTable (idempotent)
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "intervalMonths" INTEGER NOT NULL DEFAULT 1;

-- Backfill from existing type column (safe to re-run)
UPDATE "subscriptions" SET "intervalMonths" = 2 WHERE type = 'BIMONTHLY';
UPDATE "subscriptions" SET "intervalMonths" = 3 WHERE type = 'QUARTERLY';

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "subscriptions_intervalMonths_idx" ON "subscriptions"("intervalMonths");
