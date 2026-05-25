-- Drop artist-related columns from edition_feature_tags.
-- Artists are now managed exclusively via artist_contributions table.
ALTER TABLE "edition_feature_tags"
  DROP COLUMN IF EXISTS "artist_id",
  DROP COLUMN IF EXISTS "artist_name",
  DROP COLUMN IF EXISTS "source";

-- Drop the now-unused index on artist_id (may not exist on all envs)
DROP INDEX IF EXISTS "edition_feature_tags_artist_id_idx";
