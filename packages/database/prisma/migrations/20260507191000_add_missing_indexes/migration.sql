-- Add missing performance indexes
-- All statements use CREATE INDEX IF NOT EXISTS — safe to run multiple times.

-- 1. book_authors: enable fast lookup by authorId (author pages load books by authorId)
CREATE INDEX IF NOT EXISTS "book_authors_authorId_idx" ON "book_authors"("authorId");

-- 2. book_edition_components: find all components that link to a given book
--    (already has editionId index from previous migration)
CREATE INDEX IF NOT EXISTS "book_edition_components_bookId_idx" ON "book_edition_components"("bookId");

-- 3. subscription_combo_components: find all combos that contain a given subscription
CREATE INDEX IF NOT EXISTS "subscription_combo_components_componentId_idx" ON "subscription_combo_components"("componentId");

-- 4. subscription_prepay_options: list prepay options for a subscription
CREATE INDEX IF NOT EXISTS "subscription_prepay_options_subscriptionId_idx" ON "subscription_prepay_options"("subscriptionId");

-- 5. book_editions: collection page loads all editions in a collection
CREATE INDEX IF NOT EXISTS "book_editions_collectionId_idx" ON "book_editions"("collectionId");

-- 6. user_subscription_entries: renewal cron (active=true AND nextRenewalDate <= now)
CREATE INDEX IF NOT EXISTS "user_subscription_entries_active_nextRenewalDate_idx" ON "user_subscription_entries"("active", "nextRenewalDate");

-- 7. user_subscription_cost_changes: spending queries always filter by entryId
CREATE INDEX IF NOT EXISTS "user_subscription_cost_changes_entryId_idx" ON "user_subscription_cost_changes"("entryId");
