ALTER TABLE subscription_price_changes ADD COLUMN IF NOT EXISTS "grandfatheredPrice" BOOLEAN NOT NULL DEFAULT false;
