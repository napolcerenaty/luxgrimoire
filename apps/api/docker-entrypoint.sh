#!/bin/sh
set -e

echo "▶ Running Prisma migrations..."
packages/database/node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma

echo "▶ Starting API..."
exec node apps/api/dist/main.js
