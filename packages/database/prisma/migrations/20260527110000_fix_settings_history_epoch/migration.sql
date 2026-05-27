-- Fix: initial settings history snapshots used sub.createdAt as effectiveFrom,
-- which causes resolveEffectiveSettings to skip them for months backfilled before
-- the subscription was added to the DB (common case: archival data since 2015).
--
-- Initial snapshots represent "settings from the beginning of time" so they
-- should use epoch (1970-01-01) as effectiveFrom — the same sentinel pattern
-- used by subscription_price_changes.

UPDATE "subscription_settings_history"
SET "effectiveFrom" = '1970-01-01T00:00:00.000Z'
WHERE "notes" = 'Initial migration snapshot';
