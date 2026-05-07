-- DropForeignKey
ALTER TABLE "user_subscription_entries" DROP CONSTRAINT "user_subscription_entries_subscriptionId_fkey";

-- DropIndex
DROP INDEX "audit_logs_action_trgm_gin";

-- DropIndex
DROP INDEX "books_title_trgm_gin";

-- AlterTable
ALTER TABLE "subscription_prepay_options" ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_book_entries" ADD COLUMN     "trackingNumber" TEXT;

-- AlterTable
ALTER TABLE "user_purchase_groups" ADD COLUMN     "billingPeriodId" TEXT;

-- AlterTable
ALTER TABLE "user_subscription_entries" ADD COLUMN     "scheduledPrepayOptionId" TEXT;

-- CreateIndex
CREATE INDEX "user_purchase_groups_billingPeriodId_idx" ON "user_purchase_groups"("billingPeriodId");

-- AddForeignKey
ALTER TABLE "user_subscription_entries" ADD CONSTRAINT "user_subscription_entries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_entries" ADD CONSTRAINT "user_subscription_entries_scheduledPrepayOptionId_fkey" FOREIGN KEY ("scheduledPrepayOptionId") REFERENCES "subscription_prepay_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_groups" ADD CONSTRAINT "user_purchase_groups_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "user_sub_billing_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "subscription_price_changes_subscriptionId_effectiveYear_effecti" RENAME TO "subscription_price_changes_subscriptionId_effectiveYear_eff_key";
