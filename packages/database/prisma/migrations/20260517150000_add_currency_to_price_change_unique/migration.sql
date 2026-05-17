-- Drop existing unique constraint
ALTER TABLE "subscription_price_changes" DROP CONSTRAINT IF EXISTS "subscription_price_changes_subscriptionId_effectiveYear_effectiveMonth_key";

-- Add new unique constraint including currency
ALTER TABLE "subscription_price_changes" ADD CONSTRAINT "subscription_price_changes_subscriptionId_effectiveYear_effectiveMonth_currency_key" UNIQUE ("subscriptionId", "effectiveYear", "effectiveMonth", "currency");
