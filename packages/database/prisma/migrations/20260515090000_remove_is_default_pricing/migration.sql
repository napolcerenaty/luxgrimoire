-- Remove isDefaultPricing column from user_subscription_entries (unused feature)
ALTER TABLE "user_subscription_entries" DROP COLUMN IF EXISTS "isDefaultPricing";
