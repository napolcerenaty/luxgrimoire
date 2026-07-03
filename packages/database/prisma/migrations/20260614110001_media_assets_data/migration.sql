-- Data migration: populate media_assets from existing image string fields
-- and set FK columns on all affected models.
--
-- Strategy:
--   • All existing images are stored as Cloudinary public_ids (or full URLs).
--   • We INSERT into media_assets (ON CONFLICT DO NOTHING on publicId) for each
--     distinct non-null image value across all models.
--   • Then we UPDATE the FK columns to point to the newly created MediaAsset rows.
--   • For BookEdition.additionalImages (String[]) and SaleAnnouncement.extraImagesJson
--     (Json array of strings) we also populate the join tables.
--
-- Note: the old String fields (photoUrl, coverImage, etc.) are LEFT IN PLACE.
-- They will be dropped in a separate follow-up migration after the feature deploys.

-- ─── Helper: insert all distinct non-null public_ids into media_assets ─────────

-- authors.photoUrl
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "photoUrl",
  "photoUrl",   -- url = publicId for now (Cloudinary resolves it)
  'luxgrimoire/people'
FROM "authors"
WHERE "photoUrl" IS NOT NULL AND "photoUrl" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "authors" a
SET "photoAssetId" = m."id"
FROM "media_assets" m
WHERE a."photoUrl" IS NOT NULL
  AND a."photoUrl" != ''
  AND m."publicId" = a."photoUrl"
  AND a."photoAssetId" IS NULL;

-- artists.photoUrl
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "photoUrl",
  "photoUrl",
  'luxgrimoire/people'
FROM "artists"
WHERE "photoUrl" IS NOT NULL AND "photoUrl" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "artists" a
SET "photoAssetId" = m."id"
FROM "media_assets" m
WHERE a."photoUrl" IS NOT NULL
  AND a."photoUrl" != ''
  AND m."publicId" = a."photoUrl"
  AND a."photoAssetId" IS NULL;

-- book_box_companies.logoUrl
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "logoUrl",
  "logoUrl",
  'luxgrimoire/companies'
FROM "book_box_companies"
WHERE "logoUrl" IS NOT NULL AND "logoUrl" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "book_box_companies" c
SET "logoAssetId" = m."id"
FROM "media_assets" m
WHERE c."logoUrl" IS NOT NULL
  AND c."logoUrl" != ''
  AND m."publicId" = c."logoUrl"
  AND c."logoAssetId" IS NULL;

-- subscriptions.coverImage
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "coverImage",
  "coverImage",
  'luxgrimoire/subscriptions'
FROM "subscriptions"
WHERE "coverImage" IS NOT NULL AND "coverImage" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "subscriptions" s
SET "coverImageAssetId" = m."id"
FROM "media_assets" m
WHERE s."coverImage" IS NOT NULL
  AND s."coverImage" != ''
  AND m."publicId" = s."coverImage"
  AND s."coverImageAssetId" IS NULL;

-- subscriptions.logoUrl
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "logoUrl",
  "logoUrl",
  'luxgrimoire/subscriptions'
FROM "subscriptions"
WHERE "logoUrl" IS NOT NULL AND "logoUrl" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "subscriptions" s
SET "logoAssetId" = m."id"
FROM "media_assets" m
WHERE s."logoUrl" IS NOT NULL
  AND s."logoUrl" != ''
  AND m."publicId" = s."logoUrl"
  AND s."logoAssetId" IS NULL;

-- subscription_series.coverImage
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "coverImage",
  "coverImage",
  'luxgrimoire/subscriptions'
FROM "subscription_series"
WHERE "coverImage" IS NOT NULL AND "coverImage" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "subscription_series" s
SET "coverImageAssetId" = m."id"
FROM "media_assets" m
WHERE s."coverImage" IS NOT NULL
  AND s."coverImage" != ''
  AND m."publicId" = s."coverImage"
  AND s."coverImageAssetId" IS NULL;

