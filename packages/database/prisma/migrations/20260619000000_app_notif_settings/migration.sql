ALTER TABLE "user_reminder_settings"
  ADD COLUMN IF NOT EXISTS "appNotifPushEnabled" BOOLEAN NOT NULL DEFAULT false;
