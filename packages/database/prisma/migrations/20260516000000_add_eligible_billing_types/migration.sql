-- AlterTable
ALTER TABLE "subscription_skip_policies" ADD COLUMN "eligibleBillingTypes" TEXT NOT NULL DEFAULT 'ALL';
