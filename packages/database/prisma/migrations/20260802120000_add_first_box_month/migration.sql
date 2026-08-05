-- User-confirmed override for the subscription entry's first box month, set during the join
-- flow's mandatory "choose your first box" step. Null for entries created before this feature
-- (and for existing entries until the one-off backfill script runs); falls back to the live
-- computeFirstEligibleBoxMonth() calculation everywhere it's read.
ALTER TABLE "user_subscription_entries" ADD COLUMN IF NOT EXISTS "firstBoxYear" INTEGER;
ALTER TABLE "user_subscription_entries" ADD COLUMN IF NOT EXISTS "firstBoxMonth" INTEGER;
