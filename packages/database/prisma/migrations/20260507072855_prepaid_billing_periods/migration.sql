-- DropForeignKey
ALTER TABLE "user_subscription_entries" DROP CONSTRAINT IF EXISTS "user_subscription_entries_subscriptionId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "audit_logs_action_trgm_gin";

-- DropIndex
DROP INDEX IF EXISTS "books_title_trgm_gin";

-- AlterTable
ALTER TABLE "subscription_prepay_options"
  ADD COLUMN IF NOT EXISTS "validFrom" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_book_entries"
  ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT;

-- AlterTable
ALTER TABLE "user_purchase_groups"
  ADD COLUMN IF NOT EXISTS "billingPeriodId" TEXT;

-- AlterTable
ALTER TABLE "user_subscription_entries"
  ADD COLUMN IF NOT EXISTS "scheduledPrepayOptionId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_purchase_groups_billingPeriodId_idx" ON "user_purchase_groups"("billingPeriodId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_subscription_entries_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "user_subscription_entries"
      ADD CONSTRAINT "user_subscription_entries_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_subscription_entries_scheduledPrepayOptionId_fkey'
  ) THEN
    ALTER TABLE "user_subscription_entries"
      ADD CONSTRAINT "user_subscription_entries_scheduledPrepayOptionId_fkey"
      FOREIGN KEY ("scheduledPrepayOptionId") REFERENCES "subscription_prepay_options"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_purchase_groups_billingPeriodId_fkey'
  ) THEN
    ALTER TABLE "user_purchase_groups"
      ADD CONSTRAINT "user_purchase_groups_billingPeriodId_fkey"
      FOREIGN KEY ("billingPeriodId") REFERENCES "user_sub_billing_periods"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- RenameIndex (only if old name exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'subscription_price_changes_subscriptionId_effectiveYear_effecti'
  ) THEN
    ALTER INDEX "subscription_price_changes_subscriptionId_effectiveYear_effecti"
      RENAME TO "subscription_price_changes_subscriptionId_effectiveYear_eff_key";
  END IF;
END $$;

