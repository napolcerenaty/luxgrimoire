#!/bin/sh
set -e

echo "▶ Resolving any failed migrations..."
packages/database/node_modules/.bin/prisma migrate resolve \
  --rolled-back 20260502000000_allow_multiple_collection_copies \
  --schema packages/database/prisma/schema.prisma 2>/dev/null || true

packages/database/node_modules/.bin/prisma migrate resolve \
  --rolled-back 20260507072855_prepaid_billing_periods \
  --schema packages/database/prisma/schema.prisma 2>/dev/null || true

echo "▶ Running Prisma migrations..."
packages/database/node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma

echo "▶ Starting API..."
exec node apps/api/dist/main.js
