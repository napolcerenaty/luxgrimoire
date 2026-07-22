-- Migration: news_items.possibleDuplicateOfId — dedup flag (Phase 4 of the news
-- aggregator plan, spec section 5). When ingestion finds a likely-duplicate
-- candidate (same company, 48h window, LLM-confirmed same event), the NEW item
-- is still created as usual but flagged against the candidate for admin review
-- (confirm-as-update / decline-match / retract-original) instead of silently
-- creating a second visible card.
--
-- NOTE (feature branch): written but intentionally NOT applied locally — apply
-- after merge to development, per CLAUDE.md.

ALTER TABLE "news_items" ADD COLUMN IF NOT EXISTS "possibleDuplicateOfId" TEXT;

CREATE INDEX IF NOT EXISTS "news_items_possibleDuplicateOfId_idx" ON "news_items"("possibleDuplicateOfId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_items_possibleDuplicateOfId_fkey') THEN
    ALTER TABLE "news_items" ADD CONSTRAINT "news_items_possibleDuplicateOfId_fkey"
      FOREIGN KEY ("possibleDuplicateOfId") REFERENCES "news_items"("id") ON DELETE SET NULL;
  END IF;
END $$;
