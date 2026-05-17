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

-- Migrate existing tracking numbers to the new table (only if column exists)
DO $$
BEGIN
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
END
$$;
