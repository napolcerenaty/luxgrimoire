-- Data fix: "The Dragon's Gift Trilogy" existed as two separate book_series rows —
-- one with a straight apostrophe (slug "the-dragon-s-gift-trilogy", name "The Dragon's Gift
-- Trilogy") and one with a curly apostrophe (slug "the-dragon-s-gift-trilogy-jasmine-walt",
-- name "The Dragon’s Gift Trilogy"). Both were created at the same timestamp, almost
-- certainly because a lookup/dedup step compared names byte-for-byte and the two source
-- records used different apostrophe characters.
--
-- This split the trilogy's books across both rows (volumes 1 & 2 landed on the straight-
-- apostrophe row, the omnibus + volume 3 on the curly-apostrophe row), so visiting either
-- series page only ever showed half the books.
--
-- Keeps the "…jasmine-walt" slug (the one already public/bookmarked), reassigns the other
-- row's book_series_entries and cached books.seriesId/seriesName to it, then removes the
-- now-empty duplicate. Matched by slug, not id, since ids are UUIDs generated per-environment.

DO $$
DECLARE
  keep_id   UUID;
  keep_name TEXT;
  dupe_id   UUID;
BEGIN
  SELECT id, name INTO keep_id, keep_name
  FROM "book_series" WHERE slug = 'the-dragon-s-gift-trilogy-jasmine-walt';

  SELECT id INTO dupe_id
  FROM "book_series" WHERE slug = 'the-dragon-s-gift-trilogy';

  IF keep_id IS NOT NULL AND dupe_id IS NOT NULL THEN
    -- Reassign entries that don't already have one on the kept series
    UPDATE "book_series_entries"
    SET "seriesId" = keep_id
    WHERE "seriesId" = dupe_id
      AND "bookId" NOT IN (SELECT "bookId" FROM "book_series_entries" WHERE "seriesId" = keep_id);

    -- Drop any leftover entries for the duplicate (a book that already had an entry on both)
    DELETE FROM "book_series_entries" WHERE "seriesId" = dupe_id;

    -- Update cached fields on affected books
    UPDATE "books"
    SET "seriesId" = keep_id, "seriesName" = keep_name
    WHERE "seriesId" = dupe_id;

    DELETE FROM "book_series" WHERE id = dupe_id;
  END IF;
END;
$$;
