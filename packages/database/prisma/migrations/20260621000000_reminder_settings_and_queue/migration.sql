-- Remove old reminder columns from user_notification_preferences (they were never deployed, just in previous migration)
ALTER TABLE "user_notification_preferences" DROP COLUMN IF EXISTS "renewalReminderEnabled";
ALTER TABLE "user_notification_preferences" DROP COLUMN IF EXISTS "renewalReminderDays";
ALTER TABLE "user_notification_preferences" DROP COLUMN IF EXISTS "saleReminderEnabled";
ALTER TABLE "user_notification_preferences" DROP COLUMN IF EXISTS "saleReminderDays";

-- UserReminderSettings
CREATE TABLE IF NOT EXISTS "user_reminder_settings" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"              TEXT NOT NULL,
  "renewalEnabled"      BOOLEAN NOT NULL DEFAULT false,
  "renewalInAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "renewalPushEnabled"  BOOLEAN NOT NULL DEFAULT false,
  "renewalDaysBefore"   INTEGER NOT NULL DEFAULT 1,
  "renewalHour"         INTEGER,
  "renewalDigest"       BOOLEAN NOT NULL DEFAULT true,
  "saleEnabled"         BOOLEAN NOT NULL DEFAULT false,
  "saleInAppEnabled"    BOOLEAN NOT NULL DEFAULT true,
  "salePushEnabled"     BOOLEAN NOT NULL DEFAULT false,
  "saleDaysBefore"      INTEGER NOT NULL DEFAULT 0,
  "saleHour"            INTEGER,
  "saleDigest"          BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "user_reminder_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_reminder_settings"
  DROP CONSTRAINT IF EXISTS "user_reminder_settings_userId_fkey";

ALTER TABLE "user_reminder_settings"
  ADD CONSTRAINT "user_reminder_settings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "user_reminder_settings_userId_key"
  ON "user_reminder_settings"("userId");

-- ScheduledReminder
CREATE TABLE IF NOT EXISTS "scheduled_reminders" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"         TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "scheduledAt"    TIMESTAMP(3) NOT NULL,
  "sentAt"         TIMESTAMP(3),
  "cancelledAt"    TIMESTAMP(3),
  "entryId"        TEXT,
  "announcementId" TEXT,
  "tier"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_reminders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "scheduled_reminders"
  DROP CONSTRAINT IF EXISTS "scheduled_reminders_userId_fkey";

ALTER TABLE "scheduled_reminders"
  ADD CONSTRAINT "scheduled_reminders_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "scheduled_reminders_userId_idx"
  ON "scheduled_reminders"("userId");

CREATE INDEX IF NOT EXISTS "scheduled_reminders_scheduledAt_idx"
  ON "scheduled_reminders"("scheduledAt", "sentAt", "cancelledAt");

CREATE INDEX IF NOT EXISTS "scheduled_reminders_entryId_idx"
  ON "scheduled_reminders"("entryId");

CREATE INDEX IF NOT EXISTS "scheduled_reminders_userId_announcementId_idx"
  ON "scheduled_reminders"("userId", "announcementId");
