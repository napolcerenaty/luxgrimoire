-- Migration: multiple series per book + omnibus components moved from edition to book level
--
-- 1. books.volumeNumber (single Float) -> books.volumeNumbers (Float[])
-- 2. New book_series_entries join table: a book can now belong to many series, with exactly
--    one marked isPrimary (enforced by a partial unique index, since a book's card only ever
--    shows the primary series).
-- 3. Omnibus composition moves from BookEdition (book_edition_components) to Book
--    (book_components) — the set of bundled books is a property of the work, not of a
--    specific print run, so every edition of the same omnibus book now shares one definition.
-- 4. Best-effort backfill for both. Anything that can't be migrated unambiguously is logged
--    as an "open" row in the existing bug_reports table (category 'migration') with a pageUrl
--    straight to the affected book's admin edit page, for manual review after deploy.

-- ── 1. books: volumeNumber -> volumeNumbers, + isOmnibus/componentCount ────────

ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "volumeNumbers" DOUBLE PRECISION[] NOT NULL DEFAULT '{}';
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "isOmnibus" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "componentCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "books_isOmnibus_idx" ON "books"("isOmnibus");

UPDATE "books"
SET "volumeNumbers" = ARRAY["volumeNumber"]
WHERE "volumeNumber" IS NOT NULL;

-- ── 2. book_series_entries ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "book_series_entries" (
  "id"            TEXT               NOT NULL,
  "bookId"        TEXT               NOT NULL,
  "seriesId"      UUID               NOT NULL,
  "volumeNumbers" DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  "isPrimary"     BOOLEAN            NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  CONSTRAINT "book_series_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "book_series_entries_bookId_seriesId_key" UNIQUE ("bookId", "seriesId")
);

CREATE INDEX IF NOT EXISTS "book_series_entries_seriesId_idx" ON "book_series_entries"("seriesId");
CREATE INDEX IF NOT EXISTS "book_series_entries_bookId_isPrimary_idx" ON "book_series_entries"("bookId", "isPrimary");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_series_entries_bookId_fkey') THEN
    ALTER TABLE "book_series_entries" ADD CONSTRAINT "book_series_entries_bookId_fkey"
      FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_series_entries_seriesId_fkey') THEN
    ALTER TABLE "book_series_entries" ADD CONSTRAINT "book_series_entries_seriesId_fkey"
      FOREIGN KEY ("seriesId") REFERENCES "book_series"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- At most one primary series entry per book
CREATE UNIQUE INDEX IF NOT EXISTS "book_series_entries_primary_unique"
  ON "book_series_entries"("bookId") WHERE "isPrimary" = true;

-- Backfill: every book that already has a seriesId gets one primary entry
INSERT INTO "book_series_entries" ("id", "bookId", "seriesId", "volumeNumbers", "isPrimary")
SELECT gen_random_uuid()::text, b."id", b."seriesId", b."volumeNumbers", true
FROM "books" b
WHERE b."seriesId" IS NOT NULL
ON CONFLICT ("bookId", "seriesId") DO NOTHING;

-- ── 3. book_components (replaces book_edition_components) ──────────────────────

CREATE TABLE IF NOT EXISTS "book_components" (
  "id"            TEXT NOT NULL,
  "omnibusBookId" TEXT NOT NULL,
  "bookId"        TEXT NOT NULL,
  "volumeNumber"  DOUBLE PRECISION,
  "order"         INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "book_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "book_components_omnibusBookId_bookId_key" UNIQUE ("omnibusBookId", "bookId")
);

