-- Rename snake_case columns to camelCase (Prisma convention without @map).
-- Previous fix migrations incorrectly created snake_case column names.
-- All statements are idempotent.

-- user_book_entries.order_number → orderNumber
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_book_entries' AND column_name = 'order_number') THEN
    ALTER TABLE "user_book_entries" RENAME COLUMN "order_number" TO "orderNumber";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_book_entries' AND column_name = 'orderNumber') THEN
    ALTER TABLE "user_book_entries" ADD COLUMN "orderNumber" VARCHAR(255);
  END IF;
END $$;

-- sale_announcements.subscriber_base_price → subscriberBasePrice
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_announcements' AND column_name = 'subscriber_base_price') THEN
    ALTER TABLE "sale_announcements" RENAME COLUMN "subscriber_base_price" TO "subscriberBasePrice";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_announcements' AND column_name = 'subscriberBasePrice') THEN
    ALTER TABLE "sale_announcements" ADD COLUMN "subscriberBasePrice" DECIMAL(10,2) NULL;
  END IF;
END $$;

-- sale_announcement_regions.subscriber_base_price → subscriberBasePrice
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_announcement_regions' AND column_name = 'subscriber_base_price') THEN
    ALTER TABLE "sale_announcement_regions" RENAME COLUMN "subscriber_base_price" TO "subscriberBasePrice";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_announcement_regions' AND column_name = 'subscriberBasePrice') THEN
    ALTER TABLE "sale_announcement_regions" ADD COLUMN "subscriberBasePrice" DECIMAL(10,2) NULL;
  END IF;
END $$;

-- user_sale_interests.selected_price → selectedPrice
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sale_interests' AND column_name = 'selected_price') THEN
    ALTER TABLE "user_sale_interests" RENAME COLUMN "selected_price" TO "selectedPrice";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sale_interests' AND column_name = 'selectedPrice') THEN
    ALTER TABLE "user_sale_interests" ADD COLUMN "selectedPrice" DECIMAL(10,2) NULL;
  END IF;
END $$;

-- user_sale_interests.selected_price_currency → selectedPriceCurrency
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sale_interests' AND column_name = 'selected_price_currency') THEN
    ALTER TABLE "user_sale_interests" RENAME COLUMN "selected_price_currency" TO "selectedPriceCurrency";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sale_interests' AND column_name = 'selectedPriceCurrency') THEN
    ALTER TABLE "user_sale_interests" ADD COLUMN "selectedPriceCurrency" VARCHAR(3) NULL;
  END IF;
END $$;

-- user_book_entry_tracking: drop and recreate with correct camelCase columns if still has snake_case
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_book_entry_tracking' AND column_name = 'user_book_entry_id') THEN
    -- Drop old snake_case table and recreate correctly
    DROP TABLE "user_book_entry_tracking";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_book_entry_tracking" (
  "id" TEXT NOT NULL,
  "userBookEntryId" TEXT NOT NULL,
  "trackingNumber" VARCHAR(100) NOT NULL,
  "label" VARCHAR(100),
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_book_entry_tracking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_book_entry_tracking_userBookEntryId_fkey"
    FOREIGN KEY ("userBookEntryId") REFERENCES "user_book_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_book_entry_tracking_userBookEntryId_idx"
  ON "user_book_entry_tracking"("userBookEntryId");

-- Migrate old tracking_number from user_book_entries if column still exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_book_entries' AND column_name = 'tracking_number') THEN
    INSERT INTO "user_book_entry_tracking" ("id", "userBookEntryId", "trackingNumber", "addedAt")
    SELECT gen_random_uuid()::text, "id", "tracking_number", NOW()
    FROM "user_book_entries"
    WHERE "tracking_number" IS NOT NULL AND "tracking_number" != '';
    ALTER TABLE "user_book_entries" DROP COLUMN "tracking_number";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_book_entries' AND column_name = 'trackingNumber') THEN
    INSERT INTO "user_book_entry_tracking" ("id", "userBookEntryId", "trackingNumber", "addedAt")
    SELECT gen_random_uuid()::text, "id", "trackingNumber", NOW()
    FROM "user_book_entries"
    WHERE "trackingNumber" IS NOT NULL AND "trackingNumber" != '';
    ALTER TABLE "user_book_entries" DROP COLUMN "trackingNumber";
  END IF;
END $$;
