-- Migration: subscription book-choice mechanism
--
-- 1. subscription_month_books.editionId becomes mandatory and the sole uniqueness anchor
--    (was [monthId, bookId] — a book could never appear twice in a month, even as two
--    distinct editions). Identity shifts to [monthId, editionId]: what's actually shipped
--    is the edition, and this is what lets two variants of the same book coexist in one
--    month as choice-group alternatives without being treated as a duplicate.
-- 2. New tables: subscription_month_choice_groups (semantic grouping of 2+ alternative
--    editions in a month), user_subscription_month_choices + user_month_book_choice_selections
--    (a user's resolved pick — 1 or 2 editions — for one choice group).
-- 3. subscriptions.hasBookChoiceMonths — admin convenience flag for subscriptions that run
--    on this model every month.
-- 4. user_reminder_settings gets bookChoiceEnabled/bookChoicePushEnabled/bookChoiceDaysBefore.

-- ── 1. subscription_month_books: editionId NOT NULL, uniqueness -> [monthId, editionId] ─

-- Refuse to proceed if legacy rows still lack an edition — those must be resolved manually
-- (remove + re-add with an edition chosen, via the admin months UI) before this can run.
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "subscription_month_books" WHERE "editionId" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'subscription_month_books has % row(s) with editionId IS NULL — resolve them in the admin months UI (remove + re-add with an edition) before running this migration.', null_count;
  END IF;
END $$;

ALTER TABLE "subscription_month_books" ALTER COLUMN "editionId" SET NOT NULL;

-- Old FK allowed ON DELETE SET NULL, which is invalid on a NOT NULL column; recreate as RESTRICT.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_month_books_editionId_fkey') THEN
    ALTER TABLE "subscription_month_books" DROP CONSTRAINT "subscription_month_books_editionId_fkey";
  END IF;
END $$;

ALTER TABLE "subscription_month_books"
  ADD CONSTRAINT "subscription_month_books_editionId_fkey"
  FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "subscription_month_books_monthId_bookId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_month_books_monthId_editionId_key"
  ON "subscription_month_books"("monthId", "editionId");

ALTER TABLE "subscription_month_books" ADD COLUMN IF NOT EXISTS "choiceGroupId" TEXT;
CREATE INDEX IF NOT EXISTS "subscription_month_books_choiceGroupId_idx" ON "subscription_month_books"("choiceGroupId");

-- ── 2. subscription_month_choice_groups ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "subscription_month_choice_groups" (
  "id" TEXT NOT NULL,
  "monthId" TEXT NOT NULL,
  "label" TEXT,
  "allowMultiple" BOOLEAN NOT NULL DEFAULT true,
  "choiceDeadlineDaysBefore" INTEGER NOT NULL DEFAULT 1,
  "choiceDeadlineType" TEXT NOT NULL DEFAULT 'DAYS_BEFORE',
  "choiceDeadlineDayOfMonth" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_month_choice_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subscription_month_choice_groups_monthId_idx" ON "subscription_month_choice_groups"("monthId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_month_choice_groups_monthId_fkey') THEN
    ALTER TABLE "subscription_month_choice_groups" ADD CONSTRAINT "subscription_month_choice_groups_monthId_fkey"
      FOREIGN KEY ("monthId") REFERENCES "subscription_months"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_month_books_choiceGroupId_fkey') THEN
    ALTER TABLE "subscription_month_books" ADD CONSTRAINT "subscription_month_books_choiceGroupId_fkey"
      FOREIGN KEY ("choiceGroupId") REFERENCES "subscription_month_choice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 3. user_subscription_month_choices + user_month_book_choice_selections ──────────────

CREATE TABLE IF NOT EXISTS "user_subscription_month_choices" (
  "id" TEXT NOT NULL,
  "subscriptionEntryId" TEXT NOT NULL,
  "choiceGroupId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'user',
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_subscription_month_choices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_subscription_month_choices_choiceGroupId_subEntry_key" UNIQUE ("choiceGroupId", "subscriptionEntryId")
);

CREATE INDEX IF NOT EXISTS "user_subscription_month_choices_subscriptionEntryId_idx" ON "user_subscription_month_choices"("subscriptionEntryId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_subscription_month_choices_subEntry_fkey') THEN
    ALTER TABLE "user_subscription_month_choices" ADD CONSTRAINT "user_subscription_month_choices_subEntry_fkey"
      FOREIGN KEY ("subscriptionEntryId") REFERENCES "user_subscription_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_subscription_month_choices_choiceGroupId_fkey') THEN
    ALTER TABLE "user_subscription_month_choices" ADD CONSTRAINT "user_subscription_month_choices_choiceGroupId_fkey"
      FOREIGN KEY ("choiceGroupId") REFERENCES "subscription_month_choice_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_month_book_choice_selections" (
  "userChoiceId" TEXT NOT NULL,
  "monthBookId" TEXT NOT NULL,
  CONSTRAINT "user_month_book_choice_selections_pkey" PRIMARY KEY ("userChoiceId", "monthBookId")
);

CREATE INDEX IF NOT EXISTS "user_month_book_choice_selections_monthBookId_idx" ON "user_month_book_choice_selections"("monthBookId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_month_book_choice_selections_userChoiceId_fkey') THEN
    ALTER TABLE "user_month_book_choice_selections" ADD CONSTRAINT "user_month_book_choice_selections_userChoiceId_fkey"
      FOREIGN KEY ("userChoiceId") REFERENCES "user_subscription_month_choices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_month_book_choice_selections_monthBookId_fkey') THEN
    ALTER TABLE "user_month_book_choice_selections" ADD CONSTRAINT "user_month_book_choice_selections_monthBookId_fkey"
      FOREIGN KEY ("monthBookId") REFERENCES "subscription_month_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 4. subscriptions.hasBookChoiceMonths ────────────────────────────────────────────────

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "hasBookChoiceMonths" BOOLEAN NOT NULL DEFAULT false;

-- ── 5. user_reminder_settings: book-choice reminder fields ─────────────────────────────
-- Opt-in like renewal/sale — a missed choice defaults to "both books ship, user
-- self-corrects" rather than anything destructive, so there's no need to force this on.

ALTER TABLE "user_reminder_settings" ADD COLUMN IF NOT EXISTS "bookChoiceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_reminder_settings" ADD COLUMN IF NOT EXISTS "bookChoiceInAppEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_reminder_settings" ADD COLUMN IF NOT EXISTS "bookChoicePushEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_reminder_settings" ADD COLUMN IF NOT EXISTS "bookChoiceDaysBefore" INTEGER NOT NULL DEFAULT 3;

-- ── 6. scheduled_reminders.choiceGroupId — scopes a book_choice reminder to one group ──

ALTER TABLE "scheduled_reminders" ADD COLUMN IF NOT EXISTS "choiceGroupId" TEXT;
CREATE INDEX IF NOT EXISTS "scheduled_reminders_entryId_choiceGroupId_idx" ON "scheduled_reminders"("entryId", "choiceGroupId");
