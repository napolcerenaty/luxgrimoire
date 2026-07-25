-- Safe for production: ADD VALUE IF NOT EXISTS is idempotent
ALTER TYPE "FeeCategory" ADD VALUE IF NOT EXISTS 'PRICE_ADJUSTMENT';
