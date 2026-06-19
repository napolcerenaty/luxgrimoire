ALTER TABLE "user_reminder_settings"
  ADD COLUMN IF NOT EXISTS "appNotifInAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "appNotifPushEnabled"  BOOLEAN NOT NULL DEFAULT false;