-- subscription_months.coverImage
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "coverImage",
  "coverImage",
  'luxgrimoire/months'
FROM "subscription_months"
WHERE "coverImage" IS NOT NULL AND "coverImage" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "subscription_months" sm
SET "coverImageAssetId" = m."id"
FROM "media_assets" m
WHERE sm."coverImage" IS NOT NULL
  AND sm."coverImage" != ''
  AND m."publicId" = sm."coverImage"
  AND sm."coverImageAssetId" IS NULL;

-- subscription_months.spoilerImage
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "spoilerImage",
  "spoilerImage",
  'luxgrimoire/months'
FROM "subscription_months"
WHERE "spoilerImage" IS NOT NULL AND "spoilerImage" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "subscription_months" sm
SET "spoilerImageAssetId" = m."id"
FROM "media_assets" m
WHERE sm."spoilerImage" IS NOT NULL
  AND sm."spoilerImage" != ''
  AND m."publicId" = sm."spoilerImage"
  AND sm."spoilerImageAssetId" IS NULL;

-- sale_announcements.imageUrl (main image)
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT
  gen_random_uuid()::text,
  "imageUrl",
  "imageUrl",
  'luxgrimoire/announcements'
FROM "sale_announcements"
WHERE "imageUrl" IS NOT NULL AND "imageUrl" != ''
ON CONFLICT ("publicId") DO NOTHING;

UPDATE "sale_announcements" sa
SET "imageAssetId" = m."id"
FROM "media_assets" m
WHERE sa."imageUrl" IS NOT NULL
  AND sa."imageUrl" != ''
  AND m."publicId" = sa."imageUrl"
  AND sa."imageAssetId" IS NULL;

-- sale_announcements.extraImagesJson (extra images → join table)
-- extraImagesJson is a JSON array of publicId strings, e.g. ["luxgrimoire/...", ...]
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT DISTINCT
  gen_random_uuid()::text,
  img_val,
  img_val,
  'luxgrimoire/announcements'
FROM "sale_announcements",
  jsonb_array_elements_text("extraImagesJson"::jsonb) AS img_val
WHERE "extraImagesJson" IS NOT NULL
  AND jsonb_typeof("extraImagesJson"::jsonb) = 'array'
ON CONFLICT ("publicId") DO NOTHING;

INSERT INTO "sale_announcement_media_assets" ("announcementId", "assetId", "sortOrder")
SELECT
  sa."id",
  m."id",
  idx.rn - 1
FROM "sale_announcements" sa
CROSS JOIN LATERAL (
  SELECT img_val, ROW_NUMBER() OVER () AS rn
  FROM jsonb_array_elements_text(sa."extraImagesJson"::jsonb) AS img_val
) idx
JOIN "media_assets" m ON m."publicId" = idx.img_val
WHERE sa."extraImagesJson" IS NOT NULL
  AND jsonb_typeof(sa."extraImagesJson"::jsonb) = 'array'
ON CONFLICT DO NOTHING;

-- book_editions.additionalImages (String[] → join table)
INSERT INTO "media_assets" ("id", "publicId", "url", "folder")
SELECT DISTINCT
  gen_random_uuid()::text,
  img_val,
  img_val,
  'luxgrimoire/editions'
FROM "book_editions",
  unnest("additionalImages") AS img_val
WHERE array_length("additionalImages", 1) > 0
ON CONFLICT ("publicId") DO NOTHING;

INSERT INTO "book_edition_media_assets" ("editionId", "assetId", "sortOrder")
SELECT
  e."id",
  m."id",
  idx.idx - 1
FROM "book_editions" e
CROSS JOIN LATERAL (
  SELECT img_val, generate_subscripts(e."additionalImages", 1) AS idx
  FROM unnest(e."additionalImages") AS img_val
) idx
JOIN "media_assets" m ON m."publicId" = idx.img_val
WHERE array_length(e."additionalImages", 1) > 0
ON CONFLICT DO NOTHING;
