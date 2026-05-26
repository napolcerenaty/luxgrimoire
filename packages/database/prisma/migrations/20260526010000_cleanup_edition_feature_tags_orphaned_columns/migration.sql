-- Cleanup: remove orphaned columns/FK/indexes from edition_feature_tags
--
-- Root cause: migration 20260525210000 tried to drop camelCase columns
-- ("artistId", "artistName") using snake_case names ("artist_id", "artist_name"),
-- which silently did nothing in PostgreSQL (quoted identifiers are case-sensitive).
-- Similarly, DROP CONSTRAINT can't remove an index created by CREATE UNIQUE INDEX.
-- All statements are idempotent (IF EXISTS).

-- 1. Drop FK constraint on orphaned artistId column
ALTER TABLE "edition_feature_tags"
  DROP CONSTRAINT IF EXISTS "edition_feature_tags_artistId_fkey";

-- 2. Drop orphaned index on artistId (camelCase name - the one that actually exists)
DROP INDEX IF EXISTS "edition_feature_tags_artistId_idx";

-- 3. Drop orphaned camelCase columns
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'edition_feature_tags' AND column_name = 'artistId'
  ) THEN
    ALTER TABLE "edition_feature_tags" DROP COLUMN "artistId";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'edition_feature_tags' AND column_name = 'artistName'
  ) THEN
    ALTER TABLE "edition_feature_tags" DROP COLUMN "artistName";
  END IF;
END $$;

-- 4. Drop old case-sensitive unique index (was created via CREATE UNIQUE INDEX,
--    so must be dropped via DROP INDEX, not DROP CONSTRAINT)
DROP INDEX IF EXISTS "edition_feature_tags_editionId_rawValue_key";
