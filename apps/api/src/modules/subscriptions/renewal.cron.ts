import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { $Enums, FeeCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { refreshNextRenewalDate, renewalMonthFromBoxMonth } from '../../common/utils/renewal-date.util';
import { resolveEffectiveBasePrice, parseFirstBilledYearMonth } from './price-change.util';
import { resolveEffectivePrepayOption, PrepayOptionCandidate } from './prepay-option.util';
import { recordOwnershipHistory } from '../../common/utils/ownership-history.util';
import { StatsService } from '../stats/stats.service';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveMonthBooksForEntry, computeChoiceDeadline, persistMonthChoice, materializeChoiceGroupBooks } from './subscription-month-choice.util';

@Injectable()
export class RenewalCronService {
  private readonly logger = new Logger(RenewalCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
    @Optional() private readonly scheduledReminders?: ScheduledRemindersService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Daily at 00:01 UTC — finds all active subscription entries whose
   * nextRenewalDate has passed and processes them:
   *  1. Records the renewal (idempotent).
   *  2. Adds all books for that subscription month to the user's collection
   *     with ownershipStatus='PREORDER', unless the user skipped the month.
   *  3. Advances nextRenewalDate to the next due date.
   */
  @Cron('1 0 * * *')
  async processRenewals() {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    this.logger.log(`[RenewalCron] Running — cutoff: ${todayStart.toISOString()}`);

    const dueEntries = await this.prisma.userSubscriptionEntry.findMany({
      where: {
        active: true,
        nextRenewalDate: { lte: todayStart },
      },
      select: {
        id: true,
        userId: true,
        subscriptionId: true,
        costCurrency: true,
        basePrice: true,
        shippingCost: true,
        nextRenewalDate: true,
        prepaidMonths: true,
        startDate: true,
        scheduledPrepayOptionId: true,
        scheduledPrepayOption: { select: { id: true, months: true, price: true, currency: true } },
        subscription: {
          select: {
            renewalMonthOffset: true,
            isBundleSubscription: true,
            intervalMonths: true,
            prepayOptions: { select: { id: true, months: true, currency: true, price: true, validFrom: true, validUntil: true, grandfatheredPrice: true } },
          },
        },
      },
    });

    this.logger.log(`[RenewalCron] ${dueEntries.length} entry/entries due for renewal`);

    for (const entry of dueEntries) {
      try {
        await this.processOneRenewal(entry);
      } catch (err: any) {
        this.logger.error(`[RenewalCron] Failed for entry ${entry.id}: ${err?.message}`);
      }
    }
  }

  private async processOneRenewal(entry: {
    id: string;
    userId: string;
    subscriptionId: string;
    costCurrency: string | null;
    basePrice: { toString(): string } | null;
    shippingCost: { toString(): string } | null;
    nextRenewalDate: Date | null;
    prepaidMonths?: number;
    startDate?: string | null;
    scheduledPrepayOptionId: string | null;
    scheduledPrepayOption: { id: string; months: number; price: { toString(): string }; currency: string } | null;
    subscription: {
      renewalMonthOffset: number;
      isBundleSubscription: boolean;
      intervalMonths: number;
      prepayOptions?: PrepayOptionCandidate[];
    } | null;
  }) {
    const renewalDate = entry.nextRenewalDate!;
    const offset = entry.subscription?.renewalMonthOffset ?? 0;
    // Box month = renewal month + offset (e.g. April renewal + 1 = May box)
    const [year, month] = (() => {
      let m = renewalDate.getUTCMonth() + 1 + offset;
      let y = renewalDate.getUTCFullYear();
      while (m > 12) { m -= 12; y++; }
      while (m < 1)  { m += 12; y--; }
      return [y, m] as [number, number];
    })();

    // Idempotency: if we already recorded this exact renewal date → skip book-add
    // (nextRenewalDate might not have advanced yet if the API was down)
    const existing = await this.prisma.userSubscriptionRenewal.findUnique({
      where: { entryId_renewalDate: { entryId: entry.id, renewalDate } },
    });

    // PREPAID_WINDOW_SKIP: if the entire upcoming prepaid window is skipped, do NOT create
    // PREORDER entries for those months; advance nextRenewalDate by the whole window instead.
    if (!existing && await this.isPrepaidWindowFullySkipped(entry, year, month)) {
      await this.advanceRenewalByMonths(entry.id, entry.prepaidMonths ?? 1);
      this.scheduledReminders?.scheduleRenewal(entry.id).catch(() => {});
      return;
    }

    if (!existing) {
      await this.prisma.userSubscriptionRenewal.create({
        data: { userId: entry.userId, entryId: entry.id, renewalDate, source: 'cron' },
      });

      // Ensure a prepay billing period exists when the entry has a scheduled prepay option.
      // This creates (or reuses) a billing period covering N months at the prepaid price/currency.
      // Bundle subscriptions are not supported for prepay billing periods.
      if (entry.scheduledPrepayOption && !entry.subscription?.isBundleSubscription) {
        // Resolve the CURRENT price fresh instead of trusting entry.scheduledPrepayOption.price —
        // that FK is never updated after the initial selection, so it would otherwise keep
        // charging the price from whenever the user last chose their billing mode forever. The
        // resolver correctly rolls a non-grandfathered price change in at the next renewal while
        // keeping a grandfathered subscriber (entry.startDate predates the change) on their old
        // price — see prepay-option.util.ts. ensurePrepayBillingPeriod only actually creates a
        // new billing period at a window boundary (an existing period covering this month is
        // reused untouched with its already-frozen price), so this never changes anything
        // mid-cycle.
        const resolvedOption = resolveEffectivePrepayOption(
          entry.subscription?.prepayOptions ?? [],
          entry.prepaidMonths ?? entry.scheduledPrepayOption.months,
          entry.scheduledPrepayOption.currency,
          renewalDate,
          entry.startDate,
        );
        if (resolvedOption) {
          await this.ensurePrepayBillingPeriod(entry.id, year, month, renewalDate, resolvedOption);
        } else {
          // All prepay options for this months/currency are gone (fully discontinued) — fall
          // the entry back to standard monthly billing rather than leave it stuck. Clearing the
          // FK too (not just prepaidMonths) so future renewals skip this branch entirely instead
          // of re-resolving to null every month.
          await this.prisma.userSubscriptionEntry.update({
            where: { id: entry.id },
            data: { prepaidMonths: 1, scheduledPrepayOptionId: null },
          });
        }
      }

      if (entry.subscription?.isBundleSubscription) {
        await this.addBooksForBundleMonths(entry, year, month, entry.subscription.intervalMonths, renewalDate);
      } else {
        await this.addBooksForSubscriptionMonth(entry, year, month, renewalDate);
      }

      // Books were added — invalidate stats cache for this user so the next read triggers a recompute.
      this.statsService.markStatsStale(entry.userId, [new Date().getFullYear()]);
    }

    // Always advance nextRenewalDate (safe if already advanced)
    await refreshNextRenewalDate(this.prisma, entry.id);
    // Schedule next renewal reminder
    this.scheduledReminders?.scheduleRenewal(entry.id).catch(() => {});
  }

  /**
   * Returns true when this entry is a prepaid subscription governed by a PREPAID_WINDOW_SKIP
   * policy AND every subscription month in the upcoming prepaid window (starting at the given
   * box month, spanning prepaidMonths months) has an active skip record.
   */
  private async isPrepaidWindowFullySkipped(
    entry: { id: string; subscriptionId: string; prepaidMonths?: number },
    year: number,
    month: number,
  ): Promise<boolean> {
    const prepaidMonths = entry.prepaidMonths ?? 1;
    if (prepaidMonths <= 1) return false;

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: entry.subscriptionId },
      select: {
        parentSubscriptionId: true,
        isCombo: true,
        comboComponents: { select: { componentId: true } },
        skipPolicies: { select: { billingType: true, type: true } },
      },
    });
    if (!subscription) return false;

    // Select the applicable policy for a prepaid entry (PREPAID → ALL fallback).
    const policies = subscription.skipPolicies ?? [];
    const policy =
      policies.find((p) => p.billingType === 'PREPAID') ??
      policies.find((p) => p.billingType === 'ALL') ??
      null;
    if (!policy || policy.type !== 'PREPAID_WINDOW_SKIP') return false;

    const isCombo = subscription.isCombo;
    const componentIds = subscription.comboComponents.map((c) => c.componentId);
    const monthsSubscriptionId = subscription.parentSubscriptionId ?? entry.subscriptionId;

    // Every calendar month in the window must have an active skip record (for months that exist).
    let y = year;
    let m = month;
    let existingMonthsChecked = 0;
    for (let i = 0; i < prepaidMonths; i++) {
      const subMonth = isCombo
        ? await this.prisma.subscriptionMonth.findFirst({
            where: { subscriptionId: { in: componentIds }, year: y, month: m },
            orderBy: { subscriptionId: 'asc' },
          })
        : await this.prisma.subscriptionMonth.findUnique({
            where: { subscriptionId_year_month: { subscriptionId: monthsSubscriptionId, year: y, month: m } },
          });
      if (subMonth) {
        existingMonthsChecked++;
        const skip = await this.prisma.userSkipRecord.findUnique({
          where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: subMonth.id } },
        });
        if (!skip || skip.undoneAt) return false;
      }
      m++;
      if (m > 12) { m = 1; y++; }
    }

    return existingMonthsChecked > 0;
  }

  /** Advances the entry's nextRenewalDate by the given number of months. */
  private async advanceRenewalByMonths(entryId: string, months: number): Promise<void> {
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { id: entryId },
      select: { nextRenewalDate: true },
    });
    if (!entry?.nextRenewalDate) {
      // Fall back to the standard advance logic when no date is set.
      await refreshNextRenewalDate(this.prisma, entryId);
      return;
    }
    const next = new Date(entry.nextRenewalDate);
    next.setUTCMonth(next.getUTCMonth() + months);
    await this.prisma.userSubscriptionEntry.update({
      where: { id: entryId },
      data: { nextRenewalDate: next },
    });
  }

  /**
   * Ensures a prepay billing period exists for the given entry and box month.
   * If an active billing period (with available slots) already covers [year, month],
   * nothing is created. Otherwise a new period is created using the scheduled
   * prepay option's price, currency, and month count.
   *
   * Idempotent: safe to call multiple times for the same renewal date.
   */
  private async ensurePrepayBillingPeriod(
    entryId: string,
    year: number,
    month: number,
    renewalDate: Date,
    option: { id: string; months: number; price: { toString(): string }; currency: string },
  ): Promise<void> {
    const fullEntry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { id: entryId },
      select: { billingPeriods: { orderBy: { billedAt: 'asc' } } },
    });

    const cur = year * 12 + month;
    for (const period of fullEntry?.billingPeriods ?? []) {
      const fromY = period.coveredFromYear, fromM = period.coveredFromMonth;
      const toY = period.coveredToYear ?? fromY, toM = period.coveredToMonth ?? fromM;
      if (cur >= fromY * 12 + fromM && cur <= toY * 12 + toM) {
        const slotsFilled = await this.prisma.userPurchaseGroup.count({
          where: { subscriptionEntryId: entryId, billingPeriodId: period.id },
        });
        if (slotsFilled < period.monthsCovered) {
          return; // Active period with slots available already exists
        }
      }
    }

    // No active period covers this month — create one for the next N months
    const endAbsMonth = month + option.months - 1;
    const coveredToYear = year + Math.floor((endAbsMonth - 1) / 12);
    const coveredToMonth = ((endAbsMonth - 1) % 12) + 1;

    await this.prisma.userSubBillingPeriod.create({
      data: {
        entryId,
        baseAmount: option.price.toString(),
        monthsCovered: option.months,
        paidCurrency: option.currency,
        coveredFromYear: year,
        coveredFromMonth: month,
        coveredToYear,
        coveredToMonth,
        billedAt: renewalDate,
        prepayOptionId: option.id,
      },
    });
  }

  /**
   * Adds books for a subscription month to a user's collection with PREORDER status.
   * Skipped if the user has an active skip record for that month.
   * Uses upsert so re-runs are safe.
   * Creates a UserPurchaseGroup with cost data and UserPurchaseFee records for fee templates.
   * For combo subscriptions, collects books from ALL component subscriptions' months.
   */
  async addBooksForSubscriptionMonth(
    entry: {
      id: string;
      userId: string;
      subscriptionId: string;
      costCurrency: string | null;
      basePrice?: { toString(): string } | null;
      shippingCost?: { toString(): string } | null;
      },
    year: number,
    month: number,
    renewalDate: Date,
  ) {
    // Check if this is a combo subscription; also fetch parentSubscriptionId for content stream fallback
    const sub = await this.prisma.subscription.findUnique({
      where: { id: entry.subscriptionId },
      select: { isCombo: true, parentSubscriptionId: true, comboComponents: { select: { componentId: true } } },
    });

    if (sub?.isCombo) {
      const componentIds = sub.comboComponents.map((c) => c.componentId);
      await this.addBooksForComboMonth(entry, year, month, renewalDate, componentIds);
      return;
    }

    // If the subscription is a child of a content stream, months live on the parent
    const effectiveSubscriptionId = sub?.parentSubscriptionId ?? entry.subscriptionId;

    const monthRecord = await this.prisma.subscriptionMonth.findUnique({
      where: { subscriptionId_year_month: { subscriptionId: effectiveSubscriptionId, year, month } },
      include: {
        books: { select: { id: true, bookId: true, editionId: true, signatureType: true, choiceGroupId: true } },
      },
    });

    if (!monthRecord || monthRecord.books.length === 0) return;

    // Check for active skip
    const skip = await this.prisma.userSkipRecord.findUnique({
      where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: monthRecord.id } },
    });
    if (skip && !skip.undoneAt) return;

    await this.createPurchaseGroupAndBooks(entry, year, month, renewalDate, monthRecord.books, monthRecord.signatureType ?? null);
  }

  private async createPurchaseGroupAndBooks(
    entry: {
      id: string;
      userId: string;
      subscriptionId: string;
      costCurrency: string | null;
      basePrice?: { toString(): string } | null;
      shippingCost?: { toString(): string } | null;
      },
    year: number,
    month: number,
    renewalDate: Date,
    books: Array<{ id: string; bookId: string; editionId: string | null; signatureType: $Enums.SignatureType | null; choiceGroupId: string | null }>,
    defaultSignatureType: $Enums.SignatureType | null,
    titleOverride?: string,
  ) {
    const currency = entry.costCurrency ?? 'USD';
    const fallbackBase = entry.basePrice ? parseFloat(entry.basePrice.toString()) : 0;
    const shippingCost = entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null;
    const fullEntry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { id: entry.id },
      select: {
        billingPeriods: {
          orderBy: { billedAt: 'asc' },
        },
      },
    });

    // Find active billing period for [year, month]
    type BillingPeriod = NonNullable<typeof fullEntry>['billingPeriods'][0];
    let activePeriod: BillingPeriod | null = null;
    if (fullEntry?.billingPeriods) {
      for (const period of fullEntry.billingPeriods) {
        const fromY = period.coveredFromYear, fromM = period.coveredFromMonth;
        const toY = period.coveredToYear ?? period.coveredFromYear;
        const toM = period.coveredToMonth ?? period.coveredFromMonth;
        const cur = year * 12 + month;
        if (cur >= fromY * 12 + fromM && cur <= toY * 12 + toM) {
          // Check slots filled
          const slotsFilled = await this.prisma.userPurchaseGroup.count({
            where: { subscriptionEntryId: entry.id, billingPeriodId: period.id },
          });
          if (slotsFilled < period.monthsCovered) {
            activePeriod = period;
            break;
          }
        }
      }
    }

    // Determine pricing
    let basePrice: number;
    let shippingAmount: number | null;
    let purchasedAt: Date;
    let billingPeriodId: string | undefined;

    let effectiveCurrency: string;
    if (activePeriod) {
      const n = activePeriod.monthsCovered;
      basePrice = activePeriod.baseAmount ? parseFloat(activePeriod.baseAmount.toString()) / n : fallbackBase;
      shippingAmount = activePeriod.shipping ? parseFloat(activePeriod.shipping.toString()) / n : shippingCost;
      purchasedAt = activePeriod.billedAt ?? renewalDate;
      billingPeriodId = activePeriod.id;
      // Use the billing period's currency (may differ from entry.costCurrency for multi-currency prepay)
      effectiveCurrency = activePeriod.paidCurrency ?? currency;
    } else {
      // Apply multi-currency price changes: pass entry.costCurrency as targetCurrency so only
      // matching records are considered. If no records exist for that currency,
      // resolveEffectiveBasePrice returns fromPriceChange: false and the user's entered price is kept.
      const subPriceChanges = await this.prisma.subscriptionPriceChange.findMany({
        where: { subscriptionId: entry.subscriptionId },
        orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
      });
      // Find the earliest purchase group for this entry to determine user's first billing month.
      // Scoped to this subscription entry (current active window only).
      const firstGroup = await this.prisma.userPurchaseGroup.findFirst({
        where: { subscriptionEntryId: entry.id, fromSubscription: true },
        orderBy: { title: 'asc' },
        select: { title: true },
      });
      const userFirstBilledYearMonth = parseFirstBilledYearMonth(firstGroup?.title, year, month);
      const resolved = resolveEffectiveBasePrice(
        subPriceChanges,
        year,
        month,
        fallbackBase,
        entry.costCurrency,
        userFirstBilledYearMonth,
      );
      basePrice = resolved.price ?? fallbackBase;
      shippingAmount = shippingCost;
      purchasedAt = renewalDate;
      effectiveCurrency = currency;
    }

    const groupTitle = titleOverride ?? `Subscription – ${year}/${String(month).padStart(2, '0')}`;

    // Idempotency: reuse existing purchase group for this entry + month if already created
    let group = await this.prisma.userPurchaseGroup.findFirst({
      where: { userId: entry.userId, subscriptionEntryId: entry.id, title: groupTitle },
      select: { id: true },
    });

    if (!group) {
      group = await this.prisma.userPurchaseGroup.create({
        data: {
          userId: entry.userId,
          fromSubscription: true,
          subscriptionEntryId: entry.id,
          totalAmount: basePrice,
          shippingAmount,
          currency: effectiveCurrency,
          purchasedAt,
          title: groupTitle,
          ...(billingPeriodId ? { billingPeriodId } : {}),
        },
      });
    }

    // Fetch fee templates for this subscription entry
    const feeTemplateLinks = await this.prisma.userSubscriptionEntryFeeTemplate.findMany({
      where: { subscriptionEntryId: entry.id },
      include: { feeTemplate: true },
    });

    const feesToCreate: Array<{
      userId: string;
      feeTemplateId?: string | null;
      name: string;
      amount: number;
      currency: string;
      date: Date;
      category: FeeCategory;
      purchaseGroupId: string;
    }> = [];

    const resolvedBooks = await resolveMonthBooksForEntry(this.prisma, entry.id, books);
    for (const mb of resolvedBooks) {
      if (!mb.bookId || !mb.editionId) continue;

      const existingEntry = await this.prisma.userBookEntry.findFirst({
        where: { userId: entry.userId, editionId: mb.editionId, subscriptionEntryId: entry.id },
        select: { id: true },
      });
      if (!existingEntry) {
        const newEntry = await this.prisma.userBookEntry.create({
          data: {
            userId: entry.userId,
            bookId: mb.bookId,
            editionId: mb.editionId,
            ownershipStatus: 'PREORDER',
            readingStatus: 'UNREAD',
            subscriptionEntryId: entry.id,
            purchaseGroupId: group.id,
            signatureType: mb.signatureType ?? defaultSignatureType,
          },
        }).catch(() => null);
        if (newEntry) {
          await recordOwnershipHistory(this.prisma, [newEntry], 'PREORDER', purchasedAt).catch(() => {});
        }
      }
    }

    // Add fee templates once per purchase group (not per book)
    for (const link of feeTemplateLinks) {
      const template = link.feeTemplate;
      const amount = link.customAmount ?? template.defaultAmount;
      if (!amount) continue;
      // If active billing period: divide fees in same currency by monthsCovered
      const feeCurrency = link.customCurrency ?? template.defaultCurrency;
      const rawAmount = parseFloat(amount.toString());
      const effectiveAmount = (activePeriod && feeCurrency === (activePeriod.paidCurrency ?? currency))
        ? rawAmount / activePeriod.monthsCovered
        : rawAmount;
      feesToCreate.push({
        userId: entry.userId,
        feeTemplateId: template.id,
        name: template.name,
        amount: effectiveAmount,
        currency: feeCurrency,
        date: purchasedAt,
        category: (template.category ?? 'OTHER') as FeeCategory,
        purchaseGroupId: group.id,
      });
    }

    if (feesToCreate.length > 0) {
      await this.prisma.userPurchaseFee.createMany({
        data: feesToCreate,
        skipDuplicates: true,
      });
    }
  }

  /**
   * For bundle subscriptions (isBundleSubscription=true): collects books from ALL months
   * in the renewal window [bundleStartMonth, bundleStartMonth+intervalMonths-1] and
   * creates ONE purchase group for the entire bundle (one payment, one shipment).
   * Skip is checked on the first month only (skip = whole bundle).
   * Books from months not yet linked are simply omitted; retroactivelyAddBookForSubscribers
   * will add them later when the admin links them.
   */
  private async addBooksForBundleMonths(
    entry: {
      id: string;
      userId: string;
      subscriptionId: string;
      costCurrency: string | null;
      basePrice?: { toString(): string } | null;
      shippingCost?: { toString(): string } | null;
      },
    bundleStartYear: number,
    bundleStartMonth: number,
    intervalMonths: number,
    renewalDate: Date,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: entry.subscriptionId },
      select: { parentSubscriptionId: true },
    });
    const effectiveSubscriptionId = sub?.parentSubscriptionId ?? entry.subscriptionId;

    // Skip is checked on the first month of the bundle (skip = whole bundle)
    const firstMonthRecord = await this.prisma.subscriptionMonth.findUnique({
      where: { subscriptionId_year_month: { subscriptionId: effectiveSubscriptionId, year: bundleStartYear, month: bundleStartMonth } },
      select: { id: true },
    });
    if (firstMonthRecord) {
      const skip = await this.prisma.userSkipRecord.findUnique({
        where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: firstMonthRecord.id } },
      });
      if (skip && !skip.undoneAt) return;
    }

    // Collect books from all months in the bundle window
    const allBooks: Array<{ id: string; bookId: string; editionId: string | null; signatureType: $Enums.SignatureType | null; choiceGroupId: string | null }> = [];
    let curYear = bundleStartYear;
    let curMonth = bundleStartMonth;
    for (let i = 0; i < intervalMonths; i++) {
      const monthRecord = await this.prisma.subscriptionMonth.findUnique({
        where: { subscriptionId_year_month: { subscriptionId: effectiveSubscriptionId, year: curYear, month: curMonth } },
        include: { books: { select: { id: true, bookId: true, editionId: true, signatureType: true, choiceGroupId: true } } },
      });
      if (monthRecord) allBooks.push(...monthRecord.books);
      [curYear, curMonth] = curMonth === 12 ? [curYear + 1, 1] : [curYear, curMonth + 1];
    }

    if (allBooks.length === 0) return;

    const bundleTitle = `Subscription Bundle – ${bundleStartYear}/${String(bundleStartMonth).padStart(2, '0')}`;
    await this.createPurchaseGroupAndBooks(entry, bundleStartYear, bundleStartMonth, renewalDate, allBooks, null, bundleTitle);
  }

  /**
   * For combo components that are content stream variants (parentSubscriptionId set),
   * months live on the parent subscription — not on the variant itself.
   * Returns the effective subscription IDs to use when querying SubscriptionMonth records.
   */
  private async resolveEffectiveComponentIds(componentIds: string[]): Promise<string[]> {
    if (componentIds.length === 0) return [];
    const subs = await this.prisma.subscription.findMany({
      where: { id: { in: componentIds } },
      select: { id: true, parentSubscriptionId: true },
    });
    return subs.map((s) => s.parentSubscriptionId ?? s.id);
  }

  private async addBooksForComboMonth(
    entry: {
      id: string;
      userId: string;
      subscriptionId: string;
      costCurrency: string | null;
      basePrice?: { toString(): string } | null;
      shippingCost?: { toString(): string } | null;
      },
    year: number,
    month: number,
    renewalDate: Date,
    componentIds: string[],
  ) {
    if (componentIds.length === 0) return;

    // Resolve effective IDs — for content stream variants, months live on the parent.
    const effectiveComponentIds = await this.resolveEffectiveComponentIds(componentIds);

    // Collect books from all component subscriptions' months
    const componentMonths = await this.prisma.subscriptionMonth.findMany({
      where: { subscriptionId: { in: effectiveComponentIds }, year, month },
      include: { books: { select: { id: true, bookId: true, editionId: true, signatureType: true, choiceGroupId: true } } },
    });

    const allBooks = componentMonths.flatMap((m) => m.books).filter((b) => b.bookId && b.editionId);
    if (allBooks.length === 0) return;

    await this.createPurchaseGroupAndBooks(entry, year, month, renewalDate, allBooks, null);
  }

  /**
   * Called when a new book is linked to a subscription month.
   * For every active subscriber whose renewal for that month has already been
   * recorded AND who did not skip the month, retroactively adds the book to
   * their collection with ownershipStatus='PREORDER'.
   *
   * Also handles content streams: if subscriptionId is a content stream,
   * subscribers of all child subs (parentSubscriptionId = subscriptionId)
   * are processed as well.
   */
  async retroactivelyAddBookForSubscribers(
    subscriptionId: string,
    monthRecord: { id: string; year: number; month: number; signatureType: $Enums.SignatureType | null },
    book: { bookId: string; editionId: string | null; signatureType: $Enums.SignatureType | null },
  ) {
    if (!book.bookId || !book.editionId) return;

    // Resolve all subscription IDs whose subscribers should receive this book:
    // - direct subscribers of subscriptionId
    // - subscribers of child subs (when subscriptionId is a content stream)
    const childSubs = await this.prisma.subscription.findMany({
      where: { parentSubscriptionId: subscriptionId },
      select: { id: true, renewalMonthOffset: true, isBundleSubscription: true, intervalMonths: true },
    });

    // Build list of { subId, renewalMonthOffset, isBundleSubscription, intervalMonths } pairs to process
    const subsToProcess: Array<{ id: string; renewalMonthOffset: number; isBundleSubscription: boolean; intervalMonths: number }> = [];

    const directSub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { renewalMonthOffset: true, isBundleSubscription: true, intervalMonths: true },
    });
    if (directSub) {
      subsToProcess.push({ id: subscriptionId, renewalMonthOffset: directSub.renewalMonthOffset, isBundleSubscription: directSub.isBundleSubscription, intervalMonths: directSub.intervalMonths });
    }
    for (const child of childSubs) {
      subsToProcess.push({ id: child.id, renewalMonthOffset: child.renewalMonthOffset, isBundleSubscription: child.isBundleSubscription, intervalMonths: child.intervalMonths });
    }

    for (const sub of subsToProcess) {
      const entries = await this.prisma.userSubscriptionEntry.findMany({
        where: { subscriptionId: sub.id, active: true },
        select: { id: true, userId: true, costCurrency: true },
      });
      if (entries.length === 0) continue;

      const offset = sub.renewalMonthOffset;
      const interval = sub.isBundleSubscription ? sub.intervalMonths : 1;
      const [renewalYear, renewalMonth] = renewalMonthFromBoxMonth(monthRecord.year, monthRecord.month, offset);
      // For bundle subs: expand window back by (interval-1) months so a single quarterly renewal
      // covers all months in its window. For monthly (interval=1): window is unchanged.
      const monthStart = new Date(Date.UTC(renewalYear, renewalMonth - interval, 1));
      const monthEnd = new Date(Date.UTC(renewalYear, renewalMonth, 1));

      for (const entry of entries) {
        // Was there a renewal in this window?
        const renewalRecord = await this.prisma.userSubscriptionRenewal.findFirst({
          where: {
            entryId: entry.id,
            renewalDate: { gte: monthStart, lt: monthEnd },
          },
          select: { renewalDate: true },
        });

        if (!renewalRecord) continue;

        // For bundle subs: skip is checked on the first month of the bundle, not the current month
        if (sub.isBundleSubscription) {
          // Compute bundle start month from the actual renewal date + offset
          const rDate = renewalRecord.renewalDate;
          let bStartMonth = rDate.getUTCMonth() + 1 + offset;
          let bStartYear = rDate.getUTCFullYear();
          while (bStartMonth > 12) { bStartMonth -= 12; bStartYear++; }
          // Months always live on the subscription passed to this function (subscriptionId),
          // whether that's a direct bundle sub or a content-stream parent.
          const effectiveSubId = subscriptionId;
          const bundleFirstMonthRecord = await this.prisma.subscriptionMonth.findUnique({
            where: { subscriptionId_year_month: { subscriptionId: effectiveSubId, year: bStartYear, month: bStartMonth } },
            select: { id: true },
          });
          if (bundleFirstMonthRecord) {
            const skip = await this.prisma.userSkipRecord.findUnique({
              where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: bundleFirstMonthRecord.id } },
            });
            if (skip && !skip.undoneAt) continue;
          }

          // Find the bundle's purchase group (keyed by bundle start month)
          const bundleTitle = `Subscription Bundle – ${bStartYear}/${String(bStartMonth).padStart(2, '0')}`;
          const existingGroup = await this.prisma.userPurchaseGroup.findFirst({
            where: { userId: entry.userId, subscriptionEntryId: entry.id, title: bundleTitle },
            select: { id: true },
          });

          const existingBookEntry = await this.prisma.userBookEntry.findFirst({
            where: { userId: entry.userId, editionId: book.editionId!, subscriptionEntryId: entry.id },
            select: { id: true },
          });
          if (!existingBookEntry) {
            const newEntry = await this.prisma.userBookEntry.create({
              data: {
                userId: entry.userId,
                bookId: book.bookId,
                editionId: book.editionId!,
                ownershipStatus: 'PREORDER',
                readingStatus: 'UNREAD',
                subscriptionEntryId: entry.id,
                purchaseGroupId: existingGroup?.id ?? null,
                signatureType: book.signatureType ?? monthRecord.signatureType ?? null,
              },
            }).catch(() => null);
            if (newEntry) {
              await recordOwnershipHistory(this.prisma, [newEntry], 'PREORDER', renewalRecord.renewalDate).catch(() => {});
            }
          }
        } else {
          // Non-bundle: original logic
          // Did the user skip this month?
          const skip = await this.prisma.userSkipRecord.findUnique({
            where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: monthRecord.id } },
          });
          if (skip && !skip.undoneAt) continue;

          // Link to the existing purchase group for this month (created by the renewal cron)
          const existingGroup = await this.prisma.userPurchaseGroup.findFirst({
            where: {
              userId: entry.userId,
              subscriptionEntryId: entry.id,
              title: `Subscription – ${monthRecord.year}/${String(monthRecord.month).padStart(2, '0')}`,
            },
            select: { id: true },
          });

          const existingBookEntry = await this.prisma.userBookEntry.findFirst({
            where: { userId: entry.userId, editionId: book.editionId!, subscriptionEntryId: entry.id },
            select: { id: true },
          });
          if (!existingBookEntry) {
            const newEntry = await this.prisma.userBookEntry.create({
              data: {
                userId: entry.userId,
                bookId: book.bookId,
                editionId: book.editionId!,
                ownershipStatus: 'PREORDER',
                readingStatus: 'UNREAD',
                subscriptionEntryId: entry.id,
                purchaseGroupId: existingGroup?.id ?? null,
                signatureType: book.signatureType ?? monthRecord.signatureType ?? null,
              },
            }).catch(() => null);
            if (newEntry) {
              await recordOwnershipHistory(this.prisma, [newEntry], 'PREORDER', renewalRecord.renewalDate).catch(() => {});
            }
          }
        }
      }
    }

    // Also retroactively add to subscribers of any COMBO sub that includes this subscription as a component.
    // Combo subs don't use parentSubscriptionId — they reference components via SubscriptionComboComponent.
    const comboLinks = await this.prisma.subscriptionComboComponent.findMany({
      where: { componentId: subscriptionId },
      select: { comboId: true },
    });

    for (const link of comboLinks) {
      const comboSub = await this.prisma.subscription.findUnique({
        where: { id: link.comboId },
        select: { renewalMonthOffset: true },
      });
      const comboOffset = comboSub?.renewalMonthOffset ?? 0;
      const [renewalYear, renewalMonth] = renewalMonthFromBoxMonth(monthRecord.year, monthRecord.month, comboOffset);
      const comboMonthStart = new Date(Date.UTC(renewalYear, renewalMonth - 1, 1));
      const comboMonthEnd = new Date(Date.UTC(renewalYear, renewalMonth, 1));

      const comboEntries = await this.prisma.userSubscriptionEntry.findMany({
        where: { subscriptionId: link.comboId, active: true },
        select: { id: true, userId: true, costCurrency: true },
      });
      if (comboEntries.length === 0) continue;

      for (const entry of comboEntries) {
        const renewalRecord = await this.prisma.userSubscriptionRenewal.findFirst({
          where: { entryId: entry.id, renewalDate: { gte: comboMonthStart, lt: comboMonthEnd } },
          select: { id: true, renewalDate: true },
        });
        if (!renewalRecord) continue;

        // Combo subs have no per-month skip check (consistent with addBooksForComboMonth)
        const groupTitle = `Subscription – ${renewalYear}/${String(renewalMonth).padStart(2, '0')}`;
        const existingGroup = await this.prisma.userPurchaseGroup.findFirst({
          where: { userId: entry.userId, subscriptionEntryId: entry.id, title: groupTitle },
          select: { id: true },
        });

        const existingBookEntry = await this.prisma.userBookEntry.findFirst({
          where: { userId: entry.userId, editionId: book.editionId!, subscriptionEntryId: entry.id },
          select: { id: true },
        });
        if (!existingBookEntry) {
          const newEntry = await this.prisma.userBookEntry.create({
            data: {
              userId: entry.userId,
              bookId: book.bookId,
              editionId: book.editionId!,
              ownershipStatus: 'PREORDER',
              readingStatus: 'UNREAD',
              subscriptionEntryId: entry.id,
              purchaseGroupId: existingGroup?.id ?? null,
              signatureType: book.signatureType ?? monthRecord.signatureType ?? null,
            },
          }).catch(() => null);
          if (newEntry) {
            await recordOwnershipHistory(this.prisma, [newEntry], 'PREORDER', renewalRecord.renewalDate).catch(() => {});
          }
        }
      }
    }
  }

  /**
   * Daily at 00:30 UTC — resolves any SubscriptionMonthChoiceGroup whose deadline has
   * passed for entries that never made an explicit choice. Applies the default (every
   * option in the group — see subscription-month-choice.util) and sends a notification
   * explaining how to self-correct: there is deliberately no automatic pricing here, the
   * user removes the unwanted book via the collection trash, or edits the purchase-group
   * cost themselves if keeping both at a different price.
   */
  @Cron('30 0 * * *')
  async resolveExpiredBookChoices() {
    const now = new Date();
    const groups = await this.prisma.subscriptionMonthChoiceGroup.findMany({
      select: {
        id: true,
        allowMultiple: true,
        choiceDeadlineType: true,
        choiceDeadlineDaysBefore: true,
        choiceDeadlineDayOfMonth: true,
        options: { select: { id: true } },
        month: {
          select: {
            year: true,
            month: true,
            subscriptionId: true,
            subscription: { select: { name: true, slug: true, renewalDay: true } },
          },
        },
      },
    });

    for (const group of groups) {
      const deadline = computeChoiceDeadline(group.month.year, group.month.month, group.month.subscription.renewalDay ?? 1, group);
      if (deadline > now) continue;

      const activeEntries = await this.prisma.userSubscriptionEntry.findMany({
        where: { subscriptionId: group.month.subscriptionId, active: true },
        select: { id: true, userId: true },
      });
      if (activeEntries.length === 0) continue;

      const alreadyChosen = await this.prisma.userSubscriptionMonthChoice.findMany({
        where: { choiceGroupId: group.id, subscriptionEntryId: { in: activeEntries.map((e) => e.id) } },
        select: { subscriptionEntryId: true },
      });
      const resolvedEntryIds = new Set(alreadyChosen.map((c) => c.subscriptionEntryId));
      const unresolved = activeEntries.filter((e) => !resolvedEntryIds.has(e.id));
      if (unresolved.length === 0) continue;

      const monthLabel = `${group.month.year}/${String(group.month.month).padStart(2, '0')}`;
      const allOptionIds = group.options.map((o) => o.id);
      for (const entry of unresolved) {
        await persistMonthChoice(this.prisma, group, entry.id, allOptionIds, 'default').catch(() => null);
        this.scheduledReminders?.cancelBookChoice(entry.id, group.id).catch(() => {});
        await materializeChoiceGroupBooks(this.prisma, entry.userId, entry.id, allOptionIds, now, 'OWNED').catch(() => {});

        const title = 'Book choice deadline passed';
        const body =
          `${group.month.subscription.name} — ${monthLabel}: you didn't pick in time, so we added both books. ` +
          `Only want one? Remove the other from your collection (trash icon). ` +
          `Keeping both and the price differs from your usual subscription cost? Edit the cost yourself from that book's entry — open its edition detail page.`;
        await this.notificationsService
          ?.createNotification(entry.userId, 'book_choice_default_applied', title, body, 'subscriptions', group.month.subscription.slug)
          .catch(() => {});
      }
    }
  }
}
