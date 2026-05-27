# LuxGrimoire — Copilot Instructions

## Branching & deployment
- Always work on branch `development`
- After every commit, push immediately (`git push`)
- **Never merge to `master` without explicit user command** — master triggers production deployment

## Database migrations
- All DB changes (schema, seed data, rule updates) must be done via migration files in `packages/database/prisma/migrations/`
- Never use `prisma db push` or `prisma migrate dev`
- Apply locally with: `prisma migrate resolve --applied <migration_name>`
- All SQL must use `IF NOT EXISTS` / `IF EXISTS` guards for production safety
- New migration directory naming: `YYYYMMDDHHMMSS_description`

## Design & spec files
- Before implementing any feature, read the relevant spec file from the user's Desktop (e.g. `luxgrimoire-feature-categories-v2.md`, `backfill-subskrypcji-pseudokod.md`, etc.)
- Desktop files are the source of truth for feature design — read carefully to avoid rework

## Tech stack
- Monorepo managed with `pnpm`
- API: NestJS (`apps/api`)
- Web: Next.js (`apps/web`)
- Database: PostgreSQL + Prisma (`packages/database`)
- Run type-check: `pnpm --filter @luxgrimoire/api exec tsc --noEmit`
- Run tests: `pnpm --filter @luxgrimoire/api exec jest <test-file> --no-coverage`

## Code conventions
- All DB sentinel/initial records use `effectiveFrom = new Date(0)` (epoch) to cover all historical months — same pattern as `upsertSentinelPrice` and `subscription_settings_history`
- Windows EPERM symlink errors during Next.js standalone build are pre-existing and not blocking
