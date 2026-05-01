-- Fix: user_subscription_entries.subscriptionId FK was created with ON DELETE RESTRICT
-- but Prisma schema declares onDelete: Cascade. Align DB with schema so subscriptions
-- with user entries can be deleted by admin.
ALTER TABLE "user_subscription_entries"
  DROP CONSTRAINT "user_subscription_entries_subscriptionId_fkey";

ALTER TABLE "user_subscription_entries"
  ADD CONSTRAINT "user_subscription_entries_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
