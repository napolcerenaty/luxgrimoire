# LuxGrimoire Monorepo

Full-stack book collection app for luxury editions and subscription boxes.

## Stack
- **Frontend**: Next.js 15 (App Router, Server Components)
- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL via Prisma
- **Cache/Queues**: Redis + BullMQ
- **Search**: Typesense
- **Images**: Cloudinary
- **Auth**: Better Auth
- **Email**: Brevo
- **UI**: Tailwind CSS + shadcn/ui
- **Deployment**: Coolify on Hetzner

## Structure

```
luxgrimoire/
├── apps/
│   ├── api/          NestJS backend
│   └── web/          Next.js 15 frontend
├── packages/
│   ├── database/     Prisma schema + client
│   └── shared-types/ TypeScript interfaces shared across apps
```

## Getting started

```bash
pnpm install
pnpm dev
```

## Environment variables

Copy `.env.example` in each app and fill in values:
- `apps/api/.env`
- `apps/web/.env.local`

## Database migrations

**Always use migrations — never `prisma db push`.**

The production database is on Coolify/Hetzner. Schema changes must go through versioned migration files so they can be safely deployed.

### Making a schema change

1. Edit `packages/database/prisma/schema.prisma`
2. Create a new migration file manually:
   ```
   packages/database/prisma/migrations/YYYYMMDDHHMMSS_describe_change/migration.sql
   ```
   Use safe SQL — prefer `IF NOT EXISTS`, nullable columns, or columns with defaults.
3. Mark it as applied on your local dev DB (which already has the change via schema edit):
   ```bash
   cd apps/api
   pnpm prisma migrate resolve --applied <migration_name> --schema="../../packages/database/prisma/schema.prisma"
   ```
4. Regenerate the Prisma client:
   ```bash
   # Stop node processes first (they lock the .dll on Windows)
   pnpm prisma generate --schema="../../packages/database/prisma/schema.prisma"
   ```
5. Verify status is clean:
   ```bash
   pnpm prisma migrate status --schema="../../packages/database/prisma/schema.prisma"
   # → "Database schema is up to date!"
   ```
6. Commit and push — production deploys via `prisma migrate deploy` on Coolify.

### Rules
- ❌ Never use `prisma db push` (bypasses migration history, breaks production deploys)
- ❌ Never use `prisma migrate dev` (will prompt to reset data if drift is detected)
- ✅ All SQL must be **idempotent** and **safe for production**: use `IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`, nullable or defaulted columns
- ✅ `prisma migrate deploy` (used by Coolify on production) only runs migrations not yet recorded in `_prisma_migrations`
