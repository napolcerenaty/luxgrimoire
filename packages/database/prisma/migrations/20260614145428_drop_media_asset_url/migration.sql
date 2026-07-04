-- Drop redundant url column from media_assets (same value as publicId)
ALTER TABLE media_assets DROP COLUMN IF EXISTS url;
