-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "ownership_status_history" (
    "id" TEXT NOT NULL,
    "userBookEntryId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "ownership_status_history_userBookEntryId_changedAt_idx" ON "ownership_status_history"("userBookEntryId", "changedAt");

-- AddForeignKey (skip if exists)
DO $$ BEGIN
  ALTER TABLE "ownership_status_history" ADD CONSTRAINT "ownership_status_history_userBookEntryId_fkey"
    FOREIGN KEY ("userBookEntryId") REFERENCES "user_book_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
