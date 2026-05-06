-- AlterTable
ALTER TABLE "user_purchase_groups" ADD COLUMN IF NOT EXISTS "isSecondHand" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_purchase_groups" ADD COLUMN IF NOT EXISTS "sourcePlatform" TEXT;
