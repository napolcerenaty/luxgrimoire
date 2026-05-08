ALTER TABLE "book_editions" ADD COLUMN IF NOT EXISTS "isOmnibus" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "book_editions" ADD COLUMN IF NOT EXISTS "componentCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "book_edition_components" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "bookId" TEXT,
    "customTitle" TEXT,
    "volumeNumber" DOUBLE PRECISION,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "book_edition_components_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "book_edition_components_editionId_idx" ON "book_edition_components"("editionId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'book_edition_components_editionId_fkey'
  ) THEN
    ALTER TABLE "book_edition_components" ADD CONSTRAINT "book_edition_components_editionId_fkey"
      FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'book_edition_components_bookId_fkey'
  ) THEN
    ALTER TABLE "book_edition_components" ADD CONSTRAINT "book_edition_components_bookId_fkey"
      FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
