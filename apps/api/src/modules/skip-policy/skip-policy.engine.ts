import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { refreshNextRenewalDate, renewalMonthFromBoxMonth } from '../../common/utils/renewal-date.util';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';

export interface SkipStatus {
  policyType: string;
  totalSkips: number;
  skipsInWindow: number;
  consecutiveSkips: number;
  maxSkips: number | null;
  maxConsecutive: number | null;
  canSkip: boolean;
  warnings: string[];
  notes: string | null;
  /** How to submit a skip request to the subscription company */
  skipHow: string | null;
  /** ISO date string of skip deadline for the next upcoming month, or null if no deadline */
  nextDeadline: string | null;
  isPastDeadline: boolean;
  /** Months the user has already skipped (active, not undone) */
  skippedMonths: { year: number; month: number }[];
  /** The user's first deliverable month — cannot be skipped */
  firstDeliverableMonth: { year: number; month: number } | null;
  /** Whether the subscription policy allows unskipping */
  allowUnskip: boolean;
  /** How to submit an unskip request */
  unskipHow: string | null;
  /** Notes about the unskip policy */
  unskipNotes: string | null;
  /** ISO date string of unskip deadline for the earliest currently-skipped month, or null */
  nextUnskipDeadline: string | null;
  /** Whether the unskip deadline for the earliest skipped month has passed */
  isUnskipPastDeadline: boolean;
  /** The next month the user can skip, or null if none available */
  targetMonth: { year: number; month: number } | null;
}

@Injectable()
export class SkipPolicyEngine {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly scheduledReminders?: ScheduledRemindersService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────

  async getStatus(userId: string, subscriptionSlug: string): Promise<SkipStatus> {
    const { subscription, policy, state, entry, skipRecords, isCombo, componentIds, monthsSubscriptionId } = await this.loadContext(userId, subscriptionSlug);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    const offset: number = (subscription as any).renewalMonthOffset ?? 0;

    let skippedMonths = skipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    let skippedSet = new Set(skippedMonths.map((s) => `${s.year}-${s.month}`));
    let effectiveState = state;
    // Flat list of all skip records (with windowKey) used later to filter display to current window
    let allSkipRecordsForWindow: Array<{ windowKey: string | null; month: { year: number; month: number } }> = skipRecords;

    // For combo subscriptions: aggregate skip records from component entries so the counter
    // reflects all historical skips (which may have been recorded on component entry IDs).
    if (isCombo && componentIds.length > 0) {
      const compEntries = await this.prisma.userSubscriptionEntry.findMany({
        where: { userId, subscriptionId: { in: componentIds }, active: true },
        select: { id: true, firstSkipDate: true },
      });
      if (compEntries.length > 0) {
        const compEntryIds = compEntries.map((e) => e.id);
        const compRecords = await this.prisma.userSkipRecord.findMany({
          where: { userEntryId: { in: compEntryIds }, undoneAt: null },
          include: { month: { select: { year: true, month: true } } },
          orderBy: { skippedAt: 'asc' },
        });

        // Merge, dedup by calendar month
        const seen = new Set(skipRecords.map((r) => `${r.month.year}-${r.month.month}`));
        const additional = compRecords.filter((r) => !seen.has(`${r.month.year}-${r.month.month}`));
        const allRecords = [...skipRecords, ...additional];

        skippedMonths = allRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
        skippedSet = new Set(skippedMonths.map((s) => `${s.year}-${s.month}`));
        allSkipRecordsForWindow = allRecords;

        // Build effectiveState when state is null (no skips recorded via combo entry yet)
        if (!state && allRecords.length > 0 && policy?.type === 'FROM_FIRST_SKIP') {
          const allFirstDates = [
            entry.firstSkipDate,
            ...compEntries.map((e) => e.firstSkipDate),
          ].filter(Boolean) as Date[];
          const earliestFirst = allFirstDates.length > 0
            ? allFirstDates.reduce((a, b) => (a < b ? a : b))
            : null;

          let skipsInCurrentWindow = allRecords.length;
          // Window key of the current active window, derived from stored skip records.
          // Used to populate effectiveState.windowKey so the display filter can match records.
          let activeWindowKeyFromRecords: string | null = null;
          if (earliestFirst && policy.windowMonths) {
            // Walk forward in windowMonths increments from earliest first skip to find current window
            let winStart = new Date(earliestFirst);
            const today = new Date();
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const winEnd = new Date(winStart);
              winEnd.setMonth(winEnd.getMonth() + policy.windowMonths);
              if (today < winEnd) {
                // Count records skipped within [winStart, winEnd) and extract their windowKey
                const winRecords = allRecords.filter((r) => {
                  const t = (r as any).skippedAt ? new Date((r as any).skippedAt) : null;
                  return t && t >= winStart && t < winEnd;
                });
                skipsInCurrentWindow = winRecords.length;
                activeWindowKeyFromRecords = winRecords[0]?.windowKey ?? null;
                break;
              }
              winStart = winEnd;
            }
          }

          effectiveState = {
            totalSkips: allRecords.length,
            skipsInWindow: skipsInCurrentWindow,
            consecutiveSkips: 0,
            windowKey: activeWindowKeyFromRecords,
          } as NonNullable<typeof state>;
        }
      }
    }

    // Fix stale skipsInWindow: if the current window key has changed since last skip, show 0.
    // Skip this check when state.windowKey is null — the state is desynced (e.g. created before
    // windowKey was persisted in recomputeState). In that case, trust state.skipsInWindow as-is.
    if (state && policy && state.windowKey !== null) {
      const currentWindowKey = this.computeWindowKey(policy, state, entry);
      if (currentWindowKey !== null && currentWindowKey !== state.windowKey) {
        effectiveState = { ...state, skipsInWindow: 0 };
      }
    }

    // Filter skippedMonths for display to the CURRENT window only.
    // skippedSet is intentionally kept as all-time (used to block re-skipping previous window months).
    if (policy && policy.type !== 'UNLIMITED' && policy.type !== 'UNLIMITED_MAX_CONSEC' && policy.type !== 'NONE') {
      const activeWindowKey = this.computeWindowKey(policy, effectiveState, entry);
      if (activeWindowKey !== null) {
        skippedMonths = allSkipRecordsForWindow
          .filter((r) => r.windowKey === activeWindowKey)
          .map((r) => ({ year: r.month.year, month: r.month.month }));
      }
    }

    // Before the current month's renewalDay: the user can still skip the current month (with offset).
    // After renewalDay passes: current month is locked, target next month and warn.
    const renewalDay = entry.effectiveRenewalDay;
    const { candidateYear, candidateMonth, currentMonthSkipPassed } =
      this.computeSkipCandidate(now, renewalDay, offset);

