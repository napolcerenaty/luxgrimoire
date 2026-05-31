CREATE TABLE IF NOT EXISTS "user_stats_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "moduleVersions" JSONB NOT NULL DEFAULT '{}',
    "spending" JSONB,
    "collection" JSONB,
    "features" JSONB,

    CONSTRAINT "user_stats_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_stats_snapshots_userId_currency_key" ON "user_stats_snapshots"("userId", "currency");
CREATE INDEX IF NOT EXISTS "user_stats_snapshots_userId_idx" ON "user_stats_snapshots"("userId");
CREATE INDEX IF NOT EXISTS "user_stats_snapshots_isStale_idx" ON "user_stats_snapshots"("isStale");

ALTER TABLE "user_stats_snapshots" DROP CONSTRAINT IF EXISTS "user_stats_snapshots_userId_fkey";
ALTER TABLE "user_stats_snapshots" ADD CONSTRAINT "user_stats_snapshots_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
