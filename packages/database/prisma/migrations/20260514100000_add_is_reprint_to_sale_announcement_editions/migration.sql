ALTER TABLE "sale_announcement_editions" ADD COLUMN IF NOT EXISTS "isReprint" BOOLEAN NOT NULL DEFAULT false;
