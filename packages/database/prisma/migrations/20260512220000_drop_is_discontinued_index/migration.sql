-- Drop low-selectivity boolean index on subscriptions.isDiscontinued.
-- PostgreSQL will not use a BTree index on a near-uniform boolean column
-- (WHERE isDiscontinued = false covers ~95% of rows; planner prefers seq scan).
-- The companyId index already covers queries that filter by company + status.
DROP INDEX CONCURRENTLY IF EXISTS "subscriptions_isDiscontinued_idx";
