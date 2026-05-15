-- Migration: Subscription.price → sentinel SubscriptionPriceChange
-- Safe for production: data migration first, then column drop.
-- Sentinel records use effectiveYear=1900, effectiveMonth=1 to represent
-- "the price from the very beginning" — always matched by resolveEffectiveBasePrice.

-- Step 1: Back-fill sentinel price change records for all subscriptions that
--         currently have a price set. ON CONFLICT DO NOTHING ensures idempotency
--         in case this migration is re-run or records already exist.
INSERT INTO "subscription_price_changes"
  ("id", "subscriptionId", "effectiveMonth", "effectiveYear", "newBasePrice", "currency", "createdAt")
SELECT
  gen_random_uuid()                                   AS "id",
  s.id                                                AS "subscriptionId",
  1                                                   AS "effectiveMonth",
  1900                                                AS "effectiveYear",
  CAST(s.price AS DECIMAL(10, 2))                     AS "newBasePrice",
  COALESCE(NULLIF(TRIM(s.currency), ''), 'EUR')       AS "currency",
  NOW()                                               AS "createdAt"
FROM "subscriptions" s
WHERE s.price IS NOT NULL
  AND TRIM(s.price) != ''
  AND CAST(s.price AS DECIMAL(10, 2)) > 0
ON CONFLICT ("subscriptionId", "effectiveYear", "effectiveMonth") DO NOTHING;

-- Step 2: Drop the now-redundant price column.
ALTER TABLE "subscriptions" DROP COLUMN "price";
