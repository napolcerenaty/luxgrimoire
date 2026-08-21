-- Links an individual artist to the studio/collective they publish under (self-relation on "artists"),
-- so the person's real name isn't lost behind a shared studio handle.
-- Additive only: both columns are safe defaults for existing rows, no backfill needed.

ALTER TABLE "artists" ADD COLUMN IF NOT EXISTS "isCollective" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "artists" ADD COLUMN IF NOT EXISTS "studioId" TEXT;

CREATE INDEX IF NOT EXISTS "artists_studioId_idx" ON "artists"("studioId");

DO $$ BEGIN
  ALTER TABLE "artists" ADD CONSTRAINT "artists_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
