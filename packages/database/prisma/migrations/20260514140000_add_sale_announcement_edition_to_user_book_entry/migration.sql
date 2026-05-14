ALTER TABLE "user_book_entries" ADD COLUMN "sale_announcement_edition_id" VARCHAR(36);
ALTER TABLE "user_book_entries" ADD CONSTRAINT "user_book_entries_sale_announcement_edition_id_fkey" FOREIGN KEY ("sale_announcement_edition_id") REFERENCES "sale_announcement_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "user_book_entries_sale_announcement_edition_id_idx" ON "user_book_entries"("sale_announcement_edition_id");
