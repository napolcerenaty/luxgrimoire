-- Create per-entry tags table
CREATE TABLE "user_book_entry_tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "user_book_entry_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_book_entry_tags_userId_entryId_tag_key" ON "user_book_entry_tags"("userId", "entryId", "tag");

ALTER TABLE "user_book_entry_tags" ADD CONSTRAINT "user_book_entry_tags_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "user_book_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_book_entry_tags" ADD CONSTRAINT "user_book_entry_tags_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing edition-level tags to the oldest entry per (userId, editionId)
INSERT INTO "user_book_entry_tags" ("id", "userId", "entryId", "tag")
SELECT
    gen_random_uuid(),
    uet."userId",
    oldest_entry.id,
    uet.tag
FROM "user_edition_tags" uet
JOIN (
    SELECT DISTINCT ON ("userId", "editionId") id, "userId", "editionId"
    FROM "user_book_entries"
    WHERE "editionId" IS NOT NULL
    ORDER BY "userId", "editionId", "createdAt" ASC
) oldest_entry
    ON oldest_entry."userId" = uet."userId"
    AND oldest_entry."editionId" = uet."editionId"
ON CONFLICT DO NOTHING;
