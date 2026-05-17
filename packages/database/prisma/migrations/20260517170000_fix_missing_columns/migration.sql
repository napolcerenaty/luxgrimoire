-- Fix migration: safely apply columns that may have been missed in production
-- All statements use IF NOT EXISTS / DO blocks to be fully idempotent

-- order_number on user_book_entries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_book_entries' AND column_name = 'order_number'
  ) THEN
    ALTER TABLE "user_book_entries" ADD COLUMN "order_number" VARCHAR(255);
  END IF;
END $$;

-- subscriber_base_price on sale_announcements
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_announcements' AND column_name = 'subscriber_base_price'
  ) THEN
    ALTER TABLE "sale_announcements" ADD COLUMN "subscriber_base_price" DECIMAL(10,2) NULL;
  END IF;
END $$;

-- subscriber_base_price on sale_announcement_regions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_announcement_regions' AND column_name = 'subscriber_base_price'
  ) THEN
    ALTER TABLE "sale_announcement_regions" ADD COLUMN "subscriber_base_price" DECIMAL(10,2) NULL;
  END IF;
END $$;

-- selected_price on user_sale_interests
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sale_interests' AND column_name = 'selected_price'
  ) THEN
    ALTER TABLE "user_sale_interests" ADD COLUMN "selected_price" DECIMAL(10,2) NULL;
  END IF;
END $$;

-- selected_price_currency on user_sale_interests
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sale_interests' AND column_name = 'selected_price_currency'
  ) THEN
    ALTER TABLE "user_sale_interests" ADD COLUMN "selected_price_currency" VARCHAR(3) NULL;
  END IF;
END $$;

-- user_book_entry_tracking table
CREATE TABLE IF NOT EXISTS "user_book_entry_tracking" (
  "id" VARCHAR(36) NOT NULL,
  "user_book_entry_id" VARCHAR(36) NOT NULL,
  "tracking_number" VARCHAR(100) NOT NULL,
  "label" VARCHAR(100),
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_book_entry_tracking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_book_entry_tracking_user_book_entry_id_fkey"
    FOREIGN KEY ("user_book_entry_id") REFERENCES "user_book_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_book_entry_tracking_user_book_entry_id_idx"
  ON "user_book_entry_tracking"("user_book_entry_id");

-- Migrate existing tracking_number data and drop old column (if still exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_book_entries' AND column_name = 'tracking_number'
  ) THEN
    INSERT INTO "user_book_entry_tracking" ("id", "user_book_entry_id", "tracking_number", "added_at")
    SELECT gen_random_uuid()::text, "id", "tracking_number", NOW()
    FROM "user_book_entries"
    WHERE "tracking_number" IS NOT NULL AND "tracking_number" != '';

    ALTER TABLE "user_book_entries" DROP COLUMN "tracking_number";
  END IF;
END $$;
