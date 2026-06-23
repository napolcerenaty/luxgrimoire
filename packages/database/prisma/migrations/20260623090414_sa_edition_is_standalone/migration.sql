ALTER TABLE "sale_announcement_editions"
  ADD COLUMN IF NOT EXISTS "isStandalone" BOOLEAN NOT NULL DEFAULT FALSE;
