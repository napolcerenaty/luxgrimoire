-- Add is_manual column to edition_feature_tags
-- Tracks whether a tag was manually assigned by an admin (vs auto-detected)

ALTER TABLE "edition_feature_tags"
    ADD COLUMN "is_manual" BOOLEAN NOT NULL DEFAULT false;
