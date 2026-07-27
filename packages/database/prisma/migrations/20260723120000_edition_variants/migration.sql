-- AddEditionVariants (idempotent)
ALTER TABLE "book_editions" ADD COLUMN IF NOT EXISTS "variantLabel" TEXT;
ALTER TABLE "book_editions" ADD COLUMN IF NOT EXISTS "variantGroupParentId" TEXT;

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "book_editions_variantGroupParentId_idx" ON "book_editions"("variantGroupParentId");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'book_editions_variantGroupParentId_fkey'
  ) THEN
    ALTER TABLE "book_editions"
      ADD CONSTRAINT "book_editions_variantGroupParentId_fkey"
      FOREIGN KEY ("variantGroupParentId") REFERENCES "book_editions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
