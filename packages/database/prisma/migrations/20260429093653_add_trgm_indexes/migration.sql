-- Enable pg_trgm extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for audit log search
CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_logs_username_trgm_gin
  ON audit_logs USING gin (username gin_trgm_ops)
  WHERE username IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_logs_action_trgm_gin
  ON audit_logs USING gin (action gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_entityTitle_trgm_gin"
  ON audit_logs USING gin ("entityTitle" gin_trgm_ops)
  WHERE "entityTitle" IS NOT NULL;

-- GIN trigram indexes for book search
CREATE INDEX CONCURRENTLY IF NOT EXISTS books_title_trgm_gin
  ON books USING gin (title gin_trgm_ops);

-- GIN trigram index for book edition search
CREATE INDEX CONCURRENTLY IF NOT EXISTS "book_editions_editionName_trgm_gin"
  ON book_editions USING gin ("editionName" gin_trgm_ops)
  WHERE "editionName" IS NOT NULL;
