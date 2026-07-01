-- Add index on signatureType for collection filtering performance
CREATE INDEX "user_book_entries_userId_signatureType_idx" ON "user_book_entries"("userId", "signatureType");
