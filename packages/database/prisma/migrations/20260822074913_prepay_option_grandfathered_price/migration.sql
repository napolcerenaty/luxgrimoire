ALTER TABLE subscription_prepay_options ADD COLUMN IF NOT EXISTS "grandfatheredPrice" BOOLEAN NOT NULL DEFAULT false;
