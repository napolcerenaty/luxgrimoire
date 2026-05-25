-- Fix redesigned_cover category matching rules:
-- 1. Exclude "jacket" so that dust jacket descriptions (e.g. "Exclusive redesigned dust jacket")
--    do NOT match redesigned_cover — they should only match dust_jacket.
-- 2. Include "hardcover case" so that "Foil hardcover case" correctly matches redesigned_cover
--    in addition to foil + hardback.

UPDATE "feature_categories"
SET
  "excludePatterns" = "excludePatterns" || '["\\bjacket\\b"]'::jsonb,
  "includePatterns" = "includePatterns" || '["\\bhardcover case\\b"]'::jsonb,
  "updatedAt"       = NOW()
WHERE slug = 'redesigned_cover'
  -- Guard: only apply if not already present (idempotent)
  AND NOT ("excludePatterns" @> '["\\bjacket\\b"]'::jsonb);
