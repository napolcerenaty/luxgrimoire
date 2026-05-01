-- Add isDefaultPricing to user_subscription_entries
ALTER TABLE "user_subscription_entries" ADD COLUMN IF NOT EXISTS "isDefaultPricing" BOOLEAN NOT NULL DEFAULT true;

-- Create subscription_price_changes table
CREATE TABLE IF NOT EXISTS "subscription_price_changes" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "effectiveMonth" INTEGER NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "newBasePrice" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_price_changes_pkey" PRIMARY KEY ("id")
);

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_price_changes_subscriptionId_effectiveYear_effectiveMonth_key"
    ON "subscription_price_changes"("subscriptionId", "effectiveYear", "effectiveMonth");

-- Index
CREATE INDEX IF NOT EXISTS "subscription_price_changes_subscriptionId_idx"
    ON "subscription_price_changes"("subscriptionId");

-- Foreign key
ALTER TABLE "subscription_price_changes"
    ADD CONSTRAINT "subscription_price_changes_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
