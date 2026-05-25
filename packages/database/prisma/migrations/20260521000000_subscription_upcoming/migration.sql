ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "isUpcoming" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "upcomingNote" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "waitlistLink" TEXT;
