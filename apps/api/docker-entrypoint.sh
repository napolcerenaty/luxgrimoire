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

# Re-tags existing users to the ToS/Privacy baseline version the first time each doc is found
# published in Ghost, so migrating them there doesn't force-redirect everyone to /consent.
# Fetches the current version itself (GHOST_CONTENT_API_KEY) — no manual input needed. Safe to
# run on every deploy forever: self-limiting via an AppSetting marker per doc, so it only ever
# acts once. See apps/api/src/scripts/backfill-policy-baseline-version.ts
echo "▶ Backfilling existing users to the Ghost baseline policy version (no-op once already done)..."
node apps/api/dist/scripts/backfill-policy-baseline-version.js || echo "⚠ policy-baseline-version backfill failed, continuing deploy"

echo "▶ Starting API..."
exec node apps/api/dist/main.js
