import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
  /** ISO date string of skip deadline for the next upcoming month, or null if no deadline */
  nextDeadline: string | null;
  isPastDeadline: boolean;
  /** Months the user has already skipped (active, not undone) */
  skippedMonths: { year: number; month: number }[];
}

@Injectable()
export class SkipPolicyEngine {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ────────────────────────────────────────────────────

  async getStatus(userId: string, subscriptionSlug: string): Promise<SkipStatus> {
    const { subscription, policy, state, entry, skipRecords } = await this.loadContext(userId, subscriptionSlug);
    // Find next upcoming month for deadline calculation
    const now = new Date();
    const upcomingMonth = await this.prisma.subscriptionMonth.findFirst({
      where: {
        subscriptionId: subscription.id,
        OR: [
          { year: { gt: now.getFullYear() } },
          { year: now.getFullYear(), month: { gte: now.getMonth() + 1 } },
        ],
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    const deadline = this.computeDeadline(policy, entry, upcomingMonth ?? null);
    const skippedMonths = skipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    return this.buildStatus(policy, state, deadline, skippedMonths);
  }

  async canSkipCheck(userId: string, subscriptionSlug: string): Promise<boolean> {
    const { policy, state } = await this.loadContext(userId, subscriptionSlug);
    return this.evaluateCanSkip(policy, state);
  }

  /** Public entry point for recomputing skip state after bulk operations (e.g. backfill) */
  async recomputeSkipState(userId: string, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { skipPolicy: true },
    });
    return this.recomputeState(userId, subscriptionId, subscription?.skipPolicy ?? null);
  }

  async recordSkip(
    userId: string,
    subscriptionSlug: string,
    year: number,
    month: number,
  ): Promise<SkipStatus> {
    const { subscription, policy, state, entry } = await this.loadContext(userId, subscriptionSlug);
    if (!this.evaluateCanSkip(policy, state)) {
      throw new ForbiddenException('Skip not allowed under current policy');
    }

    // Deadline is informational only — we allow late tracking (user may have skipped on time but forgot to log it here)

    // Find the subscription month
    const subMonth = await this.prisma.subscriptionMonth.findUnique({
      where: { subscriptionId_year_month: { subscriptionId: subscription.id, year, month } },
      include: { series: true },
    });
    if (!subMonth) {
      throw new NotFoundException(`Month ${month}/${year} not found for this subscription`);
    }

    // If month belongs to a SERIES_ONLY series, require using the series skip endpoint
    if (subMonth.series && subMonth.series.skipMode === 'SERIES_ONLY') {
      throw new BadRequestException(
        `Month ${month}/${year} belongs to series "${subMonth.series.name}" (skip mode: SERIES_ONLY). Use the series skip endpoint instead.`,
      );
    }

    const windowKey = this.computeWindowKey(policy, state, entry);
    const now = new Date();

    // Check if the previous month was also skipped (for consecutive counting)
    const newConsecutive = await this.computeNewConsecutive(entry.id, subscription.id, year, month, state);

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

    await this.notifyIfNeeded(userId, subscription.id, policy, newState);

    // If prepaid subscription, extend the billing period by 1 month
    if (entry.prepaidMonths > 1) {
      await this.adjustPrepaidBillingPeriod(entry.id, 1, entry.effectiveRenewalDay ?? 1);
    }

    const deadline = this.computeDeadline(policy, entry, { year, month });
    // Fetch fresh skip records after the new record was created
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    return this.buildStatus(policy, newState, deadline, skippedMonths);
  }

  async undoSkip(
    userId: string,
    subscriptionSlug: string,
    year: number,
    month: number,
  ): Promise<SkipStatus> {
    // TODO: Implement reversal policy (time window, per-subscription config)
    const { subscription, policy, state, entry } = await this.loadContext(userId, subscriptionSlug);

    const subMonth = await this.prisma.subscriptionMonth.findUnique({
      where: { subscriptionId_year_month: { subscriptionId: subscription.id, year, month } },
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

    const deadline = this.computeDeadline(policy, entry, { year, month });
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    return this.buildStatus(policy, updatedState, deadline, skippedMonths);
  }

  async recordSeriesSkip(userId: string, subscriptionSlug: string, seriesSlug: string): Promise<SkipStatus> {
    const { subscription, policy, state, entry } = await this.loadContext(userId, subscriptionSlug);

    if (!this.evaluateCanSkip(policy, state)) {
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

    const windowKey = this.computeWindowKey(policy, state, entry);
    const now = new Date();
    const newWindow = windowKey !== state?.windowKey;

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

    // Series counts as 1 skip in window — consecutiveSkips unchanged for SERIES_ONLY
    const newState = await this.prisma.userSubscriptionSkipState.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId: subscription.id } },
      create: {
        userId,
        subscriptionId: subscription.id,
        windowKey,
        skipsInWindow: 1,
        consecutiveSkips: state?.consecutiveSkips ?? 0,
        totalSkips: 1,
        lastSkipAt: now,
      },
      update: {
        windowKey,
        skipsInWindow: newWindow ? 1 : { increment: 1 },
        // consecutiveSkips intentionally not changed for SERIES_ONLY
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

    await this.notifyIfNeeded(userId, subscription.id, policy, newState);

    const lastMonth = series.months[series.months.length - 1];
    const deadline = this.computeDeadline(policy, entry, lastMonth);
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    return this.buildStatus(policy, newState, deadline, skippedMonths);
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

    const deadline = this.computeDeadline(policy, entry, null);
    const freshSkipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });
    const skippedMonths = freshSkipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));
    return this.buildStatus(policy, updatedState, deadline, skippedMonths);
  }



  private async loadContext(userId: string, subscriptionSlug: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug: subscriptionSlug },
      include: { skipPolicy: true },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${subscriptionSlug}' not found`);

    const policy = subscription.skipPolicy;

    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: subscription.id } },
    });
    if (!entry) throw new NotFoundException('You are not subscribed to this subscription');

    const state = await this.prisma.userSubscriptionSkipState.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: subscription.id } },
    });

    // Effective renewal day: user entry's renewalDay if set, else subscription's default
    const effectiveRenewalDay = entry.renewalDay ?? subscription.renewalDay ?? null;

    const skipRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
    });

    return { subscription, policy, state, entry: { ...entry, effectiveRenewalDay }, skipRecords };
  }

  private evaluateCanSkip(
    policy: { type: string; maxSkips: number | null; maxConsecutive: number | null } | null,
    state: { skipsInWindow: number; consecutiveSkips: number } | null,
  ): boolean {
    if (!policy || policy.type === 'NONE') return false;
    if (policy.type === 'UNLIMITED') return true;

    const skipsInWindow = state?.skipsInWindow ?? 0;
    const consec = state?.consecutiveSkips ?? 0;

    if (policy.type === 'UNLIMITED_MAX_CONSEC') {
      return policy.maxConsecutive === null || consec < policy.maxConsecutive;
    }

    // Window-based policies: CALENDAR_YEAR, FROM_FIRST_SKIP, FROM_SUB_START
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
        if (entry.firstSkipDate) {
          // Keep existing window until it expires
          if (state?.windowKey) return state.windowKey;
        }
        // Start new window from today
        return new Date().toISOString().slice(0, 10);
      }

      case 'FROM_SUB_START': {
        const ref = entry.startDate
          ? new Date(entry.startDate)
          : new Date();
        return ref.toISOString().slice(0, 10);
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
    } | null,
    state: {
      totalSkips: number;
      skipsInWindow: number;
      consecutiveSkips: number;
    } | null,
    deadline: Date | null = null,
    skippedMonths: { year: number; month: number }[] = [],
  ): SkipStatus {
    const policyType = policy?.type ?? 'NONE';
    const totalSkips = state?.totalSkips ?? 0;
    const skipsInWindow = state?.skipsInWindow ?? 0;
    const consecutiveSkips = state?.consecutiveSkips ?? 0;
    const maxSkips = policy?.maxSkips ?? null;
    const maxConsecutive = policy?.maxConsecutive ?? null;
    const isPastDeadline = deadline ? new Date() > deadline : false;
    // Deadline is informational — does not block canSkip (app is for tracking, user may log late)
    const canSkip = this.evaluateCanSkip(policy, state);
    const warnings = this.computeWarnings(policyType, skipsInWindow, maxSkips, consecutiveSkips, maxConsecutive);

    if (isPastDeadline && policyType !== 'NONE') {
      warnings.unshift('The skip deadline for this period has passed — recording for tracking purposes.');
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
      nextDeadline: deadline ? deadline.toISOString() : null,
      isPastDeadline,
      skippedMonths,
    };
  }

  /**
   * Computes the skip deadline for a given month.
   * Deadline = day `renewalDay` of that month, minus `skipDeadlineDaysBefore` days.
   * Uses the effective renewal day (entry's or subscription's default).
   */
  private computeDeadline(
    policy: { skipDeadlineDaysBefore: number } | null,
    entry: { effectiveRenewalDay: number | null },
    targetMonth: { year: number; month: number } | null,
  ): Date | null {
    if (!policy || !targetMonth) return null;

    const renewalDay = entry.effectiveRenewalDay;
    if (!renewalDay) return null; // No renewal day configured → no deadline

    const daysBefore = policy.skipDeadlineDaysBefore ?? 0;

    // Renewal date for the target month (end of that day)
    const renewal = new Date(targetMonth.year, targetMonth.month - 1, renewalDay, 23, 59, 59, 999);

    // Subtract daysBefore
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

  private async notifyIfNeeded(
    userId: string,
    subscriptionId: string,
    policy: { type: string; maxSkips: number | null; maxConsecutive: number | null; notes: string | null } | null,
    state: { skipsInWindow: number; consecutiveSkips: number },
  ) {
    if (!policy) return;
    const warnings = this.computeWarnings(
      policy.type,
      state.skipsInWindow,
      policy.maxSkips,
      state.consecutiveSkips,
      policy.maxConsecutive,
    );
    if (!warnings.length) return;

    await this.prisma.userNotification.create({
      data: {
        userId,
        type: 'SKIP_WARNING',
        title: 'Skip limit warning',
        body: warnings.join(' '),
        payload: { subscriptionId, warnings },
      },
    });
  }

  /**
   * For prepaid subscriptions: shifts the end of the latest billing period by +1 or -1 month.
   * Also shifts nextRenewalDate on the entry accordingly.
   * direction = 1  → skip recorded (period extends)
   * direction = -1 → skip undone  (period retracts)
   */
  private async adjustPrepaidBillingPeriod(
    entryId: string,
    direction: 1 | -1,
    renewalDay: number,
  ): Promise<void> {
    // Find the most recent billing period that has a coveredTo range
    const period = await this.prisma.userSubBillingPeriod.findFirst({
      where: { entryId, coveredToMonth: { not: null }, coveredToYear: { not: null } },
      orderBy: [{ coveredToYear: 'desc' }, { coveredToMonth: 'desc' }],
    });

    if (!period?.coveredToMonth || !period?.coveredToYear) return;

    // Compute new end month
    const d = new Date(period.coveredToYear, period.coveredToMonth - 1);
    d.setMonth(d.getMonth() + direction);
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
      newRenewal.setMonth(newRenewal.getMonth() + direction);
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
   */
  private async computeNewConsecutive(
    entryId: string,
    subscriptionId: string,
    year: number,
    month: number,
    state: { consecutiveSkips: number } | null,
  ): Promise<number> {
    // Compute previous month
    const prevDate = new Date(year, month - 2); // month is 1-based, so month-2 = prev month as 0-based
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;

    const prevSubMonth = await this.prisma.subscriptionMonth.findUnique({
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
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId } },
    });

    const allRecords = await this.prisma.userSkipRecord.findMany({
      where: { userEntryId: entry!.id, undoneAt: null },
      include: { month: { select: { year: true, month: true } } },
      orderBy: { skippedAt: 'asc' },
    });

    const total = allRecords.length;
    if (total === 0) {
      return this.prisma.userSubscriptionSkipState.upsert({
        where: { userId_subscriptionId: { userId, subscriptionId } },
        create: { userId, subscriptionId, skipsInWindow: 0, consecutiveSkips: 0, totalSkips: 0 },
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
    const skipsInWindow = allRecords.filter((r) => r.windowKey === latestWindowKey).length;

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
      create: { userId, subscriptionId, skipsInWindow, consecutiveSkips: consecutive, totalSkips: total },
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
