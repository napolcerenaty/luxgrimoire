-- Series-continuation notifications: opt-out settings on user_reminder_settings, and a
-- debounce table that batches recipients matched when a new edition is linked to a
-- SaleAnnouncement, so a cron can send one combined notification per [user, announcement]
-- instead of one per edition. Additive only.

ALTER TABLE "user_reminder_settings" ADD COLUMN IF NOT EXISTS "seriesContinuationInAppEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_reminder_settings" ADD COLUMN IF NOT EXISTS "seriesContinuationPushEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "pending_series_continuation_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleAnnouncementId" TEXT NOT NULL,
    "editionIds" TEXT[] NOT NULL DEFAULT '{}',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_series_continuation_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pending_series_continuation_notifications_userId_saleAnnouncementId_key"
    ON "pending_series_continuation_notifications"("userId", "saleAnnouncementId");

CREATE INDEX IF NOT EXISTS "pending_series_continuation_notifications_scheduledFor_idx"
    ON "pending_series_continuation_notifications"("scheduledFor");

DO $$ BEGIN
  ALTER TABLE "pending_series_continuation_notifications" ADD CONSTRAINT "pending_series_continuation_notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pending_series_continuation_notifications" ADD CONSTRAINT "pending_series_continuation_notifications_saleAnnouncementId_fkey"
    FOREIGN KEY ("saleAnnouncementId") REFERENCES "sale_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
