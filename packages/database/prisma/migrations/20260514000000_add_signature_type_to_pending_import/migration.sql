-- Add signatureType to pending_month_imports
ALTER TABLE "pending_month_imports" ADD COLUMN IF NOT EXISTS "signatureType" VARCHAR(20);
