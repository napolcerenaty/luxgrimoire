-- CreateTable
CREATE TABLE "edition_stats_snapshots" (
    "editionId" TEXT NOT NULL,
    "saleStats" JSONB,
    "collectionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edition_stats_snapshots_pkey" PRIMARY KEY ("editionId")
);

-- CreateTable
CREATE TABLE "subscription_stats_snapshots" (
    "subscriptionId" TEXT NOT NULL,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_stats_snapshots_pkey" PRIMARY KEY ("subscriptionId")
);

-- AddForeignKey
ALTER TABLE "edition_stats_snapshots" ADD CONSTRAINT "edition_stats_snapshots_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_stats_snapshots" ADD CONSTRAINT "subscription_stats_snapshots_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
