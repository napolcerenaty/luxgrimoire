-- =============================================================================
-- Cleanup: Remove phantom skip records created after subscription cancellation
-- =============================================================================
-- Root cause: backfillSubscription() did not pass cancellationDate to
--             getEligibleMonths(), so auto-skip records were written for months
--             after the entry was already cancelled.
--
-- This affects 60 records across 4 cancelled entries, 2 users:
--   - fairyloot-adult-book-only     (beaf30af: cancelled 2024-09-11 → 20 phantom records)
--   - fairyloot-romantasy-book-only (beaf30af: cancelled 2024-09-11 → 20 phantom records)
--   - fairyloot-adult-book-only     (a176f07f: cancelled 2025-07-27 → 10 phantom records)
--   - fairyloot-romantasy-book-only (a176f07f: cancelled 2025-07-21 → 10 phantom records)
--
-- After cleanup:
--   - beaf30af: 0 legitimate skips on both cancelled entries → states deleted
--   - a176f07f: 3 legitimate Adult skips + 1 Romantasy skip remain on cancelled
--               component entries; combo subscription starts with 0 used skips
--               (correct — combo is a separate subscription)
--
-- The fix that prevents this from recurring is in commit 75b11ff
-- (backfill now passes cancellationDateObj to getEligibleMonths).
--
-- Safe to run multiple times (idempotent).
-- =============================================================================

BEGIN;

-- ------------------------------------------------------------------
-- Step 1: DRY RUN — show what will be deleted
-- Comment out or remove this block before the actual DELETE run.
-- ------------------------------------------------------------------
-- SELECT
--   use.id AS entry_id,
--   use."userId",
--   s.slug AS subscription,
--   use."cancellationDate",
--   sm.year,
--   sm.month,
--   usr.id AS skip_record_id
-- FROM user_skip_records usr
-- JOIN user_subscription_entries use ON use.id = usr."userEntryId"
-- JOIN subscription_months sm ON sm.id = usr."subscriptionMonthId"
-- JOIN subscriptions s ON s.id = sm."subscriptionId"
-- WHERE use."cancellationDate" IS NOT NULL
--   AND use.active = false
--   AND (
--     sm.year > CAST(SPLIT_PART(use."cancellationDate", '-', 1) AS INTEGER)
--     OR (
--       sm.year  = CAST(SPLIT_PART(use."cancellationDate", '-', 1) AS INTEGER)
--       AND sm.month > CAST(SPLIT_PART(use."cancellationDate", '-', 2) AS INTEGER)
--     )
--   )
-- ORDER BY use.id, sm.year, sm.month;

-- ------------------------------------------------------------------
-- Step 2: Delete phantom skip records
-- Removes all user_skip_records whose calendar month (year/month from
-- subscription_months) falls AFTER the entry's cancellationDate.
-- ------------------------------------------------------------------
DELETE FROM user_skip_records
WHERE id IN (
  SELECT usr.id
  FROM user_skip_records usr
  JOIN user_subscription_entries use ON use.id = usr."userEntryId"
  JOIN subscription_months sm ON sm.id = usr."subscriptionMonthId"
  WHERE use."cancellationDate" IS NOT NULL
    AND use.active = false
    AND (
      sm.year > CAST(SPLIT_PART(use."cancellationDate", '-', 1) AS INTEGER)
      OR (
        sm.year  = CAST(SPLIT_PART(use."cancellationDate", '-', 1) AS INTEGER)
        AND sm.month > CAST(SPLIT_PART(use."cancellationDate", '-', 2) AS INTEGER)
      )
    )
);

-- ------------------------------------------------------------------
-- Step 3: Reset corrupted skip states for affected (userId, subscriptionId)
-- Pairs where the skip count was inflated by the phantom records.
-- States will be recomputed from remaining legitimate records on next
-- access, or can be left as deleted for inactive subscriptions.
-- ------------------------------------------------------------------

-- beaf30af: both cancelled entries had ZERO legitimate skips → delete states entirely
DELETE FROM user_subscription_skip_states
WHERE "userId" = 'beaf30af-7592-47a4-8967-da496bea19fa'
  AND "subscriptionId" IN (
    '701c7c84-0e9c-468f-9a3e-f586ab372e76',  -- fairyloot-adult-book-only
    '695563fb-8cee-4520-8884-b7256e49e770'   -- fairyloot-romantasy-book-only
  );

-- a176f07f: cancelled component entries had some legitimate skips (3 Adult, 1 Romantasy)
-- but these are inactive subscriptions (user moved to combo). Delete stale states;
-- if the user ever directly re-subscribes (not via combo), the engine will rebuild them.
DELETE FROM user_subscription_skip_states
WHERE "userId" = 'a176f07f-748a-4ee1-bf7a-53e68d5b195e'
  AND "subscriptionId" IN (
    '701c7c84-0e9c-468f-9a3e-f586ab372e76',  -- fairyloot-adult-book-only (cancelled 2025-07-27)
    '695563fb-8cee-4520-8884-b7256e49e770'   -- fairyloot-romantasy-book-only (cancelled 2025-07-21)
  );

-- ------------------------------------------------------------------
-- Step 4: Verification — should return 0 rows if cleanup was successful
-- ------------------------------------------------------------------
SELECT COUNT(*) AS remaining_phantom_records
FROM user_skip_records usr
JOIN user_subscription_entries use ON use.id = usr."userEntryId"
JOIN subscription_months sm ON sm.id = usr."subscriptionMonthId"
WHERE use."cancellationDate" IS NOT NULL
  AND use.active = false
  AND (
    sm.year > CAST(SPLIT_PART(use."cancellationDate", '-', 1) AS INTEGER)
    OR (
      sm.year  = CAST(SPLIT_PART(use."cancellationDate", '-', 1) AS INTEGER)
      AND sm.month > CAST(SPLIT_PART(use."cancellationDate", '-', 2) AS INTEGER)
    )
  );

COMMIT;
