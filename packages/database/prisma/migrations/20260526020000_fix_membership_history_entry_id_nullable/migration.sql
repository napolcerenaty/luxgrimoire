-- Fix user_subscription_membership_history.entryId:
-- Schema defines it as String? (nullable) with onDelete: SetNull,
-- but original migration created it as NOT NULL with ON DELETE CASCADE.
-- This causes orphaned membership history records to be CASCADE deleted
-- instead of keeping them with entryId set to NULL.

-- Step 1: Drop old CASCADE FK constraint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_subscription_membership_history_entryId_fkey'
      AND table_name = 'user_subscription_membership_history'
  ) THEN
    ALTER TABLE "user_subscription_membership_history"
      DROP CONSTRAINT "user_subscription_membership_history_entryId_fkey";
  END IF;
END $$;

-- Step 2: Make entryId nullable (was NOT NULL, schema expects String?)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_subscription_membership_history'
      AND column_name = 'entryId'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "user_subscription_membership_history"
      ALTER COLUMN "entryId" DROP NOT NULL;
  END IF;
END $$;

-- Step 3: Re-add FK with ON DELETE SET NULL to match schema onDelete: SetNull
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_subscription_membership_history_entryId_fkey'
      AND table_name = 'user_subscription_membership_history'
  ) THEN
    ALTER TABLE "user_subscription_membership_history"
      ADD CONSTRAINT "user_subscription_membership_history_entryId_fkey"
      FOREIGN KEY ("entryId") REFERENCES "user_subscription_entries"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
