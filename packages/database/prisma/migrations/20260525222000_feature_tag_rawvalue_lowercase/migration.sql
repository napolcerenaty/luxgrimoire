-- Deduplicate case-insensitive rawValue duplicates, keeping the best candidate:
-- prefer isManual=true, then lowest sortOrder.

DELETE FROM edition_feature_tags
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "editionId", lower("rawValue")
        ORDER BY "is_manual" DESC, "sortOrder" ASC, "createdAt" ASC
      ) AS rn
    FROM edition_feature_tags
  ) ranked
  WHERE rn > 1
);

-- Drop old case-sensitive unique constraint
ALTER TABLE edition_feature_tags
  DROP CONSTRAINT IF EXISTS "edition_feature_tags_editionId_rawValue_key";

-- Add case-insensitive unique index (functional on lower())
CREATE UNIQUE INDEX IF NOT EXISTS "edition_feature_tags_edition_rawlower_key"
  ON edition_feature_tags("editionId", lower("rawValue"));
