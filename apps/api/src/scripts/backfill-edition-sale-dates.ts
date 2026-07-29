/**
 * Backfill script: migrates BookEdition legacy date fields (firstAccessDate/earlyAccessDate/
 * generalSaleDate — free text) into EditionSaleDate rows.
 *
 * Applies to EVERY edition with a legacy date, not just standalone ones — resolveEditionSaleDate
 * combines the earliest manual EditionSaleDate row with any linked SaleAnnouncement's tiers (the
 * earliest of the two wins; manual rows are never auto-deleted on link), specifically so a book's
 * original sale/renewal date survives even after it later gets linked to an announcement. An
 * earlier version of this script only processed editions with NO linked SaleAnnouncement, which
 * silently dropped that original date for any edition linked before the backfill ran (confirmed
 * locally: 27 subscription-linked editions had lost their renewal date this way). Unparseable
 * non-null legacy values are filed as a BugReport (category 'data-migration') for manual admin
 * follow-up, never dropped.
 *
 * The SaleTier backfill itself (from SaleAnnouncement/SaleAnnouncementRegion, and the
 * tierId backfill on UserSaleInterest/ScheduledReminder) is plain SQL and runs
 * automatically as part of the `sale_tiers` migration via `prisma migrate deploy` —
 * no separate step needed for that part. This script only covers the piece that
 * genuinely needs JS-level free-text date parsing and bug-report filing.
 *
 * Idempotent — safe to run on every deploy: skips editions that already have
 * EditionSaleDate rows. Run automatically from docker-entrypoint.sh, right after
 * `prisma migrate deploy` and before the API starts. Can also be run manually:
 *   node dist/scripts/backfill-edition-sale-dates.js [--dry-run]
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { PrismaService } from '../prisma/prisma.service'
import { BugReportsService } from '../modules/bug-reports/bug-reports.service'

const DRY_RUN = process.argv.includes('--dry-run')

const LEGACY_FIELDS = ['firstAccessDate', 'earlyAccessDate', 'generalSaleDate'] as const
type LegacyField = (typeof LEGACY_FIELDS)[number]

const TIER_NAME: Record<LegacyField, string> = {
  firstAccessDate: 'First Access',
  earlyAccessDate: 'Early Access',
  generalSaleDate: 'General Sale',
}
const TIER_ORDER: Record<LegacyField, number> = {
  firstAccessDate: 0,
  earlyAccessDate: 1,
  generalSaleDate: 2,
}

// JS's Date parser is lenient enough to accept malformed strings like "20218-01-01" (a typo
// for a 4-digit year) as a valid extended-year timestamp thousands of years in the future,
// rather than failing — Number.isNaN(d.getTime()) alone doesn't catch this. Bound the accepted
// range to something plausible for a book-sale date so typos like this are treated as
// unparseable (filed as a bug report) instead of crashing on an out-of-range DB write.
const MIN_YEAR = 1990
const MAX_YEAR = 2100

function parseLegacyDate(raw: string): Date | null {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  const year = d.getUTCFullYear()
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  return d
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] })
  const prisma = app.get(PrismaService)
  const bugReports = app.get(BugReportsService)

  if (DRY_RUN) console.log('--- DRY RUN: no writes will be made ---')

  const editions = await prisma.bookEdition.findMany({
    select: { id: true, slug: true, firstAccessDate: true, earlyAccessDate: true, generalSaleDate: true },
  })

  let created = 0
  let unparseable = 0
  let skipped = 0

  for (const e of editions) {
    const existing = await prisma.editionSaleDate.count({ where: { editionId: e.id } })
    if (existing > 0) {
      skipped++
      continue
    }

    for (const field of LEGACY_FIELDS) {
      const raw = e[field]
      if (!raw) continue
      const parsed = parseLegacyDate(raw)
      if (!parsed) {
        unparseable++
        console.warn(`[backfill-edition-sale-dates] unparseable ${field}="${raw}" on edition ${e.slug} (${e.id})`)
        if (!DRY_RUN) {
          // An edition whose only legacy dates are all unparseable never gets an EditionSaleDate
          // row, so the top-level "already backfilled" check (existing > 0) never trips for it —
          // without this dedup it would re-file a duplicate bug report on every single run
          // (including every production deploy, since this script is auto-invoked each time).
          const title = `Unparseable legacy ${field} on edition ${e.slug}`
          const alreadyFiled = await prisma.bugReport.findFirst({ where: { category: 'data-migration', title } })
          if (!alreadyFiled) {
            await bugReports.create({
              title,
              description:
                `BookEdition ${e.id} (slug: ${e.slug}) has ${field} = ${JSON.stringify(raw)}, which could not ` +
                `be parsed as a date during the sale-tier migration backfill. Please review and enter it manually ` +
                `as a sale date on this edition.`,
              category: 'data-migration',
            })
          }
        }
        continue
      }
      created++
      if (!DRY_RUN) {
        await prisma.editionSaleDate.create({
          data: { editionId: e.id, label: TIER_NAME[field], date: parsed, order: TIER_ORDER[field] },
        })
      }
    }
  }

  console.log(
    `[backfill-edition-sale-dates] ${created} EditionSaleDate rows ${DRY_RUN ? 'would be created' : 'created'}, ` +
      `${unparseable} unparseable values filed as bug reports, ${skipped} editions already backfilled (skipped)`,
  )
  await app.close()
}

main().catch(err => {
  console.error('[backfill-edition-sale-dates] failed:', err)
  process.exit(1)
})
