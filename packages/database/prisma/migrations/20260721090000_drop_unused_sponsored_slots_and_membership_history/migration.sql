-- Drop two tables with no corresponding Prisma model and zero rows, confirmed unreferenced
-- anywhere in application code:
--
-- sponsored_slots — created in the initial migration (20260428000000_init) for a planned
--   sponsored-placement feature that was never wired up to a model or app code.
--
-- user_subscription_membership_history — superseded by 20260601000000_subscription_entry_
--   per_period_refactor, which migrated its data out and left the table in place as a
--   post-refactor safety net. It has since been emptied and the model was already removed
--   from schema.prisma.
--
-- No other table has a foreign key into either of these, and neither is referenced by any
-- view — verified against the live database before writing this migration.

DROP TABLE IF EXISTS "sponsored_slots";
DROP TABLE IF EXISTS "user_subscription_membership_history";
