import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateMonthDto,
  UpdateMonthDto,
  AddMonthBookDto,
  SubscriptionQueryDto,
  JoinSubscriptionDto,
  BackfillSubscriptionDto,
} from './subscriptions.dto';
import { generateSlugFromParts } from '../../common/utils/slug.util';
import { SkipPolicyEngine } from '../skip-policy/skip-policy.engine';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skipPolicyEngine: SkipPolicyEngine,
  ) {}

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

    for (const month of source.months) {
      const newMonth = await this.prisma.subscriptionMonth.create({
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
      });
      if (month.books.length) {
        await this.prisma.subscriptionMonthBook.createMany({
          data: month.books.map((b) => ({
            monthId: newMonth.id,
            bookId: b.bookId,
            editionId: b.editionId,
            isMainBook: b.isMainBook,
            sortOrder: b.sortOrder,
          })),
        });
      }
    }
  }

  async findAll(query: SubscriptionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
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
                    publishYear: true,
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

    try {
      return await this.prisma.subscriptionMonthBook.create({
        data: {
          monthId: monthRecord.id,
          bookId: dto.bookId,
          editionId: dto.editionId,
          isMainBook: dto.isMainBook ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch {
      throw new ConflictException('Book already added to this month');
    }
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

  async getMySubscriptionEntry(userId: string, slug: string) {
    const sub = await this.findBySlug(slug);
    return this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
  }

  async cancelMySubscription(userId: string, slug: string) {
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
        cancellationDate: new Date().toISOString().slice(0, 10),
      },
    });
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
        startDate: startDateStr ?? undefined,
        basePrice: dto.basePrice !== undefined ? parseFloat(dto.basePrice) : undefined,
        shippingCost: dto.shippingCost !== undefined ? parseFloat(dto.shippingCost) : undefined,
        taxesAndFees: dto.taxesAndFees !== undefined ? parseFloat(dto.taxesAndFees) : undefined,
        costCurrency: dto.costCurrency ?? (sub as any).currency ?? 'EUR',
        renewalDay,
      },
    });

    // Compute eligible past months: from startDate+1 to current month (inclusive)
    const eligibleMonths = await this.getEligibleMonths(sub.id, startDateObj);

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

  async backfillSubscription(userId: string, slug: string, dto: BackfillSubscriptionDto) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    if (!entry) throw new NotFoundException('You must join this subscription before backfilling');

    const renewalDay = entry.renewalDay ?? 1;
    let booksAdded = 0;
    let skipsRecorded = 0;

    // Create book entries for selected months
    for (const monthId of dto.selectedMonthIds) {
      const monthRecord = await this.prisma.subscriptionMonth.findUnique({ where: { id: monthId } });
      if (!monthRecord) continue;

      const purchaseDate = new Date(monthRecord.year, monthRecord.month - 1, renewalDay);

      const monthBooks = await this.prisma.subscriptionMonthBook.findMany({
        where: { monthId },
        select: { editionId: true, bookId: true },
      });

      for (const mb of monthBooks) {
        if (!mb.editionId || !mb.bookId) continue;
        try {
          await this.prisma.userBookEntry.upsert({
            where: { userId_bookId_editionId: { userId, bookId: mb.bookId, editionId: mb.editionId } },
            create: {
              userId,
              bookId: mb.bookId,
              editionId: mb.editionId,
              purchaseDate,
              ownershipStatus: 'OWNED',
              readingStatus: 'UNREAD',
            },
            update: {},
          });
          booksAdded++;
        } catch {
          // skip duplicates silently
        }
      }
    }

    // Create skip records for skipped months
    for (const monthId of dto.skippedMonthIds) {
      try {
        await this.prisma.userSkipRecord.upsert({
          where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: monthId } },
          create: { userId, userEntryId: entry.id, subscriptionMonthId: monthId, skippedAt: new Date() },
          update: {},
        });
        skipsRecorded++;
      } catch {
        // skip duplicates silently
      }
    }

    // Recompute skip state counters
    if (skipsRecorded > 0) {
      await this.skipPolicyEngine.recomputeSkipState(userId, sub.id);
    }

    return { booksAdded, skipsRecorded };
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
}
