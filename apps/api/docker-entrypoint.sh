#!/bin/sh
set -e

echo "▶ Running Prisma migrations..."
cd /app/packages/database
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy

echo "▶ Starting API..."
cd /app
exec node apps/api/dist/main.js
