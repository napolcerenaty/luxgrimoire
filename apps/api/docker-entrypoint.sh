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

echo "▶ Backfilling first box month for existing subscription entries..."
# Idempotent (only touches entries where firstBoxYear is still null) — safe to run on every
# deploy. Uses runScript() (apps/api/src/scripts/run-script.ts), which always calls
# app.close()+process.exit() itself, so it can't hang the entrypoint the way a hand-rolled
# main() did previously (see project_nestfactory_script_hang_pattern memory — that caused a
# real prod outage). `|| true`: a backfill failure must never block the API from starting —
# every call site already falls back safely to the live date-anchored default when
# firstBoxYear/firstBoxMonth is null, so this step is an optimization, not a correctness gate.
node apps/api/dist/scripts/backfill-first-box-month.js || echo "⚠ backfill-first-box-month failed — continuing startup anyway"

echo "▶ Starting API..."
exec node apps/api/dist/main.js
