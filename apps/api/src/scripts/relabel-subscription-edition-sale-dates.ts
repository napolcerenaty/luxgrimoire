/**
 * One-off data-fix script: relabels EditionSaleDate rows created by the sale-tier redesign's
 * backfill (backfill-edition-sale-dates.ts) from a generic legacy-field name ("First Access" /
 * "Early Access" / "General Sale") to "Subscription Renewal Day", for editions that belong to a
 * subscription box month.
 *
 * Why this is needed: subscription-month edition creation (CreateBookEditionForm.tsx, driven by
 * computeGeneralSaleDatePrefill) has always defaulted its one sale-date row to the label
 * "Subscription Renewal Day" — but that labeling only exists in the *current* create-edition UI.
 * Editions created before the redesign only had a plain legacy generalSaleDate string, which the
 * backfill migrated into an EditionSaleDate row labeled "General Sale" (its only available guess,
 * since the backfill has no way to tell a renewal date from a real general-sale date). This left a
 * cosmetic but real inconsistency between editions added before vs. after the redesign.
 *
 * A subscription-linked edition is identified via the `monthBooks` relation (BookEdition ->
 * SubscriptionMonthBook -> SubscriptionMonth) — the authoritative FK-backed link. `subscriptionId`
 * on BookEdition is populated too but is a secondary/derived signal, not relied on here.
 *
 * Idempotent — naturally so, not via an existence check: once a row is renamed to "Subscription
 * Renewal Day" it no longer matches the generic-name filter, so re-running is a safe no-op for it.
 * Run automatically from docker-entrypoint.sh, right after backfill-edition-sale-dates.js (it must
 * run after, not before — it only catches rows that backfill already created). Also correctly
 * catches rows created by the corrected backfill for editions that were already linked to a
 * SaleAnnouncement at backfill time (see backfill-edition-sale-dates.ts's docstring — an earlier
 * version silently skipped those). Can also be run manually:
 *   node dist/scripts/relabel-subscription-edition-sale-dates.js [--dry-run]
 */
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { PrismaService } from '../prisma/prisma.service'

const DRY_RUN = process.argv.includes('--dry-run')

const GENERIC_LABELS = ['First Access', 'Early Access', 'General Sale']
const NEW_LABEL = 'Subscription Renewal Day'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] })
  const prisma = app.get(PrismaService)

  if (DRY_RUN) console.log('--- DRY RUN: no writes will be made ---')

  const editions = await prisma.bookEdition.findMany({
    where: { monthBooks: { some: {} } },
    select: {
      id: true,
      slug: true,
      saleDates: { where: { label: { in: GENERIC_LABELS } }, select: { id: true, label: true, date: true } },
    },
  })

  let relabeled = 0
  for (const e of editions) {
    for (const d of e.saleDates) {
      console.log(
        `[relabel-subscription-edition-sale-dates] ${e.slug} (${e.id}): "${d.label}" → "${NEW_LABEL}" (date: ${d.date.toISOString().slice(0, 10)})`,
      )
      relabeled++
      if (!DRY_RUN) {
        await prisma.editionSaleDate.update({ where: { id: d.id }, data: { label: NEW_LABEL } })
      }
    }
  }

  console.log(
    `[relabel-subscription-edition-sale-dates] ${relabeled} EditionSaleDate row(s) ${DRY_RUN ? 'would be' : 'were'} relabeled ` +
      `across ${editions.length} subscription-linked edition(s) checked.`,
  )
  await app.close()
}

main().catch(err => {
  console.error('[relabel-subscription-edition-sale-dates] failed:', err)
  process.exit(1)
})
