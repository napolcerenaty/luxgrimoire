-- The "sponsored_slots" table (created in the initial migration, 20260428000000_init,
-- for a planned sponsored-placement feature that was never wired up to a model or app
-- code) was already dropped by 20260721090000_drop_unused_sponsored_slots_and_membership_history.
--
-- That migration left the "SponsoredSlotType" enum behind — it was the table's only
-- column type and nothing else in the schema references it. This migration drops the
-- now-orphaned enum type.

DROP TYPE IF EXISTS "SponsoredSlotType";
