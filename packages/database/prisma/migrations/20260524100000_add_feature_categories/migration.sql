-- Feature normalisation: FeatureCategory + EditionFeatureTag
-- Replaces artist_contributions as the source of truth for edition features and artist roles.
-- Safe to apply on production: pure additions, no drops.

CREATE TABLE "feature_categories" (
    "id"              TEXT NOT NULL,
    "slug"            TEXT NOT NULL,
    "label"           TEXT NOT NULL,
    "group"           TEXT NOT NULL,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"       INTEGER NOT NULL DEFAULT 0,
    "includePatterns" JSONB NOT NULL DEFAULT '[]',
    "excludePatterns" JSONB NOT NULL DEFAULT '[]',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feature_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feature_categories_slug_key"  ON "feature_categories"("slug");
CREATE INDEX        "feature_categories_group_idx" ON "feature_categories"("group");

CREATE TABLE "edition_feature_tags" (
    "id"          TEXT NOT NULL,
    "editionId"   TEXT NOT NULL,
    "rawValue"    TEXT NOT NULL,
    "categories"  TEXT[] NOT NULL DEFAULT '{}',
    "artistId"    TEXT,
    "artistName"  TEXT,
    "source"      TEXT NOT NULL DEFAULT 'features',
    "is_manual"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "edition_feature_tags_pkey" PRIMARY KEY ("id")
);

-- One row per unique rawValue per edition (no FK to categories — slugs stored as array)
CREATE UNIQUE INDEX "edition_feature_tags_editionId_rawValue_key"
    ON "edition_feature_tags"("editionId", "rawValue");
CREATE INDEX "edition_feature_tags_editionId_idx"  ON "edition_feature_tags"("editionId");
CREATE INDEX "edition_feature_tags_artistId_idx"   ON "edition_feature_tags"("artistId");

ALTER TABLE "edition_feature_tags"
    ADD CONSTRAINT "edition_feature_tags_editionId_fkey"
    FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edition_feature_tags"
    ADD CONSTRAINT "edition_feature_tags_artistId_fkey"
    FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
