-- Add statsSettings JSON column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "statsSettings" JSONB;
