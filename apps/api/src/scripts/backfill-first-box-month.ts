/**
 * One-off backfill: sets firstBoxYear/firstBoxMonth on every existing UserSubscriptionEntry that
 * doesn't have one yet (the join modal's new mandatory "choose your first box" step only sets
 * these going forward — see joinSubscription/getEligibleMonths/resolveFirstBoxMonth).
 *
 * Without this, the live computeFirstEligibleBoxMonth() formula (renewalDay/renewalMonthOffset/
 * signupIncludesCurrentMonth cycle math) would keep being recomputed for every pre-existing entry
 * on every eligible-months/renewal-date/managed-months call — which is exactly the drift problem
 * this feature exists to fix. This script closes that gap once: after it runs, every entry
 * (old and new) has a stable, non-recomputed first box month.
 *
 * Priority per entry:
 *   1. The earliest month with an actual track record from the user — either a book already in
 *      their collection from this entry (UserBookEntry -> edition -> SubscriptionMonthBook ->
 *      SubscriptionMonth), or a month they explicitly skipped (UserSkipRecord). This reflects what
 *      the user actually confirmed at signup (received or skipped), not a guess.
 *   2. If there's no track record at all (e.g. they clicked "Skip" on the whole past-boxes flow
 *      when they joined) — freeze today's computeFirstEligibleBoxMonth() result. A one-time best
 *      guess that stops drifting from here on, rather than leaving it uncomputed forever.
 *
 * Idempotent — only touches entries where firstBoxYear/firstBoxMonth is still null. Safe to re-run
 * (covers any entry created between runs, e.g. by data imports that bypass the join flow).
 *
 * Wired into docker-entrypoint.sh — runs automatically on every deploy, after migrations and
 * before the API starts. A failure there doesn't block startup (every call site already falls
 * back safely when firstBoxYear/firstBoxMonth is null), it just means this deploy's backfill
 * pass didn't complete and the next one will pick up whatever's left.
 *
 * Can also be run manually:
 *   node dist/scripts/backfill-first-box-month.js [--dry-run]
 *
 * Per-entry errors are caught individually (never crash the rest of the batch) and filed as a
 * BugReport (category 'data-migration') for manual follow-up, deduped by title so a still-broken
 * entry doesn't re-file a new report on every deploy.
 */
import { runScript } from './run-script'
import { PrismaService } from '../prisma/prisma.service'
import { BugReportsService } from '../modules/bug-reports/bug-reports.service'
import { computeFirstEligibleBoxMonth } from '../common/utils/renewal-date.util'

const DRY_RUN = process.argv.includes('--dry-run')

async function resolveMonthsSubscriptionIds(prisma: PrismaService, sub: { id: string; parentSubscriptionId: string | null; isCombo: boolean; componentIds: string[] }): Promise<string[]> {
  if (sub.isCombo) {
    if (sub.componentIds.length === 0) return []
    const components = await prisma.subscription.findMany({
      where: { id: { in: sub.componentIds } },
      select: { id: true, parentSubscriptionId: true },
    })
    return components.map(c => c.parentSubscriptionId ?? c.id)
  }
  return [sub.parentSubscriptionId ?? sub.id]
}

runScript('backfill-first-box-month', async app => {
  const prisma = app.get(PrismaService)
  const bugReports = app.get(BugReportsService)

  if (DRY_RUN) console.log('--- DRY RUN: no writes will be made ---')

  const entries = await prisma.userSubscriptionEntry.findMany({
    where: { firstBoxYear: null, startDate: { not: null } },
    select: { id: true, userId: true, subscriptionId: true, startDate: true, renewalDay: true },
  })

  let fromTrackRecord = 0
  let fromFrozenDefault = 0
  let skippedNoStartDate = 0
  let errored = 0

  for (const entry of entries) {
    try {
      await processEntry(prisma, entry, () => { fromTrackRecord++ }, () => { fromFrozenDefault++ }, () => { skippedNoStartDate++ })
    } catch (err) {
      errored++
      console.error(`[backfill-first-box-month] entry ${entry.id} failed:`, err)
      if (!DRY_RUN) {
        const title = `first-box-month backfill failed for entry ${entry.id}`
        const alreadyFiled = await prisma.bugReport.findFirst({ where: { category: 'data-migration', title } })
        if (!alreadyFiled) {
          await bugReports.create({
            userId: entry.userId,
            title,
            description:
              `UserSubscriptionEntry ${entry.id} (subscription ${entry.subscriptionId}, startDate ` +
              `${entry.startDate}) failed during the first-box-month backfill: ${err instanceof Error ? err.message : String(err)}. ` +
              `This entry still has no firstBoxYear/firstBoxMonth and will keep falling back to the ` +
              `live date-anchored default until fixed manually or re-run successfully.`,
            category: 'data-migration',
          }).catch(() => {})
        }
      }
    }
  }

  console.log(
    `[backfill-first-box-month] ${entries.length} entries processed: ` +
      `${fromTrackRecord} set from track record, ${fromFrozenDefault} set from frozen default, ` +
      `${skippedNoStartDate} skipped (no startDate), ${errored} failed (filed as bug reports).`,
  )
})

