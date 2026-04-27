import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { $Enums } from '@prisma/client';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateMonthDto,
  UpdateMonthDto,
  AddMonthBookDto,
  UpdateMonthBookDto,
  SubscriptionQueryDto,
  JoinSubscriptionDto,
  BackfillSubscriptionDto,
} from './subscriptions.dto';
import { generateSlugFromParts } from '../../common/utils/slug.util';
import { computeNextRenewalDate, refreshNextRenewalDate, backfillRenewalHistory } from '../../common/utils/renewal-date.util';
import { SkipPolicyEngine } from '../skip-policy/skip-policy.engine';
import { RenewalCronService } from './renewal.cron';

export interface CountryFeeHint {
  category: string;
  count: number;
  totalSubscribers: number;
  avgAmount: number | null;
  currency: string | null;
  avgShipping: number | null;
  shippingCurrency: string | null;
  shippingCount: number;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skipPolicyEngine: SkipPolicyEngine,
    private readonly renewalCron: RenewalCronService,
  ) {}

  private countryFeeCache = new Map<string, { data: CountryFeeHint[]; expiresAt: number }>();

  async create(dto: CreateSubscriptionDto) {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) throw new NotFoundException(`Company '${dto.companyId}' not found`);

    const slug = generateSlugFromParts(company.name, dto.name);
    const subscription = await this.prisma.subscription.create({
      data: {
        slug,
        companyId: dto.companyId,
        name: dto.name,
        description: dto.description,
        coverImage: dto.coverImage,
        logoUrl: dto.logoUrl,
        genre: dto.genres?.[0] ?? dto.genre ?? null,
        genres: dto.genres ?? (dto.genre ? [dto.genre] : []),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isDiscontinued: dto.isDiscontinued ?? false,
        currency: dto.currency ?? 'EUR',
        price: dto.price,
        language: dto.language,
        shipsInternationally: dto.shipsInternationally ?? false,
        type: dto.type,
        bookishMerch: dto.bookishMerch ?? false,
        isCombo: dto.isCombo ?? false,
        parentSubscriptionId: dto.parentSubscriptionId,
        renewalDay: dto.renewalDay,
        renewalDayUserSet: dto.renewalDayUserSet ?? false,
        startingMonth: dto.startingMonth,
        shippingCountries: dto.shippingCountries ?? [],
        paymentOnStartup: dto.paymentOnStartup ?? false,
      },
    });

    // Copy months+books from source subscription
    if (dto.copyFromSlug) {
      await this.copyMonthsFrom(subscription.id, dto.copyFromSlug);
    }

    // Set combo components
    if (dto.componentIds?.length) {
      await this.prisma.subscriptionComboComponent.createMany({
        data: dto.componentIds.map((componentId) => ({ comboId: subscription.id, componentId })),
        skipDuplicates: true,
      });
    }

    return subscription;
  }

  private async copyMonthsFrom(targetSubscriptionId: string, sourceSlug: string) {
    const source = await this.prisma.subscription.findUnique({
      where: { slug: sourceSlug },
      include: {
        months: {
          include: { books: true },
        },
      },
    });
    if (!source) throw new NotFoundException(`Source subscription '${sourceSlug}' not found`);

    // Create all months in parallel, then bulk-insert all month_books in a single
    // query. With 12 months × 10 books this drops 24 sequential round-trips → 2.
    const newMonths = await Promise.all(
      source.months.map((month) =>
        this.prisma.subscriptionMonth.create({
          data: {
            subscriptionId: targetSubscriptionId,
            year: month.year,
            month: month.month,
            theme: month.theme,
            coverImage: month.coverImage,
            spoilerImage: month.spoilerImage,
            isSpoiler: month.isSpoiler,
            actualShipping: month.actualShipping ?? undefined,
            boxPrice: month.boxPrice ?? undefined,
          },
        }),
      ),
    );

    const allBooks = newMonths.flatMap((newMonth, idx) =>
      source.months[idx].books.map((b) => ({
        monthId: newMonth.id,
        bookId: b.bookId,
        editionId: b.editionId,
        isMainBook: b.isMainBook,
        sortOrder: b.sortOrder,
      })),
    );

    if (allBooks.length) {
      await this.prisma.subscriptionMonthBook.createMany({ data: allBooks });
    }
  }

  async findAll(query: SubscriptionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = query.includeHidden ? {} : { isHidden: false };
    if (query.companyId) where.companyId = query.companyId;
    if (query.companySlug) where.company = { slug: query.companySlug };
    if (query.genre) where.OR = [{ genre: query.genre }, { genres: { has: query.genre } }];
    if (query.type) where.type = query.type;
    if (query.isDiscontinued !== undefined) {
      where.isDiscontinued = query.isDiscontinued;
    }
    if (query.shipsInternationally !== undefined) {
      where.shipsInternationally = query.shipsInternationally;
    }

    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          company: { select: { id: true, slug: true, name: true, logoUrl: true } },
          skipPolicy: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug },
      include: {
        company: true,
        skipPolicy: true,
        months: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            books: {
              include: {
                book: {
                    select: {
                      id: true,
                      title: true,
                      slug: true,
                      coverImage: true,
                      authors: { select: { author: { select: { name: true, slug: true } } } },
                    },
                  },
                edition: {
                  select: {
                    id: true,
                    slug: true,
                    editionName: true,
                    publisher: true,
                    coverImage: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${slug}' not found`);
    return subscription;
  }

  async update(slug: string, dto: UpdateSubscriptionDto) {
    await this.findBySlug(slug);
    const { componentIds, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    const updated = await this.prisma.subscription.update({ where: { slug }, data });

    // Replace combo components if provided
    if (componentIds !== undefined) {
      await this.prisma.subscriptionComboComponent.deleteMany({ where: { comboId: updated.id } });
      if (componentIds.length) {
        await this.prisma.subscriptionComboComponent.createMany({
          data: componentIds.map((componentId) => ({ comboId: updated.id, componentId })),
          skipDuplicates: true,
        });
      }
    }

    return updated;
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.subscription.delete({ where: { slug } });
  }

  private async getSubscriptionMonths(slug: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { slug } });
    if (!subscription) throw new NotFoundException(`Subscription '${slug}' not found`);
    return subscription;
  }

  async getMonths(slug: string) {
    const subscription = await this.findBySlug(slug);
    return subscription.months;
  }

  async addMonth(subscriptionSlug: string, dto: CreateMonthDto) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);

    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: {
          subscriptionId: subscription.id,
          year: dto.year,
          month: dto.month,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Month ${dto.month}/${dto.year} already exists for this subscription`,
      );
    }

    return this.prisma.subscriptionMonth.create({
      data: {
        subscriptionId: subscription.id,
        year: dto.year,
        month: dto.month,
        theme: dto.theme,
        coverImage: dto.coverImage,
        spoilerImage: dto.spoilerImage,
        isSpoiler: dto.isSpoiler ?? false,
        actualShipping: dto.actualShipping ? dto.actualShipping : undefined,
        boxPrice: dto.boxPrice ? dto.boxPrice : undefined,
        signatureType: dto.signatureType ?? null,
      },
    });
  }

  async updateMonth(
    subscriptionSlug: string,
    year: number,
    month: number,
    dto: UpdateMonthDto,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: { subscriptionId: subscription.id, year, month },
      },
    });
    if (!existing) throw new NotFoundException(`Month ${month}/${year} not found`);

    return this.prisma.subscriptionMonth.update({
      where: { id: existing.id },
      data: dto,
    });
  }

  async deleteMonth(subscriptionSlug: string, year: number, month: number) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: { subscriptionId: subscription.id, year, month },
      },
    });
    if (!existing) throw new NotFoundException(`Month ${month}/${year} not found`);

    return this.prisma.subscriptionMonth.delete({ where: { id: existing.id } });
  }

  private async getMonth(subscriptionId: string, year: number, month: number) {
    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: { subscriptionId, year, month },
      },
    });
    if (!existing) throw new NotFoundException(`Month ${month}/${year} not found`);
    return existing;
  }

  async addBookToMonth(
    subscriptionSlug: string,
    year: number,
    month: number,
    dto: AddMonthBookDto,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    let newBook;
    try {
      newBook = await this.prisma.subscriptionMonthBook.create({
        data: {
          monthId: monthRecord.id,
          bookId: dto.bookId,
          editionId: dto.editionId,
          isMainBook: dto.isMainBook ?? true,
          sortOrder: dto.sortOrder ?? 0,
          signatureType: dto.signatureType ?? null,
        },
      });
    } catch {
      throw new ConflictException('Book already added to this month');
    }

    // Retroactively add this book to users whose renewal for this month already occurred
    if (dto.bookId && dto.editionId) {
      this.renewalCron.retroactivelyAddBookForSubscribers(
        subscription.id,
        { id: monthRecord.id, year, month, signatureType: monthRecord.signatureType ?? null },
        { bookId: dto.bookId, editionId: dto.editionId, signatureType: (dto.signatureType as $Enums.SignatureType | null) ?? null },
      ).catch(() => {});
    }

    return newBook;
  }

  async removeBookFromMonth(
    subscriptionSlug: string,
    year: number,
    month: number,
    bookId: string,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    return this.prisma.subscriptionMonthBook.delete({
      where: { monthId_bookId: { monthId: monthRecord.id, bookId } },
    });
  }

  async updateMonthBook(
    subscriptionSlug: string,
    year: number,
    month: number,
    bookId: string,
    dto: UpdateMonthBookDto,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    return this.prisma.subscriptionMonthBook.update({
      where: { monthId_bookId: { monthId: monthRecord.id, bookId } },
      data: { signatureType: dto.signatureType ?? null },
    });
  }

  async getMySubscriptionEntry(userId: string, slug: string) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
      include: {
        feeTemplates: {
          include: { feeTemplate: true },
        },
        skipRecords: {
          where: { undoneAt: null },
          include: { month: { select: { year: true, month: true } } },
        },
      },
    });
    if (!entry) return null;

    const renewalDay = entry.renewalDay ?? sub.renewalDay ?? 1;
    const type = (sub as any).type as string | null;
    const startingMonth = (sub as any).startingMonth as number | null;
    const userStartDate = entry.startDate ?? null;
    const paymentOnStartup = (sub as any).paymentOnStartup as boolean;
    const skippedMonths = entry.skipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));

    // For paymentOnStartup: find the ACTUAL first subscription month that was paid at signup.
    let paidUpFrontDate: Date | null = null;
    if (paymentOnStartup && userStartDate) {
      const joinDate = new Date(userStartDate);
      const joinYear = joinDate.getUTCFullYear();
      const joinMonth = joinDate.getUTCMonth() + 1;
      const joinDay = joinDate.getUTCDate();
      const renewalPassedThisMonth = renewalDay < joinDay;
      let firstEligibleYear = joinYear;
      let firstEligibleMonth = joinMonth;
      if (renewalPassedThisMonth) {
        [firstEligibleYear, firstEligibleMonth] = this.incrementMonth(joinYear, joinMonth);
      }
      // Look up the actual first subscription month (same logic as recordFirstMonthAsPreorder)
      const firstSubMonth = await this.prisma.subscriptionMonth.findFirst({
        where: {
          subscriptionId: sub.id,
          OR: [
            { year: { gt: firstEligibleYear } },
            { year: firstEligibleYear, month: { gte: firstEligibleMonth } },
          ],
        },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
        select: { year: true, month: true },
      });
      const paidYear = firstSubMonth?.year ?? firstEligibleYear;
      const paidMonth = firstSubMonth?.month ?? firstEligibleMonth;
      paidUpFrontDate = new Date(Date.UTC(paidYear, paidMonth - 1, renewalDay));
    }

    const nextRenewalDate = this.computeNextRenewalDate(
      renewalDay, type, startingMonth, userStartDate, skippedMonths,
      paidUpFrontDate,
    );

    const { skipRecords: _sr, ...entryWithoutSkips } = entry;
    return { ...entryWithoutSkips, nextRenewalDate: nextRenewalDate ? nextRenewalDate.toISOString() : null };
  }

  private computeNextRenewalDate(
    renewalDay: number,
    type: string | null,
    startingMonth: number | null,
    userStartDate: string | null,
    skippedMonths: { year: number; month: number }[] = [],
    paidUpFrontDate: Date | null = null,
  ): Date | null {
    return computeNextRenewalDate(renewalDay, type, startingMonth, userStartDate, skippedMonths, paidUpFrontDate);
  }

  private incrementMonth(year: number, month: number): [number, number] {
    return month === 12 ? [year + 1, 1] : [year, month + 1];
  }

  async getMySubscriptions(userId: string) {
    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: { userId },
      orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
      select: {
        id: true,
        active: true,
        startDate: true,
        renewalDay: true,
        nextRenewalDate: true,
        costCurrency: true,
        basePrice: true,
        shippingCost: true,
        taxesAndFees: true,
        skipRecords: {
          where: { undoneAt: null },
          include: { month: { select: { year: true, month: true } } },
        },
        subscription: {
          select: {
            id: true,
            slug: true,
            name: true,
            coverImage: true,
            logoUrl: true,
            currency: true,
            price: true,
            isDiscontinued: true,
            paymentOnStartup: true,
            renewalDay: true,
            type: true,
            startingMonth: true,
            company: { select: { name: true, slug: true } },
          },
        },
      },
    });

    return Promise.all(entries.map(async (entry) => {
      const sub = entry.subscription as any;

      // Use stored nextRenewalDate from DB; fall back to computing if not yet populated
      let storedRenewalDate = (entry as any).nextRenewalDate as Date | null;
      if (!storedRenewalDate && entry.active) {
        // Lazy backfill: compute and save if missing
        await refreshNextRenewalDate(this.prisma, entry.id);
        const fresh = await this.prisma.userSubscriptionEntry.findUnique({
          where: { id: entry.id },
          select: { nextRenewalDate: true },
        });
        storedRenewalDate = fresh?.nextRenewalDate ?? null;
      }

      // Compute total renewal amount
      const cur = entry.costCurrency ?? sub.currency ?? null;
      const base = entry.basePrice ? parseFloat(entry.basePrice.toString()) : null;
      const shipping = entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null;
      const taxes = entry.taxesAndFees ? parseFloat(entry.taxesAndFees.toString()) : null;
      const nextRenewalAmount = base !== null
        ? (base + (shipping ?? 0) + (taxes ?? 0))
        : null;

      const { skipRecords: _sr, ...entryWithoutSkips } = entry;
      return {
        ...entryWithoutSkips,
        subscription: { ...sub },
        nextRenewalDate: storedRenewalDate ? storedRenewalDate.toISOString() : null,
        nextRenewalAmount: nextRenewalAmount !== null ? nextRenewalAmount.toFixed(2) : null,
        nextRenewalCurrency: cur,
      };
    }));
  }

  async cancelMySubscription(userId: string, slug: string, dto: { cancellationDate?: string; cancellationReason?: string } = {}) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    if (!entry) throw new NotFoundException('You are not subscribed to this subscription');
    if (!entry.active) throw new BadRequestException('Subscription is already cancelled');

    // Check if current date falls within any active SERIES_ONLY series with canCancelDuring=false
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    const blockingSeries = await this.prisma.subscriptionSeries.findFirst({
      where: {
        subscriptionId: sub.id,
        skipMode: 'SERIES_ONLY',
        canCancelDuring: false,
        isActive: true,
        OR: [
          // Starts in same year, ends in same year: check month range
          {
            startYear: currentYear,
            endYear: currentYear,
            startMonth: { lte: currentMonth },
            endMonth: { gte: currentMonth },
          },
          // Series spans multiple years — starts before current year, ends after
          { startYear: { lt: currentYear }, endYear: { gt: currentYear } },
          // Starts before or in current year, ends in current year at or after current month
          { startYear: { lt: currentYear }, endYear: currentYear, endMonth: { gte: currentMonth } },
          // Starts in current year at or before current month, ends after current year
          { startYear: currentYear, startMonth: { lte: currentMonth }, endYear: { gt: currentYear } },
        ],
      },
      select: { name: true },
    });

    if (blockingSeries) {
      throw new BadRequestException(
        `Cannot cancel during active series "${blockingSeries.name}". Cancellation is locked until the series ends.`,
      );
    }

    return this.prisma.userSubscriptionEntry.update({
      where: { id: entry.id },
      data: {
        active: false,
        nextRenewalDate: null,
        cancellationDate: dto.cancellationDate ?? new Date().toISOString().slice(0, 10),
        cancellationReason: dto.cancellationReason ?? null,
      },
    });
  }

  async removeMySubscription(
    userId: string,
    slug: string,
    opts: { removeBooks: boolean; removeSpending: boolean },
  ) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
      include: {
        billingPeriods: { select: { id: true, purchaseTransactionId: true } },
      },
    });
    if (!entry) throw new NotFoundException('You are not subscribed to this subscription');

    if (opts.removeSpending) {
      const txIds = entry.billingPeriods
        .map((p) => p.purchaseTransactionId)
        .filter((id): id is string => id != null);
      if (txIds.length) {
        await this.prisma.purchaseTransaction.deleteMany({ where: { id: { in: txIds } } });
      }
    }

    if (opts.removeBooks) {
      // Delete books linked via subscriptionEntryId (added via backfill)
      await this.prisma.userBookEntry.deleteMany({
        where: { userId, subscriptionEntryId: entry.id },
      });
      // Also delete books linked via purchaseTransactionId (manual billing periods)
      const txIds = entry.billingPeriods
        .map((p) => p.purchaseTransactionId)
        .filter((id): id is string => id != null);
      if (txIds.length) {
        await this.prisma.userBookEntry.deleteMany({
          where: { userId, purchaseTransactionId: { in: txIds } },
        });
      }
    }

    // Delete entry (cascades: billing periods, cost changes, fee templates, skip records, tags)
    await this.prisma.userSubscriptionEntry.delete({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    return { success: true };
  }

  async updateMyEntryCosts(
    userId: string,
    slug: string,
    dto: { basePrice?: string; shippingCost?: string; taxesAndFees?: string; costCurrency?: string; linkedFeeTemplates?: Array<{ templateId: string; customAmount?: number; customCurrency?: string }> },
  ) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    if (!entry) throw new NotFoundException('You are not subscribed to this subscription');

    await this.prisma.userSubscriptionEntry.update({
      where: { id: entry.id },
      data: {
        ...(dto.basePrice !== undefined && { basePrice: dto.basePrice }),
        ...(dto.shippingCost !== undefined && { shippingCost: dto.shippingCost }),
        ...(dto.taxesAndFees !== undefined && { taxesAndFees: dto.taxesAndFees }),
        ...(dto.costCurrency !== undefined && { costCurrency: dto.costCurrency }),
      },
    });

    // Propagate currency to book entries that are missing it
    if (dto.costCurrency) {
      await this.prisma.userBookEntry.updateMany({
        where: { subscriptionEntryId: entry.id, priceCurrency: null },
        data: { priceCurrency: dto.costCurrency },
      });
    }

    if (dto.linkedFeeTemplates !== undefined) {
      // Replace all fee template links for this entry
      await this.prisma.userSubscriptionEntryFeeTemplate.deleteMany({
        where: { subscriptionEntryId: entry.id },
      });
      if (dto.linkedFeeTemplates.length > 0) {
        await this.prisma.userSubscriptionEntryFeeTemplate.createMany({
          data: dto.linkedFeeTemplates.map((t) => ({
            subscriptionEntryId: entry.id,
            feeTemplateId: t.templateId,
            customAmount: t.customAmount != null ? t.customAmount.toString() : null,
            customCurrency: t.customCurrency ?? null,
          })),
        });
      }
    }

    return this.getMySubscriptionEntry(userId, slug);
  }

  async joinSubscription(userId: string, slug: string, dto: JoinSubscriptionDto) {
    const sub = await this.findBySlug(slug);

    const existing = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    if (existing?.active) {
      throw new ConflictException('You are already subscribed to this subscription');
    }

    // Parse startDate: accepts YYYY-MM-DD or YYYY-MM
    let startDateObj: Date | null = null;
    let startDateStr: string | null = null;
    if (dto.startDate) {
      const parts = dto.startDate.split('-').map(Number);
      const y = parts[0], m = parts[1], d = parts[2] ?? 1;
      startDateObj = new Date(y, m - 1, d);
      startDateStr = dto.startDate.length >= 10
        ? dto.startDate.slice(0, 10)            // full YYYY-MM-DD
        : `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
    }

    // Resolve renewalDay:
    // - if sub has a fixed renewalDay → use it (don't override with dto.renewalDay)
    // - if dto provided a full date → derive from that day
    // - else fallback to dto.renewalDay or 1
    const subRenewalDay = (sub as any).renewalDay as number | null;
    const renewalDay = subRenewalDay
      ?? (startDateObj ? startDateObj.getDate() : null)
      ?? dto.renewalDay
      ?? 1;

    const entry = await this.prisma.userSubscriptionEntry.upsert({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
      create: {
        userId,
        subscriptionId: sub.id,
        active: true,
        startDate: startDateStr,
        basePrice: dto.basePrice ? parseFloat(dto.basePrice) : null,
        shippingCost: dto.shippingCost ? parseFloat(dto.shippingCost) : null,
        taxesAndFees: dto.taxesAndFees ? parseFloat(dto.taxesAndFees) : null,
        costCurrency: dto.costCurrency ?? (sub as any).currency ?? 'EUR',
        renewalDay,
      },
      update: {
        active: true,
        cancellationDate: null,
        cancellationReason: null,
        startDate: startDateStr ?? undefined,
        basePrice: dto.basePrice !== undefined ? parseFloat(dto.basePrice) : undefined,
        shippingCost: dto.shippingCost !== undefined ? parseFloat(dto.shippingCost) : undefined,
        taxesAndFees: dto.taxesAndFees !== undefined ? parseFloat(dto.taxesAndFees) : undefined,
        costCurrency: dto.costCurrency ?? (sub as any).currency ?? 'EUR',
        renewalDay,
      },
    });

    // Save linked fee templates (replace existing associations)
    if (dto.linkedFeeTemplates !== undefined) {
      // Delete previous associations for this entry
      await this.prisma.userSubscriptionEntryFeeTemplate.deleteMany({
        where: { subscriptionEntryId: entry.id },
      });
      if (dto.linkedFeeTemplates.length > 0) {
        await this.prisma.userSubscriptionEntryFeeTemplate.createMany({
          data: dto.linkedFeeTemplates.map(t => ({
            subscriptionEntryId: entry.id,
            feeTemplateId: t.templateId,
            customAmount: t.customAmount ?? null,
            customCurrency: t.customCurrency ?? null,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Compute eligible past months: from startDate+1 to current month (inclusive)
    const eligibleMonths = await this.getEligibleMonths(sub.id, startDateObj);

    // If paymentOnStartup: register the first upcoming month's books as preorders
    const paymentOnStartup = (sub as any).paymentOnStartup as boolean;
    if (paymentOnStartup && startDateObj) {
      await this.recordFirstMonthAsPreorder(entry.id, userId, sub.id, startDateObj, entry);
    }

    // Persist nextRenewalDate so cron jobs can query it
    await refreshNextRenewalDate(this.prisma, entry.id);
    // Backfill past renewal history for calendar display (fire-and-forget)
    backfillRenewalHistory(this.prisma, entry.id).catch(() => {});

    return { entry, eligibleMonths };
  }

  private async getEligibleMonths(subscriptionId: string, startDateObj: Date | null) {
    if (!startDateObj) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // First eligible month = startDate + 1 month
    const nextMonthDate = new Date(startDateObj.getFullYear(), startDateObj.getMonth() + 1, 1);
    const startYear = nextMonthDate.getFullYear();
    const startMonth = nextMonthDate.getMonth() + 1;

    // If startDate is in current month or later → nothing to backfill
    if (startYear > currentYear || (startYear === currentYear && startMonth > currentMonth)) {
      return [];
    }

    return this.prisma.subscriptionMonth.findMany({
      where: {
        subscriptionId,
        AND: [
          {
            OR: [
              { year: { gt: startYear } },
              { year: startYear, month: { gte: startMonth } },
            ],
          },
          {
            OR: [
              { year: { lt: currentYear } },
              { year: currentYear, month: { lte: currentMonth } },
            ],
          },
        ],
      },
      include: {
        books: {
          include: {
            edition: {
              include: {
                book: {
                  include: { authors: { include: { author: { select: { id: true, name: true } } } } },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        series: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }

  /**
   * When paymentOnStartup=true: find the first subscription month whose renewal date
   * is >= the join date (startDateObj). If this month's renewal day has already passed,
   * the user missed it and starts from the next month.
   */
  private async recordFirstMonthAsPreorder(
    entryId: string,
    userId: string,
    subscriptionId: string,
    startDateObj: Date,
    entry: { id: string; renewalDay: number | null; basePrice: unknown; shippingCost: unknown; taxesAndFees: unknown; costCurrency: string | null; feeTemplates?: unknown[] },
  ) {
    const startYear = startDateObj.getFullYear();
    const startMonth = startDateObj.getMonth() + 1;
    const joinDay = startDateObj.getDate();
    const renewalDay = entry.renewalDay ?? 1;

    // If this month's renewal day has already passed on the join date,
    // the user missed it — start from the next month.
    const renewalPassedThisMonth = renewalDay < joinDay;
    let firstEligibleYear = startYear;
    let firstEligibleMonth = startMonth;
    if (renewalPassedThisMonth) {
      if (startMonth === 12) {
        firstEligibleYear = startYear + 1;
        firstEligibleMonth = 1;
      } else {
        firstEligibleMonth = startMonth + 1;
      }
    }

    // Find the first subscription month at or after the first eligible month
    const firstMonth = await this.prisma.subscriptionMonth.findFirst({
      where: {
        subscriptionId,
        OR: [
          { year: { gt: firstEligibleYear } },
          { year: firstEligibleYear, month: { gte: firstEligibleMonth } },
        ],
      },
      include: {
        books: { select: { editionId: true, bookId: true, signatureType: true } },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    if (!firstMonth || firstMonth.books.length === 0) return;

    const purchaseDate = new Date(Date.UTC(firstMonth.year, firstMonth.month - 1, renewalDay));
    const monthBooks = firstMonth.books.filter(mb => mb.editionId && mb.bookId);

    // Fetch fee templates for this entry (they were just saved before calling this function)
    const feeTemplateLinks = await this.prisma.userSubscriptionEntryFeeTemplate.findMany({
      where: { subscriptionEntryId: entryId },
      include: { feeTemplate: true },
    });

    const feesToCreate: {
      userId: string; feeTemplateId?: string; name: string; amount: number;
      currency: string; date: Date; category: any; userBookEntryId: string;
    }[] = [];

    for (const mb of monthBooks) {
      const pricePerBook = entry.basePrice && monthBooks.length > 0
        ? parseFloat((entry.basePrice as any).toString()) / monthBooks.length
        : null;

      try {
        const bookEntry = await this.prisma.userBookEntry.upsert({
          where: { userId_bookId_editionId: { userId, bookId: mb.bookId!, editionId: mb.editionId! } },
          create: {
            userId,
            bookId: mb.bookId!,
            editionId: mb.editionId!,
            purchaseDate,
            ownershipStatus: 'PREORDER',
            readingStatus: 'UNREAD',
            subscriptionEntryId: entryId,
            signatureType: mb.signatureType ?? firstMonth.signatureType ?? null,
            ...(pricePerBook !== null && { allocatedPrice: pricePerBook }),
            ...(entry.costCurrency && { priceCurrency: entry.costCurrency }),
          },
          update: {
            ...(pricePerBook !== null && { allocatedPrice: pricePerBook }),
            ...(entry.costCurrency && { priceCurrency: entry.costCurrency }),
          },
        });

        // Fee templates
        for (const link of feeTemplateLinks) {
          const template = link.feeTemplate;
          const amount = link.customAmount ?? template.defaultAmount;
          if (!amount) continue;
          feesToCreate.push({
            userId,
            feeTemplateId: template.id,
            name: template.name,
            amount: parseFloat(amount.toString()),
            currency: link.customCurrency ?? template.defaultCurrency,
            date: purchaseDate,
            category: template.category,
            userBookEntryId: bookEntry.id,
          });
        }

        // Shipping cost (split across books)
        if (entry.shippingCost && monthBooks.length > 0) {
          feesToCreate.push({
            userId,
            name: 'Shipping',
            amount: parseFloat((entry.shippingCost as any).toString()) / monthBooks.length,
            currency: entry.costCurrency ?? 'USD',
            date: purchaseDate,
            category: 'SHIPPING',
            userBookEntryId: bookEntry.id,
          });
        }

        // Taxes & fees (split across books)
        if (entry.taxesAndFees && monthBooks.length > 0) {
          feesToCreate.push({
            userId,
            name: 'Taxes & Fees',
            amount: parseFloat((entry.taxesAndFees as any).toString()) / monthBooks.length,
            currency: entry.costCurrency ?? 'USD',
            date: purchaseDate,
            category: 'OTHER',
            userBookEntryId: bookEntry.id,
          });
        }
      } catch {
        // skip if already exists
      }
    }

    if (feesToCreate.length > 0) {
      await this.prisma.userPurchaseFee.createMany({
        data: feesToCreate,
        skipDuplicates: true,
      });
    }
  }

  async backfillSubscription(userId: string, slug: string, dto: BackfillSubscriptionDto) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
      include: {
        feeTemplates: {
          include: {
            feeTemplate: true,
          },
        },
      },
    });
    if (!entry) throw new NotFoundException('You must join this subscription before backfilling');

    const renewalDay = entry.renewalDay ?? 1;
    let booksAdded = 0;
    let skipsRecorded = 0;

    // Batch-load ALL months with their books in a single query
    const monthRecords = await this.prisma.subscriptionMonth.findMany({
      where: { id: { in: dto.selectedMonthIds } },
      select: {
        id: true,
        year: true,
        month: true,
        signatureType: true,
        books: {
          select: { editionId: true, bookId: true, signatureType: true },
        },
      },
    });
    const monthMap = new Map(monthRecords.map(m => [m.id, m]));

    // If paymentOnStartup: the earliest selected month's books get purchaseDate = entry.startDate
    const paymentOnStartup = (sub as any).paymentOnStartup as boolean;
    let earliestMonthId: string | null = null;
    if (paymentOnStartup && entry.startDate) {
      let earliest: { year: number; month: number; id: string } | null = null;
      for (const m of monthRecords) {
        if (!earliest || m.year < earliest.year || (m.year === earliest.year && m.month < earliest.month)) {
          earliest = m;
        }
      }
      earliestMonthId = earliest?.id ?? null;
    }

    // Build all fee records in memory first
    const feesToCreate: {
      userId: string; feeTemplateId?: string; name: string; amount: number;
      currency: string; date: Date; category: any; userBookEntryId: string;
    }[] = [];

    for (const monthId of dto.selectedMonthIds) {
      const monthRecord = monthMap.get(monthId);
      if (!monthRecord) continue;

      const renewalDate = (earliestMonthId === monthId && entry.startDate)
        ? new Date(entry.startDate)
        : new Date(Date.UTC(monthRecord.year, monthRecord.month - 1, renewalDay));
      const monthBooks = monthRecord.books.filter(mb => mb.editionId && mb.bookId);

      for (const mb of monthBooks) {
        const override = dto.bookPrices?.find(bp => bp.monthId === monthId && bp.editionId === mb.editionId);
        const pricePerBook = override != null
          ? override.price
          : (entry.basePrice && monthBooks.length > 0
            ? parseFloat(entry.basePrice.toString()) / monthBooks.length
            : null);

        try {
          const bookEntry = await this.prisma.userBookEntry.upsert({
            where: { userId_bookId_editionId: { userId, bookId: mb.bookId!, editionId: mb.editionId! } },
            create: {
              userId,
              bookId: mb.bookId!,
              editionId: mb.editionId!,
              purchaseDate: renewalDate,
              ownershipStatus: 'OWNED',
              readingStatus: 'UNREAD',
              subscriptionEntryId: entry.id,
              signatureType: mb.signatureType ?? monthRecord.signatureType ?? null,
              ...(pricePerBook !== null && { allocatedPrice: pricePerBook }),
              ...(entry.costCurrency && { priceCurrency: entry.costCurrency }),
            },
            update: {
              ...(pricePerBook !== null && { allocatedPrice: pricePerBook }),
              ...(entry.costCurrency && { priceCurrency: entry.costCurrency }),
            },
          });
          booksAdded++;

          // Accumulate fee records instead of creating one by one
          for (const link of (entry as any).feeTemplates ?? []) {
            const template = link.feeTemplate;
            const amount = link.customAmount ?? template.defaultAmount;
            if (!amount) continue;
            feesToCreate.push({
              userId,
              feeTemplateId: template.id,
              name: template.name,
              amount: parseFloat(amount.toString()),
              currency: link.customCurrency ?? template.defaultCurrency,
              date: renewalDate,
              category: template.category,
              userBookEntryId: bookEntry.id,
            });
          }

          if (entry.shippingCost && monthBooks.length > 0) {
            feesToCreate.push({
              userId,
              name: 'Shipping',
              amount: parseFloat(entry.shippingCost.toString()) / monthBooks.length,
              currency: entry.costCurrency ?? 'USD',
              date: renewalDate,
              category: 'SHIPPING',
              userBookEntryId: bookEntry.id,
            });
          }

          if (entry.taxesAndFees && monthBooks.length > 0) {
            feesToCreate.push({
              userId,
              name: 'Taxes & Fees',
              amount: parseFloat(entry.taxesAndFees.toString()) / monthBooks.length,
              currency: entry.costCurrency ?? 'USD',
              date: renewalDate,
              category: 'OTHER',
              userBookEntryId: bookEntry.id,
            });
          }
        } catch {
          // skip duplicates silently
        }
      }
    }

    // Single batch insert for all fees
    if (feesToCreate.length > 0) {
      await this.prisma.userPurchaseFee.createMany({
        data: feesToCreate,
        skipDuplicates: true,
      });
    }

    // Auto-derive skipped months: eligible months with books that were NOT selected as received
    const selectedSet = new Set(dto.selectedMonthIds);
    const startDateObj = entry.startDate ? new Date(entry.startDate) : null;

    const subWithPolicy = await this.prisma.subscription.findUnique({
      where: { id: sub.id },
      include: { skipPolicy: true },
    });
    const policy = subWithPolicy?.skipPolicy ?? null;

    if (startDateObj) {
      const eligibleMonths = await this.getEligibleMonths(sub.id, startDateObj);
      const skippableMonths = eligibleMonths
        .filter(m => m.books.length > 0 && !selectedSet.has(m.id))
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

      let firstSkipDateInWindow: Date | null = null;

      for (const m of skippableMonths) {
        const windowKey = this.computeWindowKeyForBackfill(policy, firstSkipDateInWindow, entry.startDate, m.year, m.month);
        const skippedAt = new Date(m.year, m.month - 1, renewalDay);

        await this.prisma.userSkipRecord.upsert({
          where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: m.id } },
          create: { userId, userEntryId: entry.id, subscriptionMonthId: m.id, windowKey, skippedAt },
          update: { windowKey, skippedAt, undoneAt: null },
        });
        skipsRecorded++;

        if (firstSkipDateInWindow === null) {
          firstSkipDateInWindow = skippedAt;
          if (!entry.firstSkipDate) {
            await this.prisma.userSubscriptionEntry.update({
              where: { id: entry.id },
              data: { firstSkipDate: skippedAt },
            });
          }
        }
      }
    }

    // Always recompute skip state after backfill to keep counters consistent
    await this.skipPolicyEngine.recomputeSkipState(userId, sub.id);
    // Backfill past renewal dates for calendar (fire-and-forget)
    backfillRenewalHistory(this.prisma, entry.id).catch(() => {});

    return { booksAdded, skipsRecorded };
  }

  private computeWindowKeyForBackfill(
    policy: { type: string; windowMonths: number | null } | null,
    firstSkipDateInWindow: Date | null,
    entryStartDate: string | null,
    year: number,
    month: number,
  ): string | null {
    if (!policy) return null;

    switch (policy.type) {
      case 'CALENDAR_YEAR':
        return String(year);

      case 'FROM_FIRST_SKIP': {
        if (!firstSkipDateInWindow) {
          return `${year}-${String(month).padStart(2, '0')}-01`;
        }
        const windowMonths = policy.windowMonths ?? 12;
        const windowEnd = new Date(firstSkipDateInWindow);
        windowEnd.setMonth(windowEnd.getMonth() + windowMonths);
        if (new Date(year, month - 1, 1) < windowEnd) {
          return firstSkipDateInWindow.toISOString().slice(0, 10);
        }
        return `${year}-${String(month).padStart(2, '0')}-01`;
      }

      case 'FROM_SUB_START': {
        const ref = entryStartDate ? new Date(entryStartDate) : new Date(year, month - 1, 1);
        return ref.toISOString().slice(0, 10);
      }

      default:
        return null;
    }
  }

  async joinWaitlist(userId: string, subscriptionSlug: string, joinedAt?: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { slug: subscriptionSlug } });
    if (!sub) throw new NotFoundException('Subscription not found');

    const existing = await this.prisma.subscriptionWaitlistEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    if (existing) throw new ConflictException('Already on the waitlist for this subscription');

    return this.prisma.subscriptionWaitlistEntry.create({
      data: {
        userId,
        subscriptionId: sub.id,
        ...(joinedAt ? { joinedAt: new Date(joinedAt) } : {}),
      },
      include: { subscription: { select: { id: true, slug: true, name: true, coverImage: true } } },
    });
  }

  async updateWaitlistJoinDate(userId: string, subscriptionSlug: string, joinedAt: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { slug: subscriptionSlug } });
    if (!sub) throw new NotFoundException('Subscription not found');

    const existing = await this.prisma.subscriptionWaitlistEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    if (!existing) throw new NotFoundException('Not on the waitlist');

    return this.prisma.subscriptionWaitlistEntry.update({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
      data: { joinedAt: new Date(joinedAt) },
    });
  }

  async leaveWaitlist(userId: string, subscriptionSlug: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { slug: subscriptionSlug } });
    if (!sub) throw new NotFoundException('Subscription not found');

    const existing = await this.prisma.subscriptionWaitlistEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    if (!existing) throw new NotFoundException('Not on the waitlist');

    await this.prisma.subscriptionWaitlistEntry.delete({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
  }

  async getMyWaitlistStatus(userId: string, subscriptionSlug: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { slug: subscriptionSlug } });
    if (!sub) return null;

    return this.prisma.subscriptionWaitlistEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
  }

  async getMyWaitlist(userId: string) {
    const entries = await this.prisma.subscriptionWaitlistEntry.findMany({
      where: { userId },
      include: {
        subscription: {
          select: {
            id: true,
            slug: true,
            name: true,
            coverImage: true,
            isDiscontinued: true,
            company: { select: { id: true, name: true, slug: true, logoUrl: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const now = new Date();
    return entries.map((e) => ({
      ...e,
      daysOnList: e.leftAt
        ? Math.floor((new Date(e.leftAt).getTime() - new Date(e.joinedAt).getTime()) / 86400000)
        : Math.floor((now.getTime() - new Date(e.joinedAt).getTime()) / 86400000),
      isActive: !e.leftAt,
    }));
  }

  /** Call this when a user actually subscribes to mark their waitlist entry as resolved */
  async resolveWaitlistEntry(userId: string, subscriptionId: string, resolvedAt: Date) {
    const existing = await this.prisma.subscriptionWaitlistEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId } },
    });
    if (!existing || existing.leftAt) return; // not on list or already resolved

    await this.prisma.subscriptionWaitlistEntry.update({
      where: { userId_subscriptionId: { userId, subscriptionId } },
      data: { leftAt: resolvedAt },
    });
  }

  async getCountryFeeHints(slug: string, country: string): Promise<CountryFeeHint[]> {
    const key = `${slug}:${country.toUpperCase()}`;
    const cached = this.countryFeeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const subscription = await this.prisma.subscription.findUnique({ where: { slug }, select: { id: true } });
    if (!subscription) return [];

    const countryUpper = country.toUpperCase();

    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: {
        subscriptionId: subscription.id,
        active: true,
        OR: [
          { shippingCountry: countryUpper },
          { shippingCountry: null, user: { shippingCountry: countryUpper } },
        ],
      },
      select: {
        id: true,
        shippingCost: true,
        costCurrency: true,
        feeTemplates: {
          select: {
            customAmount: true,
            customCurrency: true,
            feeTemplate: {
              select: {
                category: true,
                defaultAmount: true,
                defaultCurrency: true,
              },
            },
          },
        },
      },
    });

    if (!entries.length) return [];

    // Aggregate shipping costs
    const shippingAmounts: number[] = [];
    let shippingCurrency: string | null = null;
    let shippingMixed = false;
    for (const entry of entries) {
      if (entry.shippingCost != null) {
        const cur = entry.costCurrency ?? null;
        shippingAmounts.push(Number(entry.shippingCost));
        if (shippingCurrency === null) shippingCurrency = cur;
        else if (shippingCurrency !== cur) shippingMixed = true;
      }
    }
    if (shippingMixed) shippingCurrency = null;

    const byCategory = new Map<string, { count: number; amounts: number[]; currency: string | null }>();
    for (const entry of entries) {
      for (const link of entry.feeTemplates) {
        const cat = link.feeTemplate.category as string;
        const amt = link.customAmount ?? link.feeTemplate.defaultAmount;
        const cur = link.customCurrency ?? link.feeTemplate.defaultCurrency;
        if (!byCategory.has(cat)) byCategory.set(cat, { count: 0, amounts: [], currency: cur });
        const agg = byCategory.get(cat)!;
        agg.count++;
        if (amt != null) agg.amounts.push(Number(amt));
        if (agg.currency !== cur) agg.currency = null;
      }
    }

    const totalEntries = entries.length;
    const avgShipping = shippingAmounts.length > 0
      ? shippingAmounts.reduce((a, b) => a + b, 0) / shippingAmounts.length
      : null;

    const data: CountryFeeHint[] = Array.from(byCategory.entries()).map(([category, agg]) => ({
      category,
      count: agg.count,
      totalSubscribers: totalEntries,
      avgAmount: agg.amounts.length > 0 ? agg.amounts.reduce((a, b) => a + b, 0) / agg.amounts.length : null,
      currency: agg.currency,
      avgShipping,
      shippingCurrency,
      shippingCount: shippingAmounts.length,
    }));

    // Add a synthetic "shipping" entry if there's shipping data but no SHIPPING fee category
    const hasShippingCat = data.some(d => d.category === 'SHIPPING');
    if (!hasShippingCat && avgShipping !== null) {
      data.push({
        category: '__shipping__',
        count: shippingAmounts.length,
        totalSubscribers: totalEntries,
        avgAmount: avgShipping,
        currency: shippingCurrency,
        avgShipping,
        shippingCurrency,
        shippingCount: shippingAmounts.length,
      });
    }

    data.sort((a, b) => b.count - a.count);

    this.countryFeeCache.set(key, { data, expiresAt: Date.now() + 86_400_000 }); // 24h TTL
    return data;
  }
}
