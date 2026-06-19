CREATE TABLE IF NOT EXISTS "homepage_features" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "title"       TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "iconName"    TEXT NOT NULL DEFAULT 'Star',
  "ctaLabel"    TEXT,
  "ctaHref"     TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "homepage_features_pkey" PRIMARY KEY ("id")
);