async function processEntry(
  prisma: PrismaService,
  entry: { id: string; userId: string; subscriptionId: string; startDate: string | null; renewalDay: number | null },
  onTrackRecord: () => void,
  onFrozenDefault: () => void,
  onNoStartDate: () => void,
): Promise<void> {
  if (!entry.startDate) { onNoStartDate(); return }

  const sub = await prisma.subscription.findUnique({
    where: { id: entry.subscriptionId },
    select: {
      id: true,
      parentSubscriptionId: true,
      isCombo: true,
      comboComponents: { select: { componentId: true } },
      renewalDay: true,
      renewalMonthOffset: true,
      signupIncludesCurrentMonth: true,
      intervalMonths: true,
      startingMonth: true,
      startDate: true,
    } as any,
  }) as any
  if (!sub) return // orphaned entry (subscription deleted) — nothing to backfill against

  // componentIds isn't a raw column — findBySlug derives it from the comboComponents relation
  // (see subscriptions.service.ts) the same way.
  const componentIds: string[] = (sub.comboComponents ?? []).map((c: { componentId: string }) => c.componentId)
  const monthsSubscriptionIds = await resolveMonthsSubscriptionIds(prisma, { ...sub, componentIds })

  let year: number | null = null
  let month: number | null = null

  if (monthsSubscriptionIds.length > 0) {
    // (a) Earliest month among books already in the user's collection from this entry
    const bookEntries = await prisma.userBookEntry.findMany({
      where: { subscriptionEntryId: entry.id, editionId: { not: null } },
      select: { editionId: true },
    })
    const editionIds = [...new Set(bookEntries.map(b => b.editionId).filter((id): id is string => !!id))]
    const earliestReceived = editionIds.length > 0
      ? await prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: monthsSubscriptionIds }, books: { some: { editionId: { in: editionIds } } } },
          select: { year: true, month: true },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        })
      : null

    // (b) Earliest month the user explicitly skipped from this entry
    const earliestSkipped = await prisma.userSkipRecord.findFirst({
      where: { userEntryId: entry.id },
      select: { month: { select: { year: true, month: true } } },
      orderBy: [{ month: { year: 'asc' } }, { month: { month: 'asc' } }],
    })

    const candidates = [
      earliestReceived ? { year: earliestReceived.year, month: earliestReceived.month } : null,
      earliestSkipped ? { year: earliestSkipped.month.year, month: earliestSkipped.month.month } : null,
    ].filter((c): c is { year: number; month: number } => !!c)

    if (candidates.length > 0) {
      const earliest = candidates.reduce((a, b) => (a.year * 12 + a.month <= b.year * 12 + b.month ? a : b))
      year = earliest.year
      month = earliest.month
    }
  }

  if (year != null && month != null) {
    onTrackRecord()
  } else {
    // No track record at all — freeze today's live formula result, once.
    const joinDate = new Date(entry.startDate)
    const renewalDay = entry.renewalDay ?? sub.renewalDay ?? 1
    const subscriptionStartDate: Date | null = sub.startDate ? new Date(sub.startDate) : null
    const computed = computeFirstEligibleBoxMonth(
      joinDate,
      renewalDay,
      sub.renewalMonthOffset ?? 0,
      sub.signupIncludesCurrentMonth ?? false,
      sub.intervalMonths ?? 1,
      sub.startingMonth ?? 1,
      subscriptionStartDate,
    )
    year = computed.year
    month = computed.month
    onFrozenDefault()
  }

  if (!DRY_RUN) {
    await prisma.userSubscriptionEntry.update({
      where: { id: entry.id },
      data: { firstBoxYear: year, firstBoxMonth: month },
    })
  }
}
