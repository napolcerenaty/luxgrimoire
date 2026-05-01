-- Remove legacy taxesAndFees column in favour of feeTemplates system
ALTER TABLE "user_subscription_entries" DROP COLUMN IF EXISTS "taxesAndFees";
ALTER TABLE "user_sub_billing_periods" DROP COLUMN IF EXISTS "taxesAndFees";
ALTER TABLE "user_subscription_cost_changes" DROP COLUMN IF EXISTS "taxesAndFees";
