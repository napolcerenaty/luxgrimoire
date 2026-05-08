-- Safe migration: add sourceUrl to sale_announcements
ALTER TABLE "sale_announcements" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
