-- Convert SubscriptionSkipPolicy from one-to-one (subscriptionId @id) to one-to-many (id PK)
-- and rename eligibleBillingTypes → billingType with value mapping.
-- All statements are guarded for production safety.

-- Step 1: Add new id column (generate UUIDs for existing rows)
ALTER TABLE "subscription_skip_policies" ADD COLUMN IF NOT EXISTS "id" TEXT;
UPDATE "subscription_skip_policies" SET "id" = gen_random_uuid()::TEXT WHERE "id" IS NULL;
ALTER TABLE "subscription_skip_policies" ALTER COLUMN "id" SET NOT NULL;

-- Step 2: Add billingType column, map from eligibleBillingTypes (if the old column still exists)
ALTER TABLE "subscription_skip_policies" ADD COLUMN IF NOT EXISTS "billingType" TEXT NOT NULL DEFAULT 'ALL';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_skip_policies' AND column_name = 'eligibleBillingTypes'
  ) THEN
    UPDATE "subscription_skip_policies"
      SET "billingType" = CASE
        WHEN "eligibleBillingTypes" = 'MONTHLY_ONLY' THEN 'MONTHLY'
        WHEN "eligibleBillingTypes" = 'PREPAID_ONLY' THEN 'PREPAID'
        ELSE 'ALL'
      END;
  END IF;
END $$;

-- Step 3: Drop old primary key, add new id PK
ALTER TABLE "subscription_skip_policies" DROP CONSTRAINT IF EXISTS "subscription_skip_policies_pkey";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_skip_policies_pkey'
  ) THEN
    ALTER TABLE "subscription_skip_policies" ADD CONSTRAINT "subscription_skip_policies_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

-- Step 4: Add unique constraint on (subscriptionId, billingType)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_skip_policies_subscriptionId_billingType_key'
  ) THEN
    ALTER TABLE "subscription_skip_policies"
      ADD CONSTRAINT "subscription_skip_policies_subscriptionId_billingType_key" UNIQUE ("subscriptionId", "billingType");
  END IF;
END $$;

-- Step 5: Drop old eligibleBillingTypes column
ALTER TABLE "subscription_skip_policies" DROP COLUMN IF EXISTS "eligibleBillingTypes";
