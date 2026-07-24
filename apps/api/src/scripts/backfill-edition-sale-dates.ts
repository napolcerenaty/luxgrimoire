/**
 * Backfill script: migrates standalone BookEdition legacy date fields
 * (firstAccessDate/earlyAccessDate/generalSaleDate — free text) into EditionSaleDate rows.
 *
 * Only applies to editions with NO linked SaleAnnouncement — those resolve their sale
 * date live from the announcement's SaleTier rows instead (see resolveEditionSaleDate
 * in EditionsService). Unparseable non-null legacy values are filed as a BugReport
 * (category 'data-migration') for manual admin follow-up, never dropped.
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

function parseLegacyDate(raw: string): Date | null {
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] })
  const prisma = app.get(PrismaService)
  const bugReports = app.get(BugReportsService)

  if (DRY_RUN) console.log('--- DRY RUN: no writes will be made ---')

  const editions = await prisma.bookEdition.findMany({
    where: { saleEditions: { none: {} } },
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
          await bugReports.create({
            title: `Unparseable legacy ${field} on edition ${e.slug}`,
            description:
              `BookEdition ${e.id} (slug: ${e.slug}) has ${field} = ${JSON.stringify(raw)}, which could not ` +
              `be parsed as a date during the sale-tier migration backfill. Please review and enter it manually ` +
              `as a sale date on this edition.`,
            category: 'data-migration',
          })
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
