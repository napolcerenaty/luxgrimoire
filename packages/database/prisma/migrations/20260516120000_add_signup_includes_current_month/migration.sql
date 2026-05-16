-- AlterTable: add signupIncludesCurrentMonth to subscriptions
ALTER TABLE "subscriptions" ADD COLUMN "signupIncludesCurrentMonth" BOOLEAN NOT NULL DEFAULT false;
