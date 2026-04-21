# Everheart Migration Script

Migrates Everheart Book Box data from the old Spring Boot PostgreSQL database to the new NestJS (`luxgrimoire_v2`) database.

## What gets migrated

| Entity | Scope |
|---|---|
| Users | **All** users from `app_user` |
| BookBoxCompany | Everheart only (filtered by `name ILIKE '%everheart%'`) |
| Books | Only books that appeared in Everheart subscription months |
| BookEditions | Editions of the migrated books |
| Authors | Only authors linked to Everheart books |
| Artists | Only artists with contributions on Everheart editions |
| BookAuthor links | Junction rows for migrated books |
| ArtistContribution links | Junction rows for migrated editions |
| Subscriptions | Everheart subscriptions only |
| SubscriptionMonths | All months for migrated subscriptions |
| SubscriptionMonthBooks | Book entries in each migrated month |

## What is NOT migrated (starts fresh in new app)

- User sessions, OAuth accounts
- User book entries / collection data
- Favorites, tags, follows, likes, comments
- Messaging / notifications
- Sale announcements
- Purchase transactions
- Subscription billing periods

## Prerequisites

1. Old DB must be running and accessible
2. New DB (`luxgrimoire_v2`) must exist with Prisma migrations applied:
   ```
   cd packages/database && pnpm db:migrate
   ```
3. Install dependencies in `scripts/`:
   ```
   cd scripts && pnpm install
   ```

## Running the migration

```bash
cd scripts

# Full migration
OLD_DB_NAME=luxgrimoire ts-node --project tsconfig.json migrate-everheart.ts

# With all options
OLD_DB_HOST=localhost \
OLD_DB_PORT=5432 \
OLD_DB_NAME=luxgrimoire \
OLD_DB_USER=postgres \
OLD_DB_PASSWORD=postgres \
NEW_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/luxgrimoire_v2 \
ts-node --project tsconfig.json migrate-everheart.ts

# Or via pnpm script
OLD_DB_NAME=luxgrimoire pnpm migrate
```

## Dry run (no writes to new DB)

```bash
DRY_RUN=true OLD_DB_NAME=luxgrimoire ts-node --project tsconfig.json migrate-everheart.ts
```

The dry run reads from the old DB and logs everything that *would* be migrated without writing a single row to the new DB. Use this to verify the scope before committing.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `OLD_DB_HOST` | `localhost` | Old DB host |
| `OLD_DB_PORT` | `5432` | Old DB port |
| `OLD_DB_NAME` | `luxgrimoire` | Old DB database name |
| `OLD_DB_USER` | `postgres` | Old DB user |
| `OLD_DB_PASSWORD` | `postgres` | Old DB password |
| `NEW_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/luxgrimoire_v2` | New DB connection URL |
| `DRY_RUN` | `false` | Set to `true` to skip all writes |

## Image / media migration

**Images are NOT auto-migrated to Cloudinary.**

The old Spring Boot app stored images as local file paths (e.g. `cover_image_path`, `logo_path`). These paths are preserved as-is in the new DB fields (`coverImage`, `logoUrl`) so you can identify which files need uploading.

After migration:
1. Locate the old image files on the server
2. Upload each to Cloudinary using the Cloudinary dashboard or CLI
3. Update the `coverImage` / `logoUrl` fields in the new DB with the Cloudinary `public_id`

## Error handling

The script is non-aborting: if a single record fails, the error is logged and migration continues with the next record. At the end a summary table is printed showing how many records were migrated vs skipped per entity.
