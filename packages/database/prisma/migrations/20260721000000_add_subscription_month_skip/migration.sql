CREATE TABLE IF NOT EXISTS "subscription_month_skips" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "subscription_month_skips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_month_skips_subscriptionId_year_month_key" ON "subscription_month_skips"("subscriptionId", "year", "month");

CREATE INDEX IF NOT EXISTS "subscription_month_skips_subscriptionId_idx" ON "subscription_month_skips"("subscriptionId");

ALTER TABLE "subscription_month_skips" DROP CONSTRAINT IF EXISTS "subscription_month_skips_subscriptionId_fkey";
ALTER TABLE "subscription_month_skips" ADD CONSTRAINT "subscription_month_skips_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
