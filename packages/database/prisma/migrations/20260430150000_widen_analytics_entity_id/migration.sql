-- Widen entity_id column in analytics_events from VARCHAR(36) to VARCHAR(128)
-- Reason: subscription slugs can exceed 36 chars (designed for UUIDs only),
-- causing "value too long" errors when tracking subscription events.
ALTER TABLE "analytics_events" ALTER COLUMN "entity_id" TYPE VARCHAR(128);