CREATE INDEX IF NOT EXISTS "book_components_bookId_idx" ON "book_components"("bookId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_components_omnibusBookId_fkey') THEN
    ALTER TABLE "book_components" ADD CONSTRAINT "book_components_omnibusBookId_fkey"
      FOREIGN KEY ("omnibusBookId") REFERENCES "books"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_components_bookId_fkey') THEN
    ALTER TABLE "book_components" ADD CONSTRAINT "book_components_bookId_fkey"
      FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── 4. Best-effort migration: book_edition_components -> book_components ───────
-- Components were entered per-edition with no synchronisation, so the same owning book
-- can have divergent component sets across its editions. Per book: take the union of
-- distinct component books across all its editions, using the most recently created
-- edition's volumeNumber/order when the same pair disagrees. Divergences and components
-- with no linked book (bookId IS NULL — the new model requires one) are reported.

DO $$
DECLARE
  omnibus            RECORD;
  comp               RECORD;
  divergence_detail  TEXT;
  unmigrable_detail  TEXT;
  inserted_count     INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'book_edition_components') THEN

    FOR omnibus IN
      SELECT DISTINCT be."bookId" AS book_id
      FROM "book_edition_components" bec
      JOIN "book_editions" be ON be."id" = bec."editionId"
    LOOP
      inserted_count := 0;

      FOR comp IN
        SELECT DISTINCT ON (bec."bookId")
          bec."bookId" AS component_book_id,
          bec."volumeNumber",
          bec."order"
        FROM "book_edition_components" bec
        JOIN "book_editions" be ON be."id" = bec."editionId"
        WHERE be."bookId" = omnibus.book_id
          AND bec."bookId" IS NOT NULL
        ORDER BY bec."bookId", be."createdAt" DESC
      LOOP
        INSERT INTO "book_components" ("id", "omnibusBookId", "bookId", "volumeNumber", "order")
        VALUES (gen_random_uuid()::text, omnibus.book_id, comp.component_book_id, comp."volumeNumber", comp."order")
        ON CONFLICT ("omnibusBookId", "bookId") DO NOTHING;
        inserted_count := inserted_count + 1;
      END LOOP;

      -- Divergence: same component book, different volumeNumber/order across editions
      SELECT string_agg(DISTINCT target."title", ', ')
      INTO divergence_detail
      FROM (
        SELECT bec."bookId"
        FROM "book_edition_components" bec
        JOIN "book_editions" be ON be."id" = bec."editionId"
        WHERE be."bookId" = omnibus.book_id AND bec."bookId" IS NOT NULL
        GROUP BY bec."bookId"
        HAVING COUNT(DISTINCT (bec."volumeNumber", bec."order")) > 1
      ) diverging
      JOIN "books" target ON target."id" = diverging."bookId";

      IF divergence_detail IS NOT NULL THEN
        INSERT INTO "bug_reports" ("id", "title", "description", "category", "pageUrl", "status", "createdAt")
        SELECT
          gen_random_uuid()::text,
          'Migracja omnibusów: rozbieżne dane komponentu — ' || b."title",
          'Różne edycje tej książki miały różny numer/kolejność tomu dla komponentu (' || divergence_detail
            || '). Zastosowano dane z najnowszej edycji — zweryfikuj ręcznie.',
          'migration',
          '/admin/books/' || b."slug",
          'open',
          NOW()
        FROM "books" b WHERE b."id" = omnibus.book_id;
      END IF;

      -- Components with no linked book can't be migrated (new model requires bookId)
      SELECT string_agg(DISTINCT COALESCE(bec."customTitle", '(bez tytułu)'), ', ')
      INTO unmigrable_detail
      FROM "book_edition_components" bec
      JOIN "book_editions" be ON be."id" = bec."editionId"
      WHERE be."bookId" = omnibus.book_id AND bec."bookId" IS NULL;

      IF unmigrable_detail IS NOT NULL THEN
        INSERT INTO "bug_reports" ("id", "title", "description", "category", "pageUrl", "status", "createdAt")
        SELECT
          gen_random_uuid()::text,
          'Migracja omnibusów: niemigrowalny komponent — ' || b."title",
          'Ten omnibus miał komponent(y) bez powiązanej książki (tylko tekst: ' || unmigrable_detail
            || '). Nowy model wymaga realnego wpisu książki dla każdego komponentu — utwórz książkę i dodaj ją ręcznie jako komponent.',
          'migration',
          '/admin/books/' || b."slug",
          'open',
          NOW()
        FROM "books" b WHERE b."id" = omnibus.book_id;
      END IF;

      IF inserted_count > 0 THEN
        UPDATE "books"
        SET "isOmnibus" = true,
            "componentCount" = (SELECT COUNT(*) FROM "book_components" WHERE "omnibusBookId" = omnibus.book_id)
        WHERE "id" = omnibus.book_id;
      END IF;
    END LOOP;

  END IF;
END;
$$;

-- ── 5. Best-effort: derive an omnibus's volumeNumbers within its own series ────
-- from the matching-series volume numbers of the books it bundles. If any component
-- book doesn't belong to the same series (or has no volume number of its own), the
-- derived set is incomplete and gets reported instead of silently applied.

DO $$
DECLARE
  ob                 RECORD;
  derived            DOUBLE PRECISION[];
  total_components   INT;
  matched_components INT;
BEGIN
  FOR ob IN
    SELECT b."id" AS book_id, b."slug", b."title", b."seriesId"
    FROM "books" b
    WHERE b."isOmnibus" = true AND b."seriesId" IS NOT NULL
  LOOP
    SELECT COUNT(*) INTO total_components
    FROM "book_components" bc WHERE bc."omnibusBookId" = ob.book_id;

    SELECT COUNT(*) INTO matched_components
    FROM "book_components" bc
    JOIN "books" comp_book ON comp_book."id" = bc."bookId"
    WHERE bc."omnibusBookId" = ob.book_id
      AND comp_book."seriesId" = ob."seriesId"
      AND array_length(comp_book."volumeNumbers", 1) > 0;

    SELECT array_agg(DISTINCT vol ORDER BY vol) INTO derived
    FROM "book_components" bc
    JOIN "books" comp_book ON comp_book."id" = bc."bookId"
    CROSS JOIN LATERAL unnest(comp_book."volumeNumbers") AS vol
    WHERE bc."omnibusBookId" = ob.book_id
      AND comp_book."seriesId" = ob."seriesId";

    IF derived IS NOT NULL AND array_length(derived, 1) > 0 THEN
      UPDATE "book_series_entries" SET "volumeNumbers" = derived
      WHERE "bookId" = ob.book_id AND "seriesId" = ob."seriesId";

      UPDATE "books" SET "volumeNumbers" = derived WHERE "id" = ob.book_id;
    END IF;

    IF total_components = 0 OR matched_components < total_components THEN
      INSERT INTO "bug_reports" ("id", "title", "description", "category", "pageUrl", "status", "createdAt")
      VALUES (
        gen_random_uuid()::text,
        'Migracja serii: niekompletne volumeNumbers dla omnibusa — ' || ob."title",
        'Nie udało się w pełni wyznaczyć numerów tomów tego omnibusa w jego serii na podstawie komponentów ('
          || matched_components || '/' || total_components || ' komponentów dopasowanych). Uzupełnij "volumeNumbers" ręcznie.',
        'migration',
        '/admin/books/' || ob."slug",
        'open',
        NOW()
      );
    END IF;
  END LOOP;
END;
$$;

-- ── 6. Drop superseded structures ───────────────────────────────────────────────

DROP TABLE IF EXISTS "book_edition_components";

ALTER TABLE "book_editions" DROP COLUMN IF EXISTS "isOmnibus";
ALTER TABLE "book_editions" DROP COLUMN IF EXISTS "componentCount";

ALTER TABLE "books" DROP COLUMN IF EXISTS "volumeNumber";
