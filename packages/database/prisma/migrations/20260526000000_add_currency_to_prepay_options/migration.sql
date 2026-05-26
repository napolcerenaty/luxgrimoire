-- Fix: add missing `currency` column to subscription_prepay_options
-- Column exists in Prisma schema but was never added to the database

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_prepay_options' AND column_name = 'currency'
  ) THEN
    -- Add as nullable first
    ALTER TABLE "subscription_prepay_options" ADD COLUMN "currency" VARCHAR(3);

    -- Backfill from parent subscription
    UPDATE "subscription_prepay_options" spo
    SET "currency" = s."currency"
    FROM "subscriptions" s
    WHERE spo."subscriptionId" = s."id";

    -- Set remaining nulls to USD and enforce NOT NULL
    UPDATE "subscription_prepay_options" SET "currency" = 'USD' WHERE "currency" IS NULL;

    ALTER TABLE "subscription_prepay_options" ALTER COLUMN "currency" SET NOT NULL;
    ALTER TABLE "subscription_prepay_options" ALTER COLUMN "currency" SET DEFAULT 'USD';
  END IF;
END $$;
