-- CreateTable: subscription_settings_history
-- Tracks historical changes to subscription renewal/billing settings
-- so backfill can reconstruct correct renewalDate per historical month.

CREATE TABLE "subscription_settings_history" (
    "id"                          TEXT NOT NULL,
    "subscriptionId"              TEXT NOT NULL,
    "effectiveFrom"               TIMESTAMP(3) NOT NULL,
    "renewalDay"                  INTEGER,
    "renewalDayUserSet"           BOOLEAN NOT NULL,
    "paymentOnStartup"            BOOLEAN NOT NULL,
    "signupIncludesCurrentMonth"  BOOLEAN NOT NULL,
    "renewalMonthOffset"          INTEGER NOT NULL,
    "changedBy"                   TEXT,
    "notes"                       TEXT,
    "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_settings_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_settings_history_subscriptionId_effectiveFrom_idx"
    ON "subscription_settings_history"("subscriptionId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "subscription_settings_history"
    ADD CONSTRAINT "subscription_settings_history_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId")
    REFERENCES "subscriptions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: insert initial snapshot for all existing subscriptions
-- (effectiveFrom = subscription createdAt = "was always like this")
INSERT INTO "subscription_settings_history" (
    "id", "subscriptionId", "effectiveFrom",
    "renewalDay", "renewalDayUserSet", "paymentOnStartup",
    "signupIncludesCurrentMonth", "renewalMonthOffset",
    "changedBy", "notes", "createdAt"
)
SELECT
    gen_random_uuid()::text,
    s."id",
    s."createdAt",
    s."renewalDay",
    s."renewalDayUserSet",
    s."paymentOnStartup",
    s."signupIncludesCurrentMonth",
    s."renewalMonthOffset",
    NULL,
    'Initial migration snapshot',
    CURRENT_TIMESTAMP
FROM "subscriptions" s;
