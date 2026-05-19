import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { $Enums, FeeCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { refreshNextRenewalDate, renewalMonthFromBoxMonth } from '../../common/utils/renewal-date.util';
import { resolveEffectiveBasePrice } from './price-change.util';

@Injectable()
export class RenewalCronService {
  private readonly logger = new Logger(RenewalCronService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        subscription: { select: { renewalMonthOffset: true, isBundleSubscription: true, intervalMonths: true } },
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
    subscription: { renewalMonthOffset: number; isBundleSubscription: boolean; intervalMonths: number } | null;
  }) {
    const renewalDate = entry.nextRenewalDate!;
    const offset = entry.subscription?.renewalMonthOffset ?? 0;
    // Box month = renewal month + offset (e.g. April renewal + 1 = May box)
    const [year, month] = offset === 0
      ? [renewalDate.getUTCFullYear(), renewalDate.getUTCMonth() + 1]
      : (() => {
          let m = renewalDate.getUTCMonth() + 1 + offset;
          let y = renewalDate.getUTCFullYear();
          while (m > 12) { m -= 12; y++; }
          return [y, m] as [number, number];
        })();

    // Idempotency: if we already recorded this exact renewal date → skip book-add
    // (nextRenewalDate might not have advanced yet if the API was down)
    const existing = await this.prisma.userSubscriptionRenewal.findUnique({
      where: { entryId_renewalDate: { entryId: entry.id, renewalDate } },
    });

    if (!existing) {
      await this.prisma.userSubscriptionRenewal.create({
        data: { userId: entry.userId, entryId: entry.id, renewalDate, source: 'cron' },
      });

      if (entry.subscription?.isBundleSubscription) {
        await this.addBooksForBundleMonths(entry, year, month, entry.subscription.intervalMonths, renewalDate);
      } else {
        await this.addBooksForSubscriptionMonth(entry, year, month, renewalDate);
      }
    }

    // Always advance nextRenewalDate (safe if already advanced)
    await refreshNextRenewalDate(this.prisma, entry.id);
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
        books: { select: { bookId: true, editionId: true, signatureType: true } },
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
    books: Array<{ bookId: string; editionId: string | null; signatureType: $Enums.SignatureType | null }>,
    defaultSignatureType: $Enums.SignatureType | null,
    titleOverride?: string,
  ) {
    const currency = entry.costCurrency ?? 'USD';
    const fallbackBase = entry.basePrice ? parseFloat(entry.basePrice.toString()) : 0;
    const shippingCost = entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null;

    // Load billing periods for this entry
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

    if (activePeriod) {
      const n = activePeriod.monthsCovered;
      basePrice = activePeriod.baseAmount ? parseFloat(activePeriod.baseAmount.toString()) / n : fallbackBase;
      shippingAmount = activePeriod.shipping ? parseFloat(activePeriod.shipping.toString()) / n : shippingCost;
      purchasedAt = activePeriod.billedAt ?? renewalDate;
      billingPeriodId = activePeriod.id;
    } else {
      // Apply multi-currency price changes: pass entry.costCurrency as targetCurrency so only
      // matching records are considered. If no records exist for that currency,
      // resolveEffectiveBasePrice returns fromPriceChange: false and the user's entered price is kept.
      const subPriceChanges = await this.prisma.subscriptionPriceChange.findMany({
        where: { subscriptionId: entry.subscriptionId },
        orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
      });
      const resolved = resolveEffectiveBasePrice(
        subPriceChanges,
        year,
        month,
        fallbackBase,
        entry.costCurrency,
      );
      basePrice = resolved.price ?? fallbackBase;
      shippingAmount = shippingCost;
      purchasedAt = renewalDate;
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
          currency,
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

    for (const mb of books) {
      if (!mb.bookId || !mb.editionId) continue;

      const existingEntry = await this.prisma.userBookEntry.findFirst({
        where: { userId: entry.userId, editionId: mb.editionId, subscriptionEntryId: entry.id },
        select: { id: true },
      });
      if (!existingEntry) {
        await this.prisma.userBookEntry.create({
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
        }).catch(() => {});
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
    const allBooks: Array<{ bookId: string; editionId: string | null; signatureType: $Enums.SignatureType | null }> = [];
    let curYear = bundleStartYear;
    let curMonth = bundleStartMonth;
    for (let i = 0; i < intervalMonths; i++) {
      const monthRecord = await this.prisma.subscriptionMonth.findUnique({
        where: { subscriptionId_year_month: { subscriptionId: effectiveSubscriptionId, year: curYear, month: curMonth } },
        include: { books: { select: { bookId: true, editionId: true, signatureType: true } } },
      });
      if (monthRecord) allBooks.push(...monthRecord.books);
      [curYear, curMonth] = curMonth === 12 ? [curYear + 1, 1] : [curYear, curMonth + 1];
    }

    if (allBooks.length === 0) return;

    const bundleTitle = `Subscription Bundle – ${bundleStartYear}/${String(bundleStartMonth).padStart(2, '0')}`;
    await this.createPurchaseGroupAndBooks(entry, bundleStartYear, bundleStartMonth, renewalDate, allBooks, null, bundleTitle);
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

    // Collect books from all component subscriptions' months
    const componentMonths = await this.prisma.subscriptionMonth.findMany({
      where: { subscriptionId: { in: componentIds }, year, month },
      include: { books: { select: { bookId: true, editionId: true, signatureType: true } } },
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
            await this.prisma.userBookEntry.create({
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
            }).catch(() => {});
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
            await this.prisma.userBookEntry.create({
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
            }).catch(() => {});
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
          select: { id: true },
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
          await this.prisma.userBookEntry.create({
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
          }).catch(() => {});
        }
      }
    }
  }
}
