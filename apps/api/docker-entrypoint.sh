#!/bin/sh
set -e

echo "▶ Resolving any failed migrations..."
packages/database/node_modules/.bin/prisma migrate resolve \
  --rolled-back 20260502000000_allow_multiple_collection_copies \
  --schema packages/database/prisma/schema.prisma 2>/dev/null || true

packages/database/node_modules/.bin/prisma migrate resolve \
  --rolled-back 20260507072855_prepaid_billing_periods \
  --schema packages/database/prisma/schema.prisma 2>/dev/null || true

packages/database/node_modules/.bin/prisma migrate resolve \
  --rolled-back 20260515000000_add_onboarding_completed_at \
  --schema packages/database/prisma/schema.prisma 2>/dev/null || true

packages/database/node_modules/.bin/prisma migrate resolve \
  --rolled-back 20260512210000_add_search_trgm_indexes \
  --schema packages/database/prisma/schema.prisma 2>/dev/null || true

packages/database/node_modules/.bin/prisma migrate resolve \
  --rolled-back 20260712000000_add_last_login_at \
  --schema packages/database/prisma/schema.prisma 2>/dev/null || true

echo "▶ Running Prisma migrations..."
packages/database/node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma

echo "▶ Removing content streams from search index..."
node apps/api/dist/scripts/remove-content-streams-from-search-index.js || echo "⚠ remove-content-streams-from-search-index failed, continuing startup (idempotent — will retry on next deploy)"

echo "▶ Starting API..."
exec node apps/api/dist/main.js
