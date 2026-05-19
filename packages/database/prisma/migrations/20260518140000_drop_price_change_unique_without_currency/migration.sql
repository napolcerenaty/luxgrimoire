-- Drop the legacy unique constraint that does NOT include currency.
-- This constraint predates multi-currency support and prevents adding
-- price entries for the same month in a different currency.
-- The correct constraint (subscriptionId, effectiveYear, effectiveMonth, currency) remains.

DROP INDEX IF EXISTS "subscription_price_changes_subscriptionId_effectiveYear_eff_key";
