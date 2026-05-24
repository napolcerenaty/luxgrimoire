-- Deduplicate edition_feature_tags and tighten unique constraint to (editionId, categoryId).
-- One category per edition — artist_contribution source preferred over features when both exist.

-- Step 1: remove duplicate rows, keeping the best one per (editionId, categoryId)
-- Priority: manual > artist_contribution > features, then earliest createdAt
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY "editionId", "categoryId"
               ORDER BY
                   CASE WHEN is_manual THEN 0 ELSE 1 END,
                   CASE source WHEN 'artist_contribution' THEN 0 ELSE 1 END,
                   "createdAt"
           ) AS rn
    FROM edition_feature_tags
)
DELETE FROM edition_feature_tags
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: drop old constraint and add the new narrower one
DROP INDEX IF EXISTS "edition_feature_tags_editionId_categoryId_rawValue_key";

CREATE UNIQUE INDEX "edition_feature_tags_editionId_categoryId_key"
    ON "edition_feature_tags"("editionId", "categoryId");
