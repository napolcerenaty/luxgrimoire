CREATE TABLE IF NOT EXISTS "reading_history" (
    "id" TEXT NOT NULL,
    "userBookEntryId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "isDnf" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reading_history_userBookEntryId_startedAt_idx" ON "reading_history"("userBookEntryId", "startedAt");

ALTER TABLE "reading_history" DROP CONSTRAINT IF EXISTS "reading_history_userBookEntryId_fkey";
ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_userBookEntryId_fkey"
  FOREIGN KEY ("userBookEntryId") REFERENCES "user_book_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
