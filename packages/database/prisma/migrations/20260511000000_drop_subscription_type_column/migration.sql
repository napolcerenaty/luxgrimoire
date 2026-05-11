-- Phase 2: Drop legacy `type` column from subscriptions
-- Phase 1 (20260510000000_add_interval_months_backfill) already:
--   - added `intervalMonths INT NOT NULL DEFAULT 1`
--   - backfilled all rows (BIMONTHLY→2, QUARTERLY→3, else→1)
--   - added @@index([intervalMonths])
-- All application code has been updated to use intervalMonths.

ALTER TABLE "subscriptions" DROP COLUMN "type";
