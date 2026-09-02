-- Admin/moderator "Data Freshness" tracking: one row per company recording when its data
-- was last verified as current. Seeded at epoch (1970-01-01 = "never checked") for every
-- existing company below and, in application code, for every newly created company.
-- The row is overwritten in place by the admin view — no history is kept.

CREATE TABLE IF NOT EXISTS "company_data_checks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00',
    "checkedByName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_data_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_data_checks_companyId_key"
    ON "company_data_checks"("companyId");

DO $$ BEGIN
    ALTER TABLE "company_data_checks"
        ADD CONSTRAINT "company_data_checks_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Back-fill: one epoch-dated row per existing company that doesn't have one yet.
INSERT INTO "company_data_checks" ("id", "companyId", "checkedAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", '1970-01-01 00:00:00', CURRENT_TIMESTAMP
FROM "book_box_companies" c
WHERE NOT EXISTS (
    SELECT 1 FROM "company_data_checks" dc WHERE dc."companyId" = c."id"
);
