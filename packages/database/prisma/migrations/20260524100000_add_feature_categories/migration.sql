-- Feature Normalisation: FeatureCategory + EditionFeatureTag tables
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

CREATE UNIQUE INDEX "feature_categories_slug_key" ON "feature_categories"("slug");
CREATE INDEX "feature_categories_group_idx" ON "feature_categories"("group");

CREATE TABLE "edition_feature_tags" (
    "id"         TEXT NOT NULL,
    "editionId"  TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "rawValue"   TEXT NOT NULL,
    "source"     TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edition_feature_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "edition_feature_tags_editionId_categoryId_rawValue_key"
    ON "edition_feature_tags"("editionId", "categoryId", "rawValue");
CREATE INDEX "edition_feature_tags_editionId_idx" ON "edition_feature_tags"("editionId");
CREATE INDEX "edition_feature_tags_categoryId_idx" ON "edition_feature_tags"("categoryId");

ALTER TABLE "edition_feature_tags"
    ADD CONSTRAINT "edition_feature_tags_editionId_fkey"
    FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edition_feature_tags"
    ADD CONSTRAINT "edition_feature_tags_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "feature_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
