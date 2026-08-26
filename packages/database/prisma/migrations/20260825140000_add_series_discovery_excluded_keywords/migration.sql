-- Admin-manageable list of bundle/omnibus keywords for series-discovery (e.g. "Boxed Set",
-- "Trilogy") — was a hardcoded regex, now editable from admin without a deploy.

CREATE TABLE IF NOT EXISTS "series_discovery_excluded_keywords" (
    "id"        TEXT NOT NULL,
    "keyword"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_discovery_excluded_keywords_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "series_discovery_excluded_keywords_keyword_key" ON "series_discovery_excluded_keywords"("keyword");

-- Seed with the original hardcoded list so behaviour doesn't change on deploy.
INSERT INTO "series_discovery_excluded_keywords" ("id", "keyword")
VALUES
    (gen_random_uuid()::text, 'boxed set'),
    (gen_random_uuid()::text, 'box set'),
    (gen_random_uuid()::text, 'omnibus'),
    (gen_random_uuid()::text, 'bundle'),
    (gen_random_uuid()::text, 'trilogy'),
    (gen_random_uuid()::text, 'duology'),
    (gen_random_uuid()::text, 'quartet'),
    (gen_random_uuid()::text, 'complete series'),
    (gen_random_uuid()::text, 'complete collection'),
    (gen_random_uuid()::text, 'complete trilogy')
ON CONFLICT ("keyword") DO NOTHING;