    let targetMonth: { id: string; year: number; month: number; seriesId: string | null } | null = null;
    let subscriptionStarted = true; // assume started unless proven otherwise
    let firstMonthInfo: { firstMonthId: string; firstSeriesId: string | null; year: number; month: number } | null = null;
    let blockedByNoSkipSeries = false;

    {
      // Use subscription.startDate to determine if subscription has started yet.
      // This is set by admins to the first day of the first delivery month.
      const subStartDate = (subscription as any).startDate as Date | null;
      subscriptionStarted = !subStartDate || subStartDate <= now;

      if (subscriptionStarted) {
        // Determine the user's actual first deliverable month.
        // For paymentOnStartup subscriptions: if renewalDay already passed on join date,
        // the user's first month is the NEXT month (same logic as recordFirstMonthAsPreorder).
        // Exception: signupIncludesCurrentMonth=true means the user DID receive the join month's box
        // at signup, so we never advance — the join month is always the first deliverable.
        let effectiveStartDate = entry.startDate;
        const paymentOnStartup = (subscription as any).paymentOnStartup as boolean;
        const signupIncludesCurrentMonth = (subscription as any).signupIncludesCurrentMonth as boolean;
        if (paymentOnStartup && !signupIncludesCurrentMonth && entry.startDate && entry.effectiveRenewalDay) {
          const joinDate = new Date(entry.startDate);
          const joinDay = joinDate.getDate();
          const renewalD = entry.effectiveRenewalDay;
          if (renewalD < joinDay) {
            // Renewal already passed this month — first deliverable is next month
            const joinYear = joinDate.getFullYear();
            const joinMonth = joinDate.getMonth() + 1;
            const [nextY, nextM] = joinMonth === 12 ? [joinYear + 1, 1] : [joinYear, joinMonth + 1];
            effectiveStartDate = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
          }
        }

        // Determine the user's first deliverable month (and its series, if any) for blocking logic.
        // For combo subscriptions the months live on component subscriptions — skip first-box protection.
        firstMonthInfo = isCombo ? null : await this.getFirstDeliverableMonthInfo(monthsSubscriptionId, effectiveStartDate);

        // Find the first upcoming month the user CAN skip:
        // - must be >= candidate month (next calendar month + offset)
        // - must not already be skipped
        // - must NOT be the first standalone box, or any month in the first series
        const candidateWhere = {
          OR: [
            { year: { gt: candidateYear } },
            { year: candidateYear, month: { gte: candidateMonth } },
          ],
        };
        const rawCandidates = await this.prisma.subscriptionMonth.findMany({
          where: isCombo
            ? { subscriptionId: { in: componentIds }, ...candidateWhere }
            : { subscriptionId: monthsSubscriptionId, ...candidateWhere },
          select: {
            id: true, year: true, month: true, seriesId: true,
            series: { select: { skipMode: true, months: { select: { year: true, month: true }, orderBy: [{ year: 'asc' }, { month: 'asc' }], take: 1 } } },
          },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
          take: isCombo ? 24 : 12,
        });

        const seriesBlockModes = new Set(['SERIES_AS_ONE', 'SERIES_ONLY', 'SERIES_AS_MANY']);

        // For combos: deduplicate by (year, month) — keep first component month per calendar slot
        const candidates = isCombo
          ? (() => {
              const seen = new Set<string>();
              return rawCandidates.filter((m) => {
                const key = `${m.year}-${m.month}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            })()
          : rawCandidates;

        for (const m of candidates) {
          if (skippedSet.has(`${m.year}-${m.month}`)) continue;

          // Cannot skip months in a NO_SKIP series
          if (m.series?.skipMode === 'NO_SKIP') { blockedByNoSkipSeries = true; continue; }

          // Cannot skip mid-series: if a skip-as-series mode is active and the series has already
          // started (first series month < candidateMonth), block until the series ends
          if (m.series && seriesBlockModes.has(m.series.skipMode)) {
            const firstSeriesMonth = m.series.months[0];
            if (firstSeriesMonth) {
              const seriesStarted =
                firstSeriesMonth.year < candidateYear ||
                (firstSeriesMonth.year === candidateYear && firstSeriesMonth.month < candidateMonth);
              if (seriesStarted) { blockedByNoSkipSeries = true; continue; }
            }
          }

          // Cannot skip first box (standalone) or any month in the first series
          if (firstMonthInfo) {
            if (firstMonthInfo.firstSeriesId !== null && m.seriesId === firstMonthInfo.firstSeriesId) continue;
            if (firstMonthInfo.firstSeriesId === null && m.id === firstMonthInfo.firstMonthId) continue;
          }

          targetMonth = m;
          break;
        }
      }
    }

    const deadline = this.computeDeadline(policy, entry, targetMonth, offset);
    const firstDeliverable = firstMonthInfo ? { year: firstMonthInfo.year, month: firstMonthInfo.month } : null;

    // Compute unskip deadline for the most recent (latest) skipped month.
    // If that deadline has already passed, treat as null — no actionable unskip available.
    // This works correctly for all frequencies (monthly, bi-monthly, etc.) because the
    // deadline is derived from the skip's own renewal date, not the calendar month.
    const latestSkipped = skippedMonths.length > 0
      ? skippedMonths.reduce((a, b) => (a.year > b.year || (a.year === b.year && a.month > b.month)) ? a : b)
      : null;
    const rawUnskipDeadline = this.computeUnskipDeadline(policy, entry, latestSkipped, offset);
    const unskipDeadline = rawUnskipDeadline && rawUnskipDeadline > now ? rawUnskipDeadline : null;

    // Compute live consecutive streak from all skip records so renewals that break the streak
    // are reflected immediately (DB state is only updated on skip/unskip operations).
    const sortedAllSkips = [...allSkipRecordsForWindow]
      .filter((r) => r.month)
      .sort((a, b) => a.month.year !== b.month.year ? a.month.year - b.month.year : a.month.month - b.month.month);
    let liveConsecutive = 0;
    if (sortedAllSkips.length > 0) {
      liveConsecutive = 1;
      for (let i = sortedAllSkips.length - 2; i >= 0; i--) {
        const curr = sortedAllSkips[i + 1].month;
        const prev = sortedAllSkips[i].month;
        const expectedPrevYear = curr.month === 1 ? curr.year - 1 : curr.year;
        const expectedPrevMonth = curr.month === 1 ? 12 : curr.month - 1;
        if (prev.year === expectedPrevYear && prev.month === expectedPrevMonth) {
          liveConsecutive++;
        } else {
          break;
        }
      }
    }
    if (effectiveState) {
      effectiveState = { ...effectiveState, consecutiveSkips: liveConsecutive };
    }

    // If subscription hasn't started yet, force canSkip=false regardless of policy state
    const status = this.buildStatus(policy, effectiveState, deadline, skippedMonths, targetMonth, subscriptionStarted ? undefined : false, firstDeliverable, unskipDeadline, entry.prepaidMonths);

    // Warn when upcoming months are blocked by a NO_SKIP or in-progress series
    if (!status.canSkip && targetMonth === null && subscriptionStarted && blockedByNoSkipSeries) {
      status.warnings.unshift(`Skipping is not available — upcoming months are part of a series that does not allow skips or is already in progress.`);
    }

    if (currentMonthSkipPassed && !blockedByNoSkipSeries) {
      const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const rawBox = (now.getMonth() + 1) + offset;
      const boxMonth = rawBox > 12 ? rawBox - 12 : rawBox;
      const boxYear = rawBox > 12 ? now.getFullYear() + 1 : now.getFullYear();
      status.warnings.unshift(`The skip window for ${MONTHS[boxMonth - 1]} ${boxYear} has passed (renewal day: ${renewalDay}).`);
    }
    return status;
  }

  /** Public entry point for recomputing skip state after bulk operations (e.g. backfill) */
  async recomputeSkipState(userId: string, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { skipPolicies: true },
    });
    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId, active: true },
      select: { prepaidMonths: true },
    });
    const isPrepaid = (entry?.prepaidMonths ?? 1) > 1;
    const policy = this.selectApplicablePolicy(subscription?.skipPolicies ?? [], isPrepaid);
    return this.recomputeState(userId, subscriptionId, policy);
  }

  async recordSkip(
    userId: string,
    subscriptionSlug: string,
    year: number,
    month: number,
  ): Promise<SkipStatus> {
    const { subscription, policy, state, entry, isCombo, componentIds, monthsSubscriptionId } = await this.loadContext(userId, subscriptionSlug);
    if (!this.evaluateCanSkip(policy, state, entry.prepaidMonths)) {
      throw new ForbiddenException('Skip not allowed under current policy');
    }

    // Deadline is informational only — we allow late tracking (user may have skipped on time but forgot to log it here)

    // Find the subscription month.
    // For combo subscriptions the months live on component subscriptions;
    // we pick the first component month for the given calendar slot (deterministic ordering).
    const subMonth = isCombo
      ? await this.prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: componentIds }, year, month },
          include: { series: true },
          orderBy: { subscriptionId: 'asc' },
        })
      : await this.prisma.subscriptionMonth.findUnique({
          where: { subscriptionId_year_month: { subscriptionId: monthsSubscriptionId, year, month } },
          include: { series: true },
        });
    if (!subMonth) {
      throw new NotFoundException(`Month ${month}/${year} not found for this subscription`);
    }

    // Series-based skip restrictions only apply to non-combo subscriptions.
    if (!isCombo) {
      if (subMonth.series && subMonth.series.skipMode === 'NO_SKIP') {
        throw new ForbiddenException(
          `Month ${month}/${year} belongs to series "${subMonth.series.name}" which does not allow skips.`,
        );
      }

      const seriesBlockModes = ['SERIES_ONLY', 'SERIES_AS_ONE', 'SERIES_AS_MANY'];
      if (subMonth.series && seriesBlockModes.includes(subMonth.series.skipMode)) {
        throw new BadRequestException(
          `Month ${month}/${year} belongs to series "${subMonth.series.name}" (skip mode: ${subMonth.series.skipMode}). Use the series skip endpoint instead.`,
        );
      }
    }

    // PREPAID_WINDOW_SKIP: a single skip covers the ENTIRE upcoming prepaid window
    // (all prepaidMonths months). Handled separately from per-month skips.
    if (policy?.type === 'PREPAID_WINDOW_SKIP' && entry.prepaidMonths > 1) {
      return this.recordPrepaidWindowSkip(
        userId, subscription, policy, state, entry, isCombo, componentIds, monthsSubscriptionId, year, month,
      );
    }

    const windowKey = this.computeWindowKey(policy, state, entry);
    const now = new Date();
    const newConsecutive = await this.computeNewConsecutive(entry.id, subscription.id, year, month, state, isCombo ? componentIds : null);

    // Create skip record (idempotent via upsert)
    await this.prisma.userSkipRecord.upsert({
      where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: subMonth.id } },
      create: {
        userId,
        userEntryId: entry.id,
        subscriptionMonthId: subMonth.id,
        windowKey,
        skippedAt: now,
      },
      update: { windowKey, skippedAt: now, undoneAt: null },
    });

    // Update or create skip state
    const newWindow = windowKey !== state?.windowKey;
    const newState = await this.prisma.userSubscriptionSkipState.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId: subscription.id } },
      create: {
        userId,
        subscriptionId: subscription.id,
        windowKey,
        skipsInWindow: 1,
        consecutiveSkips: 1,
        totalSkips: 1,
        lastSkipAt: now,
      },
      update: {
        windowKey,
        skipsInWindow: newWindow ? 1 : { increment: 1 },
        consecutiveSkips: newConsecutive,
        totalSkips: { increment: 1 },
        lastSkipAt: now,
      },
    });

    // Also record firstSkipDate on entry if not set (needed for FROM_FIRST_SKIP window)
    if (!entry.firstSkipDate) {
      await this.prisma.userSubscriptionEntry.update({
        where: { id: entry.id },
        data: { firstSkipDate: now },
      });
    }

    // If prepaid subscription, extend the billing period by 1 month
    if (entry.prepaidMonths > 1) {
      await this.adjustPrepaidBillingPeriod(entry.id, 1, entry.effectiveRenewalDay ?? 1);
    }

    const deadline = this.computeDeadline(policy, entry, { year, month }, (subscription as any).renewalMonthOffset ?? 0);
    // Fetch fresh skip records after the new record was created
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    // Update persisted nextRenewalDate so cron jobs see the correct date
    await refreshNextRenewalDate(this.prisma, entry.id);
    this.scheduledReminders?.scheduleRenewal(entry.id).catch(() => {});
    return this.buildStatus(policy, newState, deadline, skippedMonths, { year, month });
  }

  /**
   * Returns the list of consecutive calendar months in the prepaid window starting at
   * (startYear, startMonth) for `count` months.
   */
  private prepaidWindowMonths(startYear: number, startMonth: number, count: number): Array<{ year: number; month: number }> {
    const months: Array<{ year: number; month: number }> = [];
    let y = startYear;
    let m = startMonth;
    for (let i = 0; i < count; i++) {
      months.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return months;
  }

  /**
   * Records a PREPAID_WINDOW_SKIP: creates skip records for ALL months in the upcoming
   * prepaid window (count = entry.prepaidMonths), advances the prepaid billing period by
   * prepaidMonths, and counts as a single skip against maxSkips.
   */
  private async recordPrepaidWindowSkip(
    userId: string,
    subscription: { id: string; renewalMonthOffset?: number },
    policy: any,
    state: { windowKey: string | null } | null,
    entry: { id: string; prepaidMonths: number; firstSkipDate: Date | null; effectiveRenewalDay: number | null; startDate: string | null },
    isCombo: boolean,
    componentIds: string[],
    monthsSubscriptionId: string,
    year: number,
    month: number,
  ): Promise<SkipStatus> {
    const windowKey = this.computeWindowKey(policy, state, entry as any);
    const now = new Date();
    const windowMonths = this.prepaidWindowMonths(year, month, entry.prepaidMonths);

    // Resolve DB subscriptionMonth records for each calendar slot; only existing months get records.
    for (const wm of windowMonths) {
      const subMonth = isCombo
        ? await this.prisma.subscriptionMonth.findFirst({
            where: { subscriptionId: { in: componentIds }, year: wm.year, month: wm.month },
            orderBy: { subscriptionId: 'asc' },
          })
        : await this.prisma.subscriptionMonth.findUnique({
            where: { subscriptionId_year_month: { subscriptionId: monthsSubscriptionId, year: wm.year, month: wm.month } },
          });
      if (!subMonth) continue;

      await this.prisma.userSkipRecord.upsert({
        where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: subMonth.id } },
        create: { userId, userEntryId: entry.id, subscriptionMonthId: subMonth.id, windowKey, skippedAt: now },
        update: { windowKey, skippedAt: now, undoneAt: null },
      });
    }

    // One window skip = one unit against the skip allowance.
    const newWindow = windowKey !== state?.windowKey;
    const newState = await this.prisma.userSubscriptionSkipState.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId: subscription.id } },
      create: {
        userId,
        subscriptionId: subscription.id,
        windowKey,
        skipsInWindow: 1,
        consecutiveSkips: 1,
        totalSkips: 1,
        lastSkipAt: now,
      },
      update: {
        windowKey,
        skipsInWindow: newWindow ? 1 : { increment: 1 },
        consecutiveSkips: { increment: 1 },
        totalSkips: { increment: 1 },
        lastSkipAt: now,
      },
    });

    if (!entry.firstSkipDate) {
      await this.prisma.userSubscriptionEntry.update({
        where: { id: entry.id },
        data: { firstSkipDate: now },
      });
    }

    // Advance the prepaid billing period by the whole window.
    await this.adjustPrepaidBillingPeriod(entry.id, entry.prepaidMonths, entry.effectiveRenewalDay ?? 1);

    const deadline = this.computeDeadline(policy, entry, { year, month }, (subscription as any).renewalMonthOffset ?? 0);
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    await refreshNextRenewalDate(this.prisma, entry.id);
    this.scheduledReminders?.scheduleRenewal(entry.id).catch(() => {});
    return this.buildStatus(policy, newState, deadline, skippedMonths, { year, month });
  }

  async undoSkip(
    userId: string,
    subscriptionSlug: string,
    year: number,
    month: number,
  ): Promise<SkipStatus> {
    const { subscription, policy, entry, isCombo, componentIds, monthsSubscriptionId } = await this.loadContext(userId, subscriptionSlug);

    if (!policy?.allowUnskip) {
      throw new ForbiddenException('Unskip is not allowed for this subscription');
    }

    // PREPAID_WINDOW_SKIP: undo reverses ALL months in the prepaid window and retracts
    // the billing period by the whole window.
    if (policy.type === 'PREPAID_WINDOW_SKIP' && entry.prepaidMonths > 1) {
      return this.undoPrepaidWindowSkip(
        userId, subscription, policy, entry, isCombo, componentIds, monthsSubscriptionId, year, month,
      );
    }

    // For combo subscriptions find the component month that was used when the skip was recorded.
    const subMonth = isCombo
      ? await this.prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: componentIds }, year, month },
          orderBy: { subscriptionId: 'asc' },
        })
      : await this.prisma.subscriptionMonth.findUnique({
          where: { subscriptionId_year_month: { subscriptionId: monthsSubscriptionId, year, month } },
        });
    if (!subMonth) throw new NotFoundException(`Month ${month}/${year} not found`);

    const record = await this.prisma.userSkipRecord.findUnique({
      where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: subMonth.id } },
    });
    if (!record || record.undoneAt) {
      throw new BadRequestException('No active skip found for this month');
    }

    await this.prisma.userSkipRecord.update({
      where: { id: record.id },
      data: { undoneAt: new Date() },
    });

    // Recompute state from scratch (simplest safe approach)
    const updatedState = await this.recomputeState(userId, subscription.id, policy);

    // If prepaid subscription, retract the billing period by 1 month
    if (entry.prepaidMonths > 1) {
      await this.adjustPrepaidBillingPeriod(entry.id, -1, entry.effectiveRenewalDay ?? 1);
    }

    const offset: number = (subscription as any).renewalMonthOffset ?? 0;
    const deadline = this.computeDeadline(policy, entry, { year, month }, offset);
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    // Update persisted nextRenewalDate so cron jobs see the correct date
    await refreshNextRenewalDate(this.prisma, entry.id);
    this.scheduledReminders?.scheduleRenewal(entry.id).catch(() => {});
    // Unskip deadline: most recent (latest) skipped month
    const latestSkipped = skippedMonths.length > 0
      ? skippedMonths.reduce((a, b) => (a.year > b.year || (a.year === b.year && a.month > b.month)) ? a : b)
      : null;
    const unskipDeadline = this.computeUnskipDeadline(policy, entry, latestSkipped, offset);
    return this.buildStatus(policy, updatedState, deadline, skippedMonths, { year, month }, undefined, null, unskipDeadline);
  }

  /**
   * Undoes a PREPAID_WINDOW_SKIP: soft-deletes skip records for ALL months in the
   * prepaid window and retracts the billing period by prepaidMonths.
   */
  private async undoPrepaidWindowSkip(
    userId: string,
    subscription: { id: string; renewalMonthOffset?: number },
    policy: any,
    entry: { id: string; prepaidMonths: number; effectiveRenewalDay: number | null },
    isCombo: boolean,
    componentIds: string[],
    monthsSubscriptionId: string,
    year: number,
    month: number,
  ): Promise<SkipStatus> {
    const windowMonths = this.prepaidWindowMonths(year, month, entry.prepaidMonths);
    const monthIds: string[] = [];
    for (const wm of windowMonths) {
      const subMonth = isCombo
        ? await this.prisma.subscriptionMonth.findFirst({
            where: { subscriptionId: { in: componentIds }, year: wm.year, month: wm.month },
            orderBy: { subscriptionId: 'asc' },
          })
        : await this.prisma.subscriptionMonth.findUnique({
            where: { subscriptionId_year_month: { subscriptionId: monthsSubscriptionId, year: wm.year, month: wm.month } },
          });
      if (subMonth) monthIds.push(subMonth.id);
    }

    const result = await this.prisma.userSkipRecord.updateMany({
      where: { userEntryId: entry.id, subscriptionMonthId: { in: monthIds }, undoneAt: null },
      data: { undoneAt: new Date() },
    });
    if (!result.count) {
      throw new BadRequestException('No active skip found for this window');
    }

    const updatedState = await this.recomputeState(userId, subscription.id, policy);

    // Retract the prepaid billing period by the whole window.
    await this.adjustPrepaidBillingPeriod(entry.id, -entry.prepaidMonths, entry.effectiveRenewalDay ?? 1);

    const offset: number = (subscription as any).renewalMonthOffset ?? 0;
    const deadline = this.computeDeadline(policy, entry, { year, month }, offset);
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    await refreshNextRenewalDate(this.prisma, entry.id);
    this.scheduledReminders?.scheduleRenewal(entry.id).catch(() => {});
    const latestSkipped = skippedMonths.length > 0
      ? skippedMonths.reduce((a, b) => (a.year > b.year || (a.year === b.year && a.month > b.month)) ? a : b)
      : null;
    const unskipDeadline = this.computeUnskipDeadline(policy, entry, latestSkipped, offset);
    return this.buildStatus(policy, updatedState, deadline, skippedMonths, { year, month }, undefined, null, unskipDeadline);
  }

  async recordSeriesSkip(userId: string, subscriptionSlug: string, seriesSlug: string): Promise<SkipStatus> {
    const { subscription, policy, state, entry } = await this.loadContext(userId, subscriptionSlug);

    if (!this.evaluateCanSkip(policy, state, entry.prepaidMonths)) {
      throw new ForbiddenException('Skip not allowed under current policy');
    }

    const series = await this.prisma.subscriptionSeries.findUnique({
      where: { slug: seriesSlug },
      include: { months: { orderBy: [{ year: 'asc' }, { month: 'asc' }] } },
    });
    if (!series) throw new NotFoundException(`Series '${seriesSlug}' not found`);
    if (series.subscriptionId !== subscription.id) {
      throw new BadRequestException('Series does not belong to this subscription');
    }
    if (series.months.length === 0) {
      throw new BadRequestException('Series has no months assigned');
    }
    if (series.skipMode === 'NO_SKIP') {
      throw new ForbiddenException(`Series "${series.name}" does not allow skips.`);
    }

    const windowKey = this.computeWindowKey(policy, state, entry);
    const now = new Date();
    const newWindow = windowKey !== state?.windowKey;

    // Series AS_ONE (or legacy SERIES_ONLY) = 1 skip; SERIES_AS_MANY = 1 skip per month
    const seriesSkipCost = series.skipMode === 'SERIES_AS_MANY' ? series.months.length : 1;

    // Create a skip record for every month in the series
    for (const m of series.months) {
      await this.prisma.userSkipRecord.upsert({
        where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: m.id } },
        create: {
          userId,
          userEntryId: entry.id,
          subscriptionMonthId: m.id,
          windowKey,
          skippedAt: now,
          seriesId: series.id,
        },
        update: { windowKey, skippedAt: now, undoneAt: null, seriesId: series.id },
      });
    }

    const newState = await this.prisma.userSubscriptionSkipState.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId: subscription.id } },
      create: {
        userId,
        subscriptionId: subscription.id,
        windowKey,
        skipsInWindow: seriesSkipCost,
        consecutiveSkips: state?.consecutiveSkips ?? 0,
        totalSkips: seriesSkipCost,
        lastSkipAt: now,
      },
      update: {
        windowKey,
        skipsInWindow: newWindow ? seriesSkipCost : { increment: seriesSkipCost },
        // consecutiveSkips intentionally not changed for series skips
        totalSkips: { increment: seriesSkipCost },
        lastSkipAt: now,
      },
    });

    if (!entry.firstSkipDate) {
      await this.prisma.userSubscriptionEntry.update({
        where: { id: entry.id },
        data: { firstSkipDate: now },
      });
    }

    const lastMonth = series.months[series.months.length - 1];
    const deadline = this.computeDeadline(policy, entry, lastMonth, (subscription as any).renewalMonthOffset ?? 0);
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    return this.buildStatus(policy, newState, deadline, skippedMonths, lastMonth ?? null);
  }

  async undoSeriesSkip(userId: string, subscriptionSlug: string, seriesSlug: string): Promise<SkipStatus> {
    const { subscription, policy, state, entry } = await this.loadContext(userId, subscriptionSlug);

    const series = await this.prisma.subscriptionSeries.findUnique({
      where: { slug: seriesSlug },
      include: { months: true },
    });
    if (!series) throw new NotFoundException(`Series '${seriesSlug}' not found`);

    // Soft-delete all active series skip records for this entry
    const monthIds = series.months.map((m) => m.id);
    await this.prisma.userSkipRecord.updateMany({
      where: {
        userEntryId: entry.id,
        subscriptionMonthId: { in: monthIds },
        seriesId: series.id,
        undoneAt: null,
      },
      data: { undoneAt: new Date() },
    });

    const updatedState = await this.recomputeState(userId, subscription.id, policy);

    const deadline = this.computeDeadline(policy, entry, null, (subscription as any).renewalMonthOffset ?? 0);
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    return this.buildStatus(policy, updatedState, deadline, skippedMonths);
  }

  /** Returns all active (not undone) skip records for the user with book/month details. */
  async getAllSkippedMonths(userId: string) {
    const records = await this.prisma.userSkipRecord.findMany({
      where: { userId, undoneAt: null },
      include: {
        month: {
          select: {
            year: true,
            month: true,
            theme: true,
            coverImageAsset: { select: { publicId: true } },
            coverImage: true,
            subscription: {
              select: {
                name: true,
                slug: true,
                coverImage: true,
                coverImageAsset: { select: { publicId: true } },
              },
            },
            books: {
              select: {
                book: {
                  select: {
                    title: true,
                    authors: { select: { author: { select: { name: true } } } },
                  },
                },
                edition: { select: { additionalImages: true } },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
      orderBy: [{ month: { year: 'desc' } }, { month: { month: 'desc' } }],
    });

    return records.map((r) => ({
      year: r.month.year,
      month: r.month.month,
      theme: r.month.theme,
      skippedAt: r.skippedAt,
      monthCoverImage: r.month.coverImageAsset?.publicId ?? r.month.coverImage ?? null,
      subscription: {
        name: r.month.subscription.name,
        slug: r.month.subscription.slug,
        coverImage: r.month.subscription.coverImageAsset?.publicId ?? r.month.subscription.coverImage ?? null,
      },
      books: r.month.books.map((mb) => ({
        title: mb.book.title,
        authors: mb.book.authors.map((a) => a.author.name).join(', '),
        coverImage: mb.edition?.additionalImages?.[0] ?? null,
      })),
    }));
  }

  /** Returns the first subscription month for this user (and its seriesId if it's part of a series).
   *  Used to block skipping the first box or first series.
   *  Falls back to the overall first month if entry.startDate is not set. */
  private async getFirstDeliverableMonthInfo(
    subscriptionId: string,
    startDate: string | null,
  ): Promise<{ firstMonthId: string; firstSeriesId: string | null; year: number; month: number } | null> {
    const dateFilter = startDate
      ? (() => {
          const [y, m] = startDate.split('-').map(Number);
          return { OR: [{ year: { gt: y } as const }, { year: y, month: { gte: m } }] };
        })()
      : {};
    const firstMonth = await this.prisma.subscriptionMonth.findFirst({
      where: { subscriptionId, ...dateFilter },
      select: { id: true, seriesId: true, year: true, month: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (!firstMonth) return null;
    return {
      firstMonthId: firstMonth.id,
      firstSeriesId: firstMonth.seriesId,
      year: firstMonth.year,
      month: firstMonth.month,
    };
  }

  /**
   * Selects the skip policy applicable to a user based on their billing type.
   * Prefers the exact billing-type policy (MONTHLY or PREPAID), then falls back
   * to the ALL policy, then null if no matching policy exists.
   */
  private selectApplicablePolicy<T extends { billingType: string; type: string }>(
    policies: T[],
    isPrepaid: boolean,
  ): T | null {
    const targetType = isPrepaid ? 'PREPAID' : 'MONTHLY';
    return (
      policies.find((p) => p.billingType === targetType) ??
      policies.find((p) => p.billingType === 'ALL') ??
      null
    );
  }

  private async loadContext(userId: string, subscriptionSlug: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug: subscriptionSlug },
      include: {
        skipPolicies: true,
        comboComponents: { select: { componentId: true } },
        userEntries: {
          where: { userId },
          take: 1,
          include: {
            skipRecords: {
              where: { undoneAt: null },
              include: { month: { select: { year: true, month: true } }, series: { select: { skipMode: true } } },
              orderBy: { skippedAt: 'asc' },
            },
          },
        },
      },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${subscriptionSlug}' not found`);

    const entry = subscription.userEntries[0] ?? null;
    if (!entry) throw new NotFoundException('You are not subscribed to this subscription');

    // Select the applicable policy for this user based on their billing type.
    const isPrepaid = (entry.prepaidMonths ?? 1) > 1;
    const policy = this.selectApplicablePolicy(subscription.skipPolicies ?? [], isPrepaid);

    // skipState keyed by (userId, subscriptionId) — fetch now that we have subscriptionId
    const state = await this.prisma.userSubscriptionSkipState.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: subscription.id } },
    });

    const skipRecords = entry.skipRecords;
    const effectiveRenewalDay = entry.renewalDay ?? subscription.renewalDay ?? null;
    const isCombo = (subscription as any).isCombo as boolean;
    const componentIds: string[] = subscription.comboComponents.map((c) => c.componentId);
    // For variant subs (parentSubscriptionId set), months live on the parent subscription.
    const monthsSubscriptionId: string = (subscription as any).parentSubscriptionId ?? subscription.id;

    return { subscription, policy, state, entry: { ...entry, effectiveRenewalDay }, skipRecords, isCombo, componentIds, monthsSubscriptionId };
  }

