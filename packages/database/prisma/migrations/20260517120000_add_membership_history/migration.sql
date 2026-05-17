-- CreateTable
CREATE TABLE "user_subscription_membership_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_subscription_membership_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_subscription_membership_history_userId_subscriptionId_idx" ON "user_subscription_membership_history"("userId", "subscriptionId");

-- CreateIndex
CREATE INDEX "user_subscription_membership_history_userId_idx" ON "user_subscription_membership_history"("userId");

-- AddForeignKey
ALTER TABLE "user_subscription_membership_history" ADD CONSTRAINT "user_subscription_membership_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_membership_history" ADD CONSTRAINT "user_subscription_membership_history_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_membership_history" ADD CONSTRAINT "user_subscription_membership_history_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "user_subscription_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
