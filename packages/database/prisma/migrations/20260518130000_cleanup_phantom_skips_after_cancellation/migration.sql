-- Migration: cleanup phantom skip records created after entry cancellation
--
-- Root cause: backfillSubscription() did not pass cancellationDate to
-- getEligibleMonths(), so auto-skip records were written for months after
-- the entry was already cancelled. Fixed in commit 75b11ff.
--
-- This migration removes the data that was incorrectly written to production:
--   - 60 phantom user_skip_records across 4 cancelled entries (2 users)
--   - 4 corrupted user_subscription_skip_states for those (userId, subscriptionId) pairs
--
-- Uses a data-modifying CTE so both deletes run atomically and the set of
-- affected pairs is identified only once (before any rows are deleted).

WITH phantom_records AS (
  SELECT
    usr.id       AS skip_id,
    use."userId"         AS user_id,
    use."subscriptionId" AS subscription_id
  FROM user_skip_records usr
  JOIN user_subscription_entries use ON use.id = usr."userEntryId"
  JOIN subscription_months sm        ON sm.id  = usr."subscriptionMonthId"
  WHERE use."cancellationDate" IS NOT NULL
    AND use.active = false
    AND (
      sm.year > CAST(SPLIT_PART(use."cancellationDate", '-', 1) AS INTEGER)
      OR (
        sm.year  = CAST(SPLIT_PART(use."cancellationDate", '-', 1) AS INTEGER)
        AND sm.month > CAST(SPLIT_PART(use."cancellationDate", '-', 2) AS INTEGER)
      )
    )
),
deleted_skip_records AS (
  DELETE FROM user_skip_records
  WHERE id IN (SELECT skip_id FROM phantom_records)
  RETURNING id
)
-- Remove skip states whose counts were inflated by the phantom records.
-- States will be rebuilt on next access if the user ever re-subscribes.
DELETE FROM user_subscription_skip_states
WHERE ("userId", "subscriptionId") IN (
  SELECT DISTINCT user_id, subscription_id FROM phantom_records
);
