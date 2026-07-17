# LuxGrimoire — Claude Code Instructions

## Project location & session startup
- Local path: `C:\Users\renat\Documents\luxgrimoire` (also the session working directory)
- Before making code changes, verify:
  - `node_modules` present at root and in each workspace — if missing/stale, run `pnpm install`
  - `apps/api/.env` and `apps/web/.env.local` exist (copy from the adjacent `.env.example` if missing — not checked into git)
  - Postgres reachable via `DATABASE_URL` in `apps/api/.env`
  - Redis (localhost:6379) is optional — the API runs without cache if it's not up
- Starting the dev servers:
  - `pnpm dev` (turbo) — runs API (`nest start --watch`, :3001) + Web (`next dev`, :3000) together
  - `.\restart.ps1` at repo root — user's preferred Windows script: kills anything on :3000/:3001, starts Redis if installed via scoop, then API (from built `dist/main`, not watch mode) + Web. Flags: `-ApiOnly`, `-WebOnly`, `-RedisOnly`
  - API: http://localhost:3001 · Web: http://localhost:3000

## Branching & deployment
- Always work on branch `development`
- After every commit, push immediately (`git push`)
- **Never merge to `master` without explicit user command** — master triggers production deployment
- Before merging to `master`, always run `git pull origin master` first to sync local master with remote, then merge development into it — avoids creating inflated merge commits from a stale local master

## Database migrations
- All DB changes (schema, seed data, rule updates) must be done via migration files in `packages/database/prisma/migrations/`
- Never use `prisma db push` or `prisma migrate dev`
- Apply locally with: `prisma db execute --url $DATABASE_URL --file <migration.sql>` then `prisma migrate resolve --applied <migration_name>`
- All SQL must use `IF NOT EXISTS` / `IF EXISTS` guards for production safety
- New migration directory naming: `YYYYMMDDHHMMSS_description`
- **Column names in migrations must use camelCase with double-quotes** (e.g. `ALTER TABLE users ADD COLUMN "statsSettings" JSONB`) — the project uses camelCase column names throughout, never snake_case
- Never add DROP TABLE or DROP COLUMN without explicit user confirmation

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

## Analytics events
- Service: `AnalyticsService.track({ eventType, userId?, entityType?, entityId?, entityName?, value? })` (`apps/api/src/modules/analytics/analytics.service.ts`) — fire-and-forget (never `await`ed, never throws), writes to `AnalyticsEvent` / table `analytics_events`.
- To add a new event: (1) call `this.analyticsService.track({...})` inline in the relevant controller endpoint (most controllers already inject `analyticsService`), (2) add an entry to `SUPPORTED_EVENT_TYPES` in `apps/api/src/modules/analytics/analytics.dto.ts` so it's selectable in the admin analytics panel.
- **One event type per action — never separate event-type strings for anonymous vs logged-in.** Distinguish via the nullable `userId` field instead (`COALESCE(user_id, '(anonymous)')` in the admin aggregation query). See `subscription_join`, `waitlist_join`, `books_by_month_view` for examples.
- Auth on the endpoint determines whether `userId` can be populated at all: `@Public()` endpoints never see `req.user` (view events like `edition_view`/`book_view`/`subscription_view` only get `entityType`/`entityId`/`entityName`); `@OptionalAuth()` endpoints get `req.user?.id ?? null` (use this when a view/action should record identity when present without requiring login); fully authenticated endpoints use `@CurrentUser()`.
- `AuditService` (`apps/api/src/modules/audit/audit.service.ts`) is a **different, unrelated** system — admin/moderator mutation audit trail only (`CREATE_SUBSCRIPTION`, `DELETE_SUBSCRIPTION`, etc.), always paired with `Roles(...)`-gated endpoints and an authenticated actor. Never use it for page views or anonymous-friendly events.

## Code conventions
- All DB sentinel/initial records use `effectiveFrom = new Date(0)` (epoch) to cover all historical months — same pattern as `upsertSentinelPrice` and `subscription_settings_history`
- Windows EPERM symlink errors during Next.js standalone build are pre-existing and not blocking
