-- CreateTable
CREATE TABLE "subscription_country_fee_snapshots" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_country_fee_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_country_fee_snapshots_subscriptionId_idx" ON "subscription_country_fee_snapshots"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_country_fee_snapshots_subscriptionId_country_key" ON "subscription_country_fee_snapshots"("subscriptionId", "country");

-- AddForeignKey
ALTER TABLE "subscription_country_fee_snapshots" ADD CONSTRAINT "subscription_country_fee_snapshots_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
