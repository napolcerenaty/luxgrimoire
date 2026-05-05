-- AlterTable: add renewalMonthOffset to subscriptions
ALTER TABLE "subscriptions" ADD COLUMN "renewalMonthOffset" INTEGER NOT NULL DEFAULT 0;
