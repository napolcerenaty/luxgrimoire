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

# Re-tags existing users to a fixed ToS/Privacy baseline version so publishing those docs in
# Ghost for the first time doesn't force-redirect everyone to /consent. No-op when unset, and
# idempotent when set — safe to leave wired in. See apps/api/src/scripts/backfill-policy-baseline-version.ts
if [ -n "$POLICY_BASELINE_TERMS_VERSION" ] || [ -n "$POLICY_BASELINE_PRIVACY_VERSION" ]; then
  echo "▶ Backfilling existing users to the Ghost baseline policy version..."
  BACKFILL_ARGS=""
  [ -n "$POLICY_BASELINE_TERMS_VERSION" ] && BACKFILL_ARGS="$BACKFILL_ARGS --terms-version=$POLICY_BASELINE_TERMS_VERSION"
  [ -n "$POLICY_BASELINE_PRIVACY_VERSION" ] && BACKFILL_ARGS="$BACKFILL_ARGS --privacy-version=$POLICY_BASELINE_PRIVACY_VERSION"
  node apps/api/dist/scripts/backfill-policy-baseline-version.js $BACKFILL_ARGS || echo "⚠ policy-baseline-version backfill failed, continuing deploy"
fi

echo "▶ Starting API..."
exec node apps/api/dist/main.js
