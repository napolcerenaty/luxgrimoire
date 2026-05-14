-- AddEditionHistoryRelation (idempotent)
ALTER TABLE "book_editions" ADD COLUMN IF NOT EXISTS "previousEditionId" TEXT;

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "book_editions_previousEditionId_key" ON "book_editions"("previousEditionId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'book_editions_previousEditionId_fkey'
  ) THEN
    ALTER TABLE "book_editions"
      ADD CONSTRAINT "book_editions_previousEditionId_fkey"
      FOREIGN KEY ("previousEditionId") REFERENCES "book_editions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
