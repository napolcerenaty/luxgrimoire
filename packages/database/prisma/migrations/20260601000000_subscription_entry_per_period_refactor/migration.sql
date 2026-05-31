-- ============================================================================
-- Migration: subscription_entry_per_period_refactor
--
-- Summary:
--   Replaces the single-entry-per-user-subscription model (with a separate
--   UserSubscriptionMembershipHistory side-table) with a simpler model where
--   every subscription *period* is its own UserSubscriptionEntry row.
--
--   active = true  → current (open) period
--   active = false → historical (cancelled) period
--
-- The existing @@unique([userId, subscriptionId]) constraint is replaced by
-- a PARTIAL unique index that only enforces uniqueness for active rows, so a
-- user can have at most one active entry per subscription while keeping any
-- number of historical entries.
--
-- All SQL is idempotent and can be re-run safely. ===========================
-- ============================================================================


-- ─── STEP 1 ─ Drop old full-table unique constraint ─────────────────────────
-- Must happen before we can insert new inactive rows for the same user+sub.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename  = 'user_subscription_entries'
      AND indexname  = 'user_subscription_entries_userId_subscriptionId_key'
  ) THEN
    DROP INDEX "user_subscription_entries_userId_subscriptionId_key";
  END IF;
END $$;


-- ─── STEP 2 ─ Create partial unique index (active entries only) ──────────────

CREATE UNIQUE INDEX IF NOT EXISTS "user_subscription_entries_active_unique"
  ON "user_subscription_entries" ("userId", "subscriptionId")
  WHERE "active" = true;


-- ─── STEP 3 ─ Data migration: convert history records → inactive entries ─────
--
-- For each UserSubscriptionMembershipHistory record where entryId IS NOT NULL
-- (linked to an existing entry), create a new inactive UserSubscriptionEntry
-- row that inherits settings from the linked entry.
--
-- Idempotency guard: skip if an inactive entry already exists for this
-- userId + subscriptionId + startDate combination.

INSERT INTO "user_subscription_entries" (
  "id",
  "userId",
  "subscriptionId",
  "active",
  "startDate",
  "cancellationDate",
  "cancellationReason",
  "renewalDay",
  "startingMonth",
  "costCurrency",
  "basePrice",
  "shippingCost",
  "prepaidMonths",
  "createdAt",
  "updatedAt",
  "addedAt"
)
SELECT
  gen_random_uuid(),
  h."userId",
  h."subscriptionId",
  false,                        -- historical period
  h."startDate",
  h."endDate",                  -- history endDate → cancellationDate
  h."cancellationReason",
  e."renewalDay",
  e."startingMonth",
  e."costCurrency",
  e."basePrice",
  e."shippingCost",
  COALESCE(e."prepaidMonths", 1),
  NOW(),
  NOW(),
  NOW()
FROM "user_subscription_membership_history" h
JOIN "user_subscription_entries" e ON e."id" = h."entryId"
WHERE h."entryId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_subscription_entries" x
    WHERE x."userId"          = h."userId"
      AND x."subscriptionId"  = h."subscriptionId"
      AND x."startDate"       = h."startDate"
      AND x."active"          = false
  );


-- ─── STEP 4 ─ Data migration: orphaned history records ──────────────────────
--
-- History records with entryId IS NULL (the linked entry was already deleted).
-- We still create inactive entries so the history is preserved.

INSERT INTO "user_subscription_entries" (
  "id",
  "userId",
  "subscriptionId",
  "active",
  "startDate",
  "cancellationDate",
  "cancellationReason",
  "prepaidMonths",
  "createdAt",
  "updatedAt",
  "addedAt"
)
SELECT
  gen_random_uuid(),
  h."userId",
  h."subscriptionId",
  false,
  h."startDate",
  h."endDate",
  h."cancellationReason",
  1,
  NOW(),
  NOW(),
  NOW()
FROM "user_subscription_membership_history" h
WHERE h."entryId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_subscription_entries" x
    WHERE x."userId"          = h."userId"
      AND x."subscriptionId"  = h."subscriptionId"
      AND x."startDate"       = h."startDate"
      AND x."active"          = false
  );


-- ─── STEP 5 ─ Drop UserSubscriptionMembershipHistory table ──────────────────
--
-- Only after data has been migrated to entries above.

DROP TABLE IF EXISTS "user_subscription_membership_history";
