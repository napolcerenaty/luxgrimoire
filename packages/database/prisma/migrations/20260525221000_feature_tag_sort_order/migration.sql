-- Add sortOrder to edition_feature_tags to preserve the order features were parsed/entered.
-- Default 0 for existing rows (they'll be reordered on next retag).

ALTER TABLE "edition_feature_tags"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "edition_feature_tags_edition_sort_idx"
  ON "edition_feature_tags"("editionId", "sortOrder");
