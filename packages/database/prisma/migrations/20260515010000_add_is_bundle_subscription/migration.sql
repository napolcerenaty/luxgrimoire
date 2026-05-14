-- Add isBundleSubscription flag to subscriptions
-- Safe for production: ADD COLUMN IF NOT EXISTS with DEFAULT, no data loss

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "isBundleSubscription" BOOLEAN NOT NULL DEFAULT false;
