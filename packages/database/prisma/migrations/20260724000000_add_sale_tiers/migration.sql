-- Dynamic sale tiers: additive migration only.
-- Legacy firstAccessDate/earlyAccessDate/generalSaleDate columns on sale_announcements,
-- sale_announcement_regions and book_editions are intentionally left untouched here.
-- They are dropped in a later, separate migration once this one is confirmed stable in prod.

-- CreateTable
CREATE TABLE IF NOT EXISTS "sale_tiers" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "regionId" TEXT,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sale_tiers_saleId_date_idx" ON "sale_tiers"("saleId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sale_tiers_regionId_date_idx" ON "sale_tiers"("regionId", "date");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sale_tiers_saleId_fkey'
  ) THEN
    ALTER TABLE "sale_tiers" ADD CONSTRAINT "sale_tiers_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "sale_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sale_tiers_regionId_fkey'
  ) THEN
    ALTER TABLE "sale_tiers" ADD CONSTRAINT "sale_tiers_regionId_fkey"
      FOREIGN KEY ("regionId") REFERENCES "sale_announcement_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "edition_sale_dates" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "edition_sale_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "edition_sale_dates_editionId_idx" ON "edition_sale_dates"("editionId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'edition_sale_dates_editionId_fkey'
  ) THEN
    ALTER TABLE "edition_sale_dates" ADD CONSTRAINT "edition_sale_dates_editionId_fkey"
      FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: user_sale_interests.tierId (nullable, additive)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sale_interests' AND column_name = 'tierId'
  ) THEN
    ALTER TABLE "user_sale_interests" ADD COLUMN "tierId" TEXT;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_sale_interests_tierId_idx" ON "user_sale_interests"("tierId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_sale_interests_tierId_fkey'
  ) THEN
    ALTER TABLE "user_sale_interests" ADD CONSTRAINT "user_sale_interests_tierId_fkey"
      FOREIGN KEY ("tierId") REFERENCES "sale_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: scheduled_reminders.tierId (nullable, additive)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_reminders' AND column_name = 'tierId'
  ) THEN
    ALTER TABLE "scheduled_reminders" ADD COLUMN "tierId" TEXT;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "scheduled_reminders_tierId_idx" ON "scheduled_reminders"("tierId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'scheduled_reminders_tierId_fkey'
  ) THEN
    ALTER TABLE "scheduled_reminders" ADD CONSTRAINT "scheduled_reminders_tierId_fkey"
      FOREIGN KEY ("tierId") REFERENCES "sale_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Data backfill (runs automatically on every deploy via `prisma migrate deploy`) ───
-- All statements below are idempotent (NOT EXISTS / IS NULL guards) so re-running this
-- migration file (or applying it against an environment where some rows already exist)
-- is always safe. The remaining piece of the backfill — standalone BookEdition legacy
-- free-text dates, which need JS-level date parsing and bug-report filing for values
-- that don't parse — is NOT pure SQL and runs separately via
-- apps/api/src/scripts/backfill-edition-sale-dates.ts, invoked automatically from
-- docker-entrypoint.sh right after this migration applies.

-- Backfill SaleTier from legacy SaleAnnouncement columns (regionId = NULL = the sale's default tier set)
INSERT INTO "sale_tiers" ("id", "saleId", "regionId", "name", "date", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sa."id", NULL, 'First Access', sa."firstAccessDate", 0, NOW(), NOW()
FROM "sale_announcements" sa
WHERE sa."firstAccessDate" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sale_tiers" st WHERE st."saleId" = sa."id" AND st."regionId" IS NULL AND st."name" = 'First Access'
  );

INSERT INTO "sale_tiers" ("id", "saleId", "regionId", "name", "date", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sa."id", NULL, 'Early Access', sa."earlyAccessDate", 1, NOW(), NOW()
FROM "sale_announcements" sa
WHERE sa."earlyAccessDate" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sale_tiers" st WHERE st."saleId" = sa."id" AND st."regionId" IS NULL AND st."name" = 'Early Access'
  );

INSERT INTO "sale_tiers" ("id", "saleId", "regionId", "name", "date", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sa."id", NULL, 'General Sale', sa."generalSaleDate", 2, NOW(), NOW()
FROM "sale_announcements" sa
WHERE sa."generalSaleDate" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sale_tiers" st WHERE st."saleId" = sa."id" AND st."regionId" IS NULL AND st."name" = 'General Sale'
  );

-- Backfill SaleTier from legacy SaleAnnouncementRegion columns (regionId = that region's id)
INSERT INTO "sale_tiers" ("id", "saleId", "regionId", "name", "date", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."saleId", r."id", 'First Access', r."firstAccessDate", 0, NOW(), NOW()
FROM "sale_announcement_regions" r
WHERE r."firstAccessDate" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sale_tiers" st WHERE st."regionId" = r."id" AND st."name" = 'First Access'
  );

INSERT INTO "sale_tiers" ("id", "saleId", "regionId", "name", "date", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."saleId", r."id", 'Early Access', r."earlyAccessDate", 1, NOW(), NOW()
FROM "sale_announcement_regions" r
WHERE r."earlyAccessDate" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sale_tiers" st WHERE st."regionId" = r."id" AND st."name" = 'Early Access'
  );

INSERT INTO "sale_tiers" ("id", "saleId", "regionId", "name", "date", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."saleId", r."id", 'General Sale', r."generalSaleDate", 2, NOW(), NOW()
FROM "sale_announcement_regions" r
WHERE r."generalSaleDate" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sale_tiers" st WHERE st."regionId" = r."id" AND st."name" = 'General Sale'
  );

-- Backfill tierId on user_sale_interests: prefer the tier scoped to the user's selected
-- region, falling back to the announcement's default (regionId NULL) tier.
UPDATE "user_sale_interests" usi
SET "tierId" = st."id"
FROM "sale_tiers" st
WHERE usi."tierId" IS NULL
  AND st."saleId" = usi."announcementId"
  AND st."regionId" IS NOT DISTINCT FROM usi."regionId"
  AND st."name" = CASE usi."tier" WHEN 'FA' THEN 'First Access' WHEN 'EA' THEN 'Early Access' WHEN 'GS' THEN 'General Sale' END;

UPDATE "user_sale_interests" usi
SET "tierId" = st."id"
FROM "sale_tiers" st
WHERE usi."tierId" IS NULL
  AND st."saleId" = usi."announcementId"
  AND st."regionId" IS NULL
  AND st."name" = CASE usi."tier" WHEN 'FA' THEN 'First Access' WHEN 'EA' THEN 'Early Access' WHEN 'GS' THEN 'General Sale' END;

-- Backfill tierId on scheduled_reminders. regionId is always matched against NULL here,
-- matching scheduleSale()'s historical behavior of resolving dates from the
-- announcement's top-level fields only (it ignored per-region overrides).
UPDATE "scheduled_reminders" sr
SET "tierId" = st."id"
FROM "sale_tiers" st
WHERE sr."tierId" IS NULL
  AND sr."type" = 'sale'
  AND sr."announcementId" IS NOT NULL
  AND sr."tier" IS NOT NULL
  AND st."saleId" = sr."announcementId"
  AND st."regionId" IS NULL
  AND st."name" = CASE sr."tier" WHEN 'FA' THEN 'First Access' WHEN 'EA' THEN 'Early Access' WHEN 'GS' THEN 'General Sale' END;
