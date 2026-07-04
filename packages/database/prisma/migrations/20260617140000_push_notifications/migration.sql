-- CreateTable: user_notification_preferences
CREATE TABLE IF NOT EXISTS "user_notification_preferences" (
    "id"                     TEXT NOT NULL,
    "userId"                 TEXT NOT NULL,
    "renewalReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "renewalReminderDays"    INTEGER NOT NULL DEFAULT 3,
    "saleReminderEnabled"    BOOLEAN NOT NULL DEFAULT true,
    "saleReminderDays"       INTEGER NOT NULL DEFAULT 3,
    "pushEnabled"            BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable: push_subscriptions
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "endpoint"  TEXT NOT NULL,
    "p256dh"    TEXT NOT NULL,
    "auth"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "failedAt"  TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_notification_preferences_userId_key" ON "user_notification_preferences"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- AddForeignKey
ALTER TABLE "user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
