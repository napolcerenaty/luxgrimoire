-- Safe for production: ADD VALUE IF NOT EXISTS is idempotent
ALTER TYPE "SignatureType" ADD VALUE IF NOT EXISTS 'stamped';
