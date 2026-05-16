-- AlterTable
ALTER TABLE "subscription_skip_policies" ADD COLUMN "allowUnskip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "unskipDeadlineType" TEXT NOT NULL DEFAULT 'DAYS_BEFORE',
ADD COLUMN "unskipDeadlineDaysBefore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "unskipDeadlineDayOfMonth" INTEGER,
ADD COLUMN "unskipNotes" TEXT,
ADD COLUMN "unskipHow" TEXT;
