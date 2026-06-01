-- Add year column to user_stats_snapshots
-- year = 0 means all-time snapshot, positive integer means per-year spending snapshot

-- Clear all existing snapshots so users get fresh per-year snapshots generated on next request
TRUNCATE TABLE user_stats_snapshots;

ALTER TABLE user_stats_snapshots ADD COLUMN IF NOT EXISTS year INTEGER NOT NULL DEFAULT 0;

-- Drop old unique constraint and index (index may survive constraint drop in some PostgreSQL versions)
ALTER TABLE user_stats_snapshots DROP CONSTRAINT IF EXISTS "user_stats_snapshots_userId_currency_key";
DROP INDEX IF EXISTS "user_stats_snapshots_userId_currency_key";
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'user_stats_snapshots'
      AND constraint_name = 'user_stats_snapshots_userId_currency_year_key'
  ) THEN
    ALTER TABLE user_stats_snapshots ADD CONSTRAINT "user_stats_snapshots_userId_currency_year_key" UNIQUE ("userId", currency, year);
  END IF;
END $$;

-- Add index on year for efficient year-specific queries
CREATE INDEX IF NOT EXISTS "user_stats_snapshots_year_idx" ON user_stats_snapshots(year) WHERE year > 0;
