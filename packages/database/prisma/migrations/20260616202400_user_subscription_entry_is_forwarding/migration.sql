-- ── Add isForwarding flag to user_subscription_entries ──────────────────────

ALTER TABLE "user_subscription_entries"
  ADD COLUMN IF NOT EXISTS "isForwarding" BOOLEAN NOT NULL DEFAULT false;
