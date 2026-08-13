-- Per-user, per-company snapshot of expected shipping/fee costs on sale announcement
-- purchases, derived from that user's own purchase history. Additive only — new table,
-- no changes to existing columns.

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_company_cost_snapshots" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "currency"     TEXT,
    "purchases"    JSONB NOT NULL,
    "sampleWindow" INTEGER NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_company_cost_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_company_cost_snapshots_userId_idx" ON "user_company_cost_snapshots"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_company_cost_snapshots_userId_companyId_key" ON "user_company_cost_snapshots"("userId", "companyId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_company_cost_snapshots_userId_fkey'
  ) THEN
    ALTER TABLE "user_company_cost_snapshots" ADD CONSTRAINT "user_company_cost_snapshots_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_company_cost_snapshots_companyId_fkey'
  ) THEN
    ALTER TABLE "user_company_cost_snapshots" ADD CONSTRAINT "user_company_cost_snapshots_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
