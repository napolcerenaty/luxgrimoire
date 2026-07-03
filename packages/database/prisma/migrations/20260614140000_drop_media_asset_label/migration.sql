-- Drop unused label column from media_assets
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "label";
