-- Follow artist/author/book + batched "new edition" notification queue.
-- See CLAUDE.md: additive only, camelCase quoted columns, IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS "user_artist_follows" (
    "userId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_artist_follows_pkey" PRIMARY KEY ("userId", "artistId")
);

CREATE INDEX IF NOT EXISTS "user_artist_follows_artistId_idx" ON "user_artist_follows"("artistId");

DO $$ BEGIN
    ALTER TABLE "user_artist_follows" ADD CONSTRAINT "user_artist_follows_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "user_artist_follows" ADD CONSTRAINT "user_artist_follows_artistId_fkey"
        FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


CREATE TABLE IF NOT EXISTS "user_author_follows" (
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_author_follows_pkey" PRIMARY KEY ("userId", "authorId")
);

CREATE INDEX IF NOT EXISTS "user_author_follows_authorId_idx" ON "user_author_follows"("authorId");

DO $$ BEGIN
    ALTER TABLE "user_author_follows" ADD CONSTRAINT "user_author_follows_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "user_author_follows" ADD CONSTRAINT "user_author_follows_authorId_fkey"
        FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


CREATE TABLE IF NOT EXISTS "user_book_follows" (
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_book_follows_pkey" PRIMARY KEY ("userId", "bookId")
);

CREATE INDEX IF NOT EXISTS "user_book_follows_bookId_idx" ON "user_book_follows"("bookId");

DO $$ BEGIN
    ALTER TABLE "user_book_follows" ADD CONSTRAINT "user_book_follows_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "user_book_follows" ADD CONSTRAINT "user_book_follows_bookId_fkey"
        FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


CREATE TABLE IF NOT EXISTS "pending_edition_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_edition_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pending_edition_notifications_userId_editionId_key"
    ON "pending_edition_notifications"("userId", "editionId");
CREATE INDEX IF NOT EXISTS "pending_edition_notifications_scheduledFor_idx"
    ON "pending_edition_notifications"("scheduledFor");

DO $$ BEGIN
    ALTER TABLE "pending_edition_notifications" ADD CONSTRAINT "pending_edition_notifications_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "pending_edition_notifications" ADD CONSTRAINT "pending_edition_notifications_editionId_fkey"
        FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Per-type channel preference on the existing reminder-settings row (no master enable —
-- the follow action itself is the opt-in).
ALTER TABLE "user_reminder_settings"
    ADD COLUMN IF NOT EXISTS "newEditionFollowInAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "newEditionFollowPushEnabled" BOOLEAN NOT NULL DEFAULT true;