  private evaluateCanSkip(
    policy: { type: string; maxSkips: number | null; maxConsecutive: number | null } | null,
    state: { skipsInWindow: number; consecutiveSkips: number } | null,
    prepaidMonths?: number,
  ): boolean {
    if (!policy || policy.type === 'NONE') return false;

    if (policy.type === 'UNLIMITED') return true;

    const skipsInWindow = state?.skipsInWindow ?? 0;
    const consec = state?.consecutiveSkips ?? 0;

    if (policy.type === 'UNLIMITED_MAX_CONSEC') {
      return policy.maxConsecutive === null || consec < policy.maxConsecutive;
    }

    // PREPAID_WINDOW_SKIP: a single window skip counts as one unit against maxSkips.
    // Window-based policies (CALENDAR_YEAR, FROM_FIRST_SKIP, FROM_SUB_START) share this check.
    if (policy.maxSkips !== null && skipsInWindow >= policy.maxSkips) return false;
    return true;
  }

  private computeWindowKey(
    policy: { type: string; windowMonths: number | null } | null,
    state: { windowKey: string | null } | null,
    entry: { startDate: string | null; firstSkipDate: Date | null },
  ): string | null {
    if (!policy) return null;

    switch (policy.type) {
      case 'CALENDAR_YEAR':
        return String(new Date().getFullYear());

      case 'FROM_FIRST_SKIP': {
        // Prefer state.windowKey as the anchor (most accurate); fall back to firstSkipDate.
        // For combo entries, firstSkipDate is null but state.windowKey (or effectiveState.windowKey)
        // was derived during aggregation and must be used here.
        const anchorKey = state?.windowKey
          ?? (entry.firstSkipDate ? new Date(entry.firstSkipDate).toISOString().slice(0, 10) : null);
        if (anchorKey) {
          if (!policy.windowMonths) return anchorKey; // no expiry configured
          const windowStart = new Date(anchorKey);
          const windowEnd = new Date(windowStart);
          windowEnd.setMonth(windowEnd.getMonth() + policy.windowMonths);
          if (new Date() < windowEnd) return anchorKey; // still within window
          // Window has expired — start a new one from today
        }
        return new Date().toISOString().slice(0, 10);
      }

      case 'FROM_SUB_START': {
        const ref = entry.startDate ? new Date(entry.startDate) : new Date();
        if (!policy.windowMonths) return ref.toISOString().slice(0, 10);
        // Walk forward in windowMonths increments from subscription start to find the current window
        const today = new Date();
        let windowStart = new Date(ref);
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const windowEnd = new Date(windowStart);
          windowEnd.setMonth(windowEnd.getMonth() + policy.windowMonths);
          if (today < windowEnd) return windowStart.toISOString().slice(0, 10);
          windowStart = windowEnd;
        }
      }

      default:
        return null;
    }
  }

  private buildStatus(
    policy: {
      type: string;
      maxSkips: number | null;
      maxConsecutive: number | null;
      notes: string | null;
      skipHow: string | null;
      allowUnskip?: boolean;
      unskipHow?: string | null;
      unskipNotes?: string | null;
    } | null,
    state: {
      totalSkips: number;
      skipsInWindow: number;
      consecutiveSkips: number;
    } | null,
    deadline: Date | null = null,
    skippedMonths: { year: number; month: number }[] = [],
    deadlineMonth: { year: number; month: number } | null = null,
    /** Override canSkip to false (e.g. subscription not yet started) */
    forceCanSkip?: boolean,
    firstDeliverableMonth: { year: number; month: number } | null = null,
    unskipDeadline: Date | null = null,
    prepaidMonths?: number,
  ): SkipStatus {
    const policyType = policy?.type ?? 'NONE';
    const totalSkips = state?.totalSkips ?? 0;
    const skipsInWindow = state?.skipsInWindow ?? 0;
    const consecutiveSkips = state?.consecutiveSkips ?? 0;
    const maxSkips = policy?.maxSkips ?? null;
    const maxConsecutive = policy?.maxConsecutive ?? null;
    const isPastDeadline = deadline ? new Date() > deadline : false;
    // canSkip = false if no valid target month exists (nothing to skip), or forced false, or policy disallows
    const canSkip = forceCanSkip !== undefined
      ? forceCanSkip
      : (deadlineMonth !== null && this.evaluateCanSkip(policy, state, prepaidMonths));
    const warnings = this.computeWarnings(policyType, skipsInWindow, maxSkips, consecutiveSkips, maxConsecutive);

    if (isPastDeadline && policyType !== 'NONE') {
      const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const monthLabel = deadlineMonth
        ? `${MONTHS[deadlineMonth.month - 1]} ${deadlineMonth.year}`
        : 'this period';
      warnings.unshift(`The skip deadline for ${monthLabel} has passed — recording for tracking purposes.`);
    }

    return {
      policyType,
      totalSkips,
      skipsInWindow,
      consecutiveSkips,
      maxSkips,
      maxConsecutive,
      canSkip,
      warnings,
      notes: policy?.notes ?? null,
      skipHow: policy?.skipHow ?? null,
      nextDeadline: deadline ? deadline.toISOString() : null,
      isPastDeadline,
      skippedMonths,
      firstDeliverableMonth,
      allowUnskip: policy?.allowUnskip ?? false,
      unskipHow: policy?.unskipHow ?? null,
      unskipNotes: policy?.unskipNotes ?? null,
      nextUnskipDeadline: unskipDeadline ? unskipDeadline.toISOString() : null,
      isUnskipPastDeadline: unskipDeadline ? new Date() > unskipDeadline : false,
      targetMonth: deadlineMonth,
    };
  }

  /**
   * Pure: given the current date, renewal day, and month offset, returns
   * the earliest candidate box month the user can skip, plus whether the
   * current month's skip window has already passed.
   *
   * Rules:
   * - If renewalDay is set and today < renewalDay → window still open → candidate = currentMonth + offset
   * - Otherwise → window closed (or no renewalDay) → candidate = nextMonth + offset
   * - currentMonthSkipPassed is true only when renewalDay is set AND today >= renewalDay
   */
  private computeSkipCandidate(
    now: Date,
    renewalDay: number | null,
    offset: number,
  ): { candidateYear: number; candidateMonth: number; currentMonthSkipPassed: boolean } {
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const nextCalendarMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextCalendarYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    const currentMonthWindowOpen = !!renewalDay && now.getDate() < renewalDay;
    const currentMonthSkipPassed = !!renewalDay && !currentMonthWindowOpen;

    let candidateMonth = (currentMonthWindowOpen ? currentMonth : nextCalendarMonth) + offset;
    let candidateYear = currentMonthWindowOpen ? currentYear : nextCalendarYear;
    while (candidateMonth > 12) { candidateMonth -= 12; candidateYear++; }

    return { candidateYear, candidateMonth, currentMonthSkipPassed };
  }

  /**
   * Computes the skip deadline for a given box month.
   * Deadline = renewalDay of the RENEWAL month (box month - offset), minus `skipDeadlineDaysBefore` days.
   */
  private computeDeadline(
    policy: { skipDeadlineDaysBefore: number } | null,
    entry: { effectiveRenewalDay: number | null },
    targetMonth: { year: number; month: number } | null,
    renewalMonthOffset = 0,
  ): Date | null {
    if (!policy || !targetMonth) return null;

    const renewalDay = entry.effectiveRenewalDay;
    if (!renewalDay) return null; // No renewal day configured → no deadline

    const daysBefore = policy.skipDeadlineDaysBefore ?? 0;

    // Convert box month → renewal month (deadline is when the renewal charge happens)
    const [renewalYear, renewalMonth] = renewalMonthFromBoxMonth(
      targetMonth.year, targetMonth.month, renewalMonthOffset,
    );

    // Renewal date for the target renewal month (end of that day)
    const renewal = new Date(renewalYear, renewalMonth - 1, renewalDay, 23, 59, 59, 999);

    // Subtract daysBefore
    if (daysBefore > 0) {
      renewal.setDate(renewal.getDate() - daysBefore);
    }

    return renewal;
  }

  /**
   * Computes the unskip deadline for a given skipped month (the most recent skip).
   * Uses unskipDeadlineDaysBefore from policy (same logic as computeDeadline).
   */
  private computeUnskipDeadline(
    policy: { unskipDeadlineDaysBefore?: number } | null,
    entry: { effectiveRenewalDay: number | null },
    targetMonth: { year: number; month: number } | null,
    renewalMonthOffset = 0,
  ): Date | null {
    if (!policy || !targetMonth) return null;

    const renewalDay = entry.effectiveRenewalDay;
    if (!renewalDay) return null;

    const daysBefore = policy.unskipDeadlineDaysBefore ?? 0;

    const [renewalYear, renewalMonth] = renewalMonthFromBoxMonth(
      targetMonth.year, targetMonth.month, renewalMonthOffset,
    );

    const renewal = new Date(renewalYear, renewalMonth - 1, renewalDay, 23, 59, 59, 999);

    if (daysBefore > 0) {
      renewal.setDate(renewal.getDate() - daysBefore);
    }

    return renewal;
  }

  private computeWarnings(
    policyType: string,
    skipsInWindow: number,
    maxSkips: number | null,
    consecutiveSkips: number,
    maxConsecutive: number | null,
  ): string[] {
    const warnings: string[] = [];

    if (maxSkips !== null) {
      const remaining = maxSkips - skipsInWindow;
      if (remaining === 1) {
        warnings.push(`You have 1 skip remaining in this period. Using it will exhaust your allowance.`);
      } else if (remaining <= 0) {
        warnings.push(`You have used all ${maxSkips} skips allowed in this period.`);
      }
    }

    if (policyType === 'UNLIMITED_MAX_CONSEC' && maxConsecutive !== null) {
      const remaining = maxConsecutive - consecutiveSkips;
      if (remaining === 1) {
        warnings.push(`Warning: one more consecutive skip will cancel your subscription.`);
      } else if (remaining <= 0) {
        warnings.push(`You have exceeded the maximum consecutive skips. Your subscription may be cancelled.`);
      }
    }

    return warnings;
  }

  /**
   * For prepaid subscriptions: shifts the end of the latest billing period by `months`.
   * Also shifts nextRenewalDate on the entry accordingly.
   * months > 0 → skip recorded (period extends)
   * months < 0 → skip undone  (period retracts)
   * For a regular monthly skip on a prepaid entry, months = ±1.
   * For a PREPAID_WINDOW_SKIP, months = ±entry.prepaidMonths.
   */
  private async adjustPrepaidBillingPeriod(
    entryId: string,
    months: number,
    renewalDay: number,
  ): Promise<void> {
    if (months === 0) return;
    // Find the most recent billing period that has a coveredTo range
    const period = await this.prisma.userSubBillingPeriod.findFirst({
      where: { entryId, coveredToMonth: { not: null }, coveredToYear: { not: null } },
      orderBy: [{ coveredToYear: 'desc' }, { coveredToMonth: 'desc' }],
    });

    if (!period?.coveredToMonth || !period?.coveredToYear) return;

    // Compute new end month
    const d = new Date(period.coveredToYear, period.coveredToMonth - 1);
    d.setMonth(d.getMonth() + months);
    const newCoveredToMonth = d.getMonth() + 1;
    const newCoveredToYear = d.getFullYear();

    await this.prisma.userSubBillingPeriod.update({
      where: { id: period.id },
      data: { coveredToMonth: newCoveredToMonth, coveredToYear: newCoveredToYear },
    });

    // Shift nextRenewalDate on the entry
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { id: entryId },
      select: { nextRenewalDate: true },
    });

    let newRenewal: Date;
    if (entry?.nextRenewalDate) {
      newRenewal = new Date(entry.nextRenewalDate);
      newRenewal.setMonth(newRenewal.getMonth() + months);
    } else {
      // Derive from billing period end: renewal is on renewalDay of the month after the period ends
      newRenewal = new Date(newCoveredToYear, newCoveredToMonth, renewalDay);
    }

    await this.prisma.userSubscriptionEntry.update({
      where: { id: entryId },
      data: { nextRenewalDate: newRenewal },
    });
  }

  /**
   * Computes the consecutive skip count for the skip being recorded right now.
   * Checks if the month immediately before (year, month) was already skipped.
   * If yes → current consecutive + 1. If no → 1 (new streak starts).
   * For combo subscriptions pass componentIds; the prev month is looked up across component subscriptions.
   */
  private async computeNewConsecutive(
    entryId: string,
    subscriptionId: string,
    year: number,
    month: number,
    state: { consecutiveSkips: number } | null,
    componentIds: string[] | null = null,
  ): Promise<number> {
    // Compute previous month
    const prevDate = new Date(year, month - 2); // month is 1-based, so month-2 = prev month as 0-based
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;

    const prevSubMonth = componentIds?.length
      ? await this.prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: componentIds }, year: prevYear, month: prevMonth },
          orderBy: { subscriptionId: 'asc' },
        })
      : await this.prisma.subscriptionMonth.findUnique({
          where: { subscriptionId_year_month: { subscriptionId, year: prevYear, month: prevMonth } },
        });

    if (!prevSubMonth) return 1; // No prev month record → new streak

    const prevSkip = await this.prisma.userSkipRecord.findUnique({
      where: { userEntryId_subscriptionMonthId: { userEntryId: entryId, subscriptionMonthId: prevSubMonth.id } },
    });

    if (prevSkip && !prevSkip.undoneAt) {
      return (state?.consecutiveSkips ?? 0) + 1;
    }
    return 1;
  }

  private async recomputeState(
    userId: string,
    subscriptionId: string,
    policy: { type: string; windowMonths: number | null } | null,
  ) {
    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId, active: true },
    });

    // No active entry (e.g. cancelled/historical subscription) — skip state is not applicable
    if (!entry) return null;

    const allRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: {
        month: { select: { year: true, month: true } },
        series: { select: { skipMode: true } },
      },
      orderBy: { skippedAt: 'asc' },
    });

    // Compute logical skip count:
    // SERIES_AS_ONE (and legacy SERIES_ONLY) → all records for same seriesId = 1 skip
    // SERIES_AS_MANY / individual (no seriesId) → each record = 1 skip
    const countLogicalSkips = (records: typeof allRecords): number => {
      const seenSeriesAsOne = new Set<string>();
      let count = 0;
      for (const r of records) {
        if (r.seriesId && (r.series?.skipMode === 'SERIES_AS_ONE' || r.series?.skipMode === 'SERIES_ONLY')) {
          if (!seenSeriesAsOne.has(r.seriesId)) {
            seenSeriesAsOne.add(r.seriesId);
            count++;
          }
        } else {
          count++;
        }
      }
      return count;
    };

    const total = countLogicalSkips(allRecords);
    if (total === 0) {
      return this.prisma.userSubscriptionSkipState.upsert({
        where: { userId_subscriptionId: { userId, subscriptionId } },
        create: { userId, subscriptionId, skipsInWindow: 0, consecutiveSkips: 0, totalSkips: 0, windowKey: null },
        update: { skipsInWindow: 0, consecutiveSkips: 0, totalSkips: 0, lastSkipAt: null, windowKey: null },
      });
    }

    // Sort by actual subscription month (year, month) ascending
    allRecords.sort((a, b) => {
      if (!a.month || !b.month) return 0;
      if (a.month.year !== b.month.year) return a.month.year - b.month.year;
      return a.month.month - b.month.month;
    });

    // Recount window skips based on the latest window key
    const latestWindowKey = allRecords[allRecords.length - 1].windowKey;
    const windowRecords = allRecords.filter((r) => r.windowKey === latestWindowKey);
    const skipsInWindow = countLogicalSkips(windowRecords);

    // Recount consecutive: walk backward from most recent, count adjacent months
    let consecutive = 1;
    for (let i = allRecords.length - 2; i >= 0; i--) {
      const curr = allRecords[i + 1].month; // more recent
      const prev = allRecords[i].month;     // less recent
      if (!curr || !prev) break;

      const expectedPrevYear = curr.month === 1 ? curr.year - 1 : curr.year;
      const expectedPrevMonth = curr.month === 1 ? 12 : curr.month - 1;

      if (prev.year === expectedPrevYear && prev.month === expectedPrevMonth) {
        consecutive++;
      } else {
        break;
      }
    }

    return this.prisma.userSubscriptionSkipState.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId } },
      create: { userId, subscriptionId, skipsInWindow, consecutiveSkips: consecutive, totalSkips: total, windowKey: latestWindowKey },
      update: {
        skipsInWindow,
        consecutiveSkips: consecutive,
        totalSkips: total,
        lastSkipAt: allRecords[allRecords.length - 1].skippedAt,
        windowKey: latestWindowKey,
      },
    });
  }
}
