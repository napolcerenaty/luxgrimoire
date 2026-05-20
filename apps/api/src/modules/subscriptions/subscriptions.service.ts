import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { $Enums } from '@prisma/client';
import { bookAuthorsInclude } from '../../common/prisma-includes';
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
  BackfillBillingBatchDto,
  CreatePriceChangeDto,
  UpdateBillingModeDto,
  CreatePrepayOptionDto,
  UpdatePrepayOptionDto,
} from './subscriptions.dto';
import { generateSlugFromParts } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { findBySlugOrThrow } from '../../common/prisma.utils';
import { computeNextRenewalDate, refreshNextRenewalDate, backfillRenewalHistory } from '../../common/utils/renewal-date.util';
import { SkipPolicyEngine } from '../skip-policy/skip-policy.engine';
import { RenewalCronService } from './renewal.cron';
import { resolveEffectiveBasePrice } from './price-change.util';
import { resolveEffectiveSettings, SubscriptionSettings } from './subscription-settings.util';
import { CrowdStatsService } from '../crowd-stats/crowd-stats.service';

function formatIntervalForTypesense(intervalMonths: number): string {
  if (intervalMonths === 1) return 'Monthly';
  if (intervalMonths === 2) return 'Bimonthly';
  if (intervalMonths === 3) return 'Quarterly';
  return `Every ${intervalMonths} months`;
}

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
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly skipPolicyEngine: SkipPolicyEngine,
    private readonly renewalCron: RenewalCronService,
    private readonly uploadService: UploadService,
    private readonly crowdStatsService: CrowdStatsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private readonly SUB_SLUG_TTL = 60_000; // 60 seconds (content is date-dynamic)
  private readonly subSlugKey = (slug: string) => `subscriptions:slug:${slug}`;


  private countryFeeCache = new Map<string, { data: CountryFeeHint[]; expiresAt: number }>();

  /** Upsert the sentinel price change record (year=1900, month=1) that represents
   *  the subscription's initial/base price. This is always the fallback in
   *  resolveEffectiveBasePrice for any month before the first explicit change. */
  private async upsertSentinelPrice(subscriptionId: string, price: string, currency: string): Promise<void> {
    await this.prisma.subscriptionPriceChange.upsert({
      where: {
        subscriptionId_effectiveYear_effectiveMonth_currency: {
          subscriptionId,
          effectiveYear: 1900,
          effectiveMonth: 1,
          currency: currency || 'EUR',
        },
      },
      create: {
        subscriptionId,
        effectiveYear: 1900,
        effectiveMonth: 1,
        newBasePrice: parseFloat(price),
        currency: currency || 'EUR',
        notes: null,
      },
      update: {
        newBasePrice: parseFloat(price),
      },
    });
  }

  /** Compute the current effective price from a subscription's price change records.
   *  Returns the sentinel price (year=1900) as "base price", or null if no records exist. */
  private computeCurrentPrice(
    priceChanges: { effectiveYear: number; effectiveMonth: number; newBasePrice: { toString(): string } }[],
  ): string | null {
    if (!priceChanges.length) return null;
    // Return the most recent explicit price change (excluding sentinel 1900-01).
    // Fall back to sentinel if no explicit change exists.
    const explicit = priceChanges
      .filter(pc => pc.effectiveYear !== 1900)
      .sort((a, b) => b.effectiveYear !== a.effectiveYear ? b.effectiveYear - a.effectiveYear : b.effectiveMonth - a.effectiveMonth);
    const best = explicit[0] ?? priceChanges.find(pc => pc.effectiveYear === 1900 && pc.effectiveMonth === 1);
    return best ? parseFloat(best.newBasePrice.toString()).toFixed(2) : null;
  }

  async create(dto: CreateSubscriptionDto) {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) throw new NotFoundException(`Company '${dto.companyId}' not found`);

    const slug = generateSlugFromParts(company.name, dto.name);
    const currency = dto.currency ?? 'EUR';
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
        isUpcoming: dto.isUpcoming ?? false,
        upcomingNote: dto.upcomingNote,
        waitlistLink: dto.waitlistLink,
        currency,
        language: dto.language,
        shipsInternationally: dto.shipsInternationally ?? false,
        intervalMonths: dto.intervalMonths ?? 1,
        bookishMerch: dto.bookishMerch ?? false,
        isCombo: dto.isCombo ?? false,
        parentSubscriptionId: dto.parentSubscriptionId,
        renewalDay: dto.renewalDay,
        renewalDayUserSet: dto.renewalDayUserSet ?? false,
        startingMonth: dto.startingMonth,
        shippingCountries: dto.shippingCountries ?? [],
        paymentOnStartup: dto.paymentOnStartup ?? false,
        signupIncludesCurrentMonth: dto.signupIncludesCurrentMonth ?? false,
        contentType: dto.contentType,
        isHidden: dto.isHidden ?? false,
        isContentStream: dto.isContentStream ?? false,
        isBundleSubscription: dto.isBundleSubscription ?? false,
      },
    });

    // Auto-create sentinel price change record so resolveEffectiveBasePrice
    // always has a match, even for months before any explicit price change.
    if (dto.price) {
      await this.upsertSentinelPrice(subscription.id, dto.price, currency);
    }

    // Set combo components
    if (dto.componentIds?.length) {
      await this.prisma.subscriptionComboComponent.createMany({
        data: dto.componentIds.map((componentId) => ({ comboId: subscription.id, componentId })),
        skipDuplicates: true,
      });
    }

    await this.indexSubscription(subscription.id);
    return subscription;
  }

  async findGenres(search?: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ genre: string }[]>`
      SELECT DISTINCT unnest(genres) AS genre FROM subscriptions WHERE array_length(genres, 1) > 0 ORDER BY genre LIMIT 200
    `;
    const all = rows.map(r => r.genre);
    if (search) {
      const q = search.toLowerCase();
      return all.filter(g => g.toLowerCase().includes(q)).slice(0, 30);
    }
    return all.slice(0, 100);
  }

  async findAll(query: SubscriptionQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where: Record<string, unknown> = query.includeHidden ? {} : { isHidden: false, isContentStream: false };
    if (query.companyId) where.companyId = query.companyId;
    if (query.companySlug) where.company = { slug: query.companySlug };
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    if (query.genre) {
      const currentAnd = (where.AND as unknown[]) ?? [];
      where.AND = [...currentAnd, { OR: [{ genre: query.genre }, { genres: { has: query.genre } }] }];
    }
    if (query.isDiscontinued !== undefined) {
      where.isDiscontinued = query.isDiscontinued;
    }
    if (query.shipsInternationally !== undefined) {
      where.shipsInternationally = query.shipsInternationally;
    }
    if (query.isContentStream !== undefined) {
      where.isContentStream = query.isContentStream;
    }
    if (query.status === 'active') {
      const now = new Date();
      where.isDiscontinued = false;
      where.isUpcoming = false;
      const currentAnd = (where.AND as unknown[]) ?? [];
      where.AND = [...currentAnd, { OR: [{ startDate: null }, { startDate: { lte: now } }] }];
    } else if (query.status === 'discontinued') {
      where.isDiscontinued = true;
    } else if (query.status === 'upcoming') {
      const now = new Date();
      where.isDiscontinued = false;
      const currentAnd = (where.AND as unknown[]) ?? [];
      where.AND = [...currentAnd, { OR: [{ isUpcoming: true }, { startDate: { gt: now } }] }];
    }

    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          company: { select: { id: true, slug: true, name: true, logoUrl: true, brandColors: true } },
          skipPolicy: true,
          comboComponents: { select: { componentId: true } },
          priceChanges: { where: { effectiveYear: 1900, effectiveMonth: 1 } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    const mapped = data.map(({ comboComponents, priceChanges, ...rest }) => ({
      ...rest,
      price: this.computeCurrentPrice(priceChanges),
      componentIds: comboComponents.map((c: { componentId: string }) => c.componentId),
    }));

    return { data: mapped, ...buildPageMeta(total, page, pageSize) };
  }

  async findBySlug(slug: string) {
    const cached = await this.cache.get(this.subSlugKey(slug));
    if (cached) return cached as Awaited<ReturnType<typeof this._fetchSubscriptionBySlug>>;
    const result = await this._fetchSubscriptionBySlug(slug);
    await this.cache.set(this.subSlugKey(slug), result, this.SUB_SLUG_TTL);
    return result;
  }

  async getActiveSubscriberCount(slug: string): Promise<{ count: number }> {
    const sub = await this.prisma.subscription.findUnique({ where: { slug }, select: { id: true } });
    if (!sub) return { count: 0 };
    const count = await this.prisma.userSubscriptionEntry.count({
      where: { subscriptionId: sub.id, active: true },
    });
    return { count };
  }

  /** Lean fetch for admin UI — only id, name, companyId needed for breadcrumbs and access checks. */
  async findBySlugForAdmin(slug: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { slug },
      select: { id: true, name: true, companyId: true },
    });
    if (!sub) throw new NotFoundException(`Subscription '${slug}' not found`);
    return sub;
  }

  private async _fetchSubscriptionBySlug(slug: string) {    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;

    // For bundle subscriptions, include months from the start of the current bundle window
    const bundleInfo = await this.prisma.subscription.findUnique({
      where: { slug },
      select: { isBundleSubscription: true, intervalMonths: true, startingMonth: true },
    });
    let monthsFromYear = nowYear;
    let monthsFromMonth = nowMonth;
    if (bundleInfo?.isBundleSubscription && (bundleInfo.intervalMonths ?? 1) > 1) {
      const interval = bundleInfo.intervalMonths ?? 1;
      const startingMonth = bundleInfo.startingMonth ?? 1;
      const monthsFromStart = (nowYear * 12 + nowMonth) - (nowYear * 12 + startingMonth);
      const cycleOffset = ((monthsFromStart % interval) + interval) % interval;
      let bm = nowMonth - cycleOffset;
      let by = nowYear;
      while (bm <= 0) { bm += 12; by--; }
      monthsFromYear = by;
      monthsFromMonth = bm;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { slug },
      include: {
        company: {
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            country: true,
            hasOfficialImagePermission: true,
            brandColors: true,
          },
        },
        skipPolicy: true,
        prepayOptions: { orderBy: { months: 'asc' } },
        parent: { select: { slug: true, name: true } },
        priceChanges: { orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }] },
        comboComponents: {
          include: {
            component: {
              select: {
                id: true,
                slug: true,
                name: true,
                coverImage: true,
                months: {
                  where: {
                    OR: [
                      { year: { gt: nowYear } },
                      { year: nowYear, month: { gte: nowMonth } },
                    ],
                  },
                  orderBy: [{ year: 'desc' }, { month: 'desc' }],
                  include: {
                    cardArtist: { select: { id: true, name: true, slug: true, instagram: true } },
                    books: {
                      include: {
                        book: {
                          select: {
                            id: true,
                            title: true,
                            slug: true,
                            authors: { select: { author: { select: { name: true, slug: true } } } },
                          },
                        },
                        edition: {
                          select: {
                            id: true,
                            slug: true,
                            publisher: true,
                            additionalImages: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        months: {
          where: {
            OR: [
              { year: { gt: monthsFromYear } },
              { year: monthsFromYear, month: { gte: monthsFromMonth } },
            ],
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            cardArtist: { select: { id: true, name: true, slug: true, instagram: true } },
            books: {
              include: {
                book: {
                    select: {
                      id: true,
                      title: true,
                      slug: true,
                      authors: { select: { author: { select: { name: true, slug: true } } } },
                    },
                  },
                edition: {
                  select: {
                    id: true,
                    slug: true,
                    publisher: true,
                    additionalImages: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${slug}' not found`);

    // If this is a variant subscription, its months live on the parent (content stream).
    // Replace the empty months array with months from the parent, filtered to this variant's date range.
    let months = subscription.months;
    if (subscription.parentSubscriptionId) {
      const andConditions: Record<string, unknown>[] = [
        {
          OR: [
            { year: { gt: monthsFromYear } },
            { year: monthsFromYear, month: { gte: monthsFromMonth } },
          ],
        },
      ];
      if (subscription.startDate) {
        const sy = subscription.startDate.getFullYear();
        const sm = subscription.startDate.getMonth() + 1;
        andConditions.push({ OR: [{ year: { gt: sy } }, { year: sy, month: { gte: sm } }] });
      }
      if (subscription.endDate) {
        const ey = subscription.endDate.getFullYear();
        const em = subscription.endDate.getMonth() + 1;
        andConditions.push({ OR: [{ year: { lt: ey } }, { year: ey, month: { lte: em } }] });
      }
      months = await this.prisma.subscriptionMonth.findMany({
        where: { subscriptionId: subscription.parentSubscriptionId, AND: andConditions },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        include: {
          cardArtist: { select: { id: true, name: true, slug: true, instagram: true } },
          books: {
            include: {
              book: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  authors: { select: { author: { select: { name: true, slug: true } } } },
                },
              },
              edition: {
                select: {
                  id: true,
                  slug: true,
                  publisher: true,
                  additionalImages: true,
                },
              },
            },
          },
        },
      }) as typeof months;
    }

    const { comboComponents, months: _months, priceChanges, ...rest } = subscription;
    const sentinelRecord = priceChanges.find((pc) => pc.effectiveYear === 1900 && pc.effectiveMonth === 1);
    return {
      ...rest,
      price: this.computeCurrentPrice(priceChanges),
      // Original price: the sentinel record's value — represents the price from the very beginning,
      // before any explicit price changes. Used by the frontend as a fallback when resolving
      // historical prices for months that predate the first explicit price change.
      originalBasePrice: sentinelRecord
        ? parseFloat(sentinelRecord.newBasePrice.toString()).toFixed(2)
        : this.computeCurrentPrice(priceChanges),
      months,
      componentIds: comboComponents.map((c) => c.componentId),
      components: comboComponents.map((c) => ({ componentId: c.componentId, component: c.component })),
    };
  }

  async listSettingsHistory(slug: string) {
    const sub = await this.findBySlug(slug);
    return this.prisma.subscriptionSettingsHistory.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async update(slug: string, dto: UpdateSubscriptionDto, changedByUserId?: string) {
    const existing = await this.findBySlug(slug);
    const { componentIds, price, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    const updated = await this.prisma.subscription.update({ where: { slug }, data });

    // Record settings history if any tracked field changed
    const settingsFields: (keyof SubscriptionSettings)[] = [
      'renewalDay', 'renewalDayUserSet', 'paymentOnStartup', 'signupIncludesCurrentMonth', 'renewalMonthOffset',
    ];
    const anySettingsChanged = settingsFields.some(
      f => dto[f as keyof UpdateSubscriptionDto] !== undefined && (dto as any)[f] !== (existing as any)[f],
    );
    if (anySettingsChanged) {
      await this.prisma.subscriptionSettingsHistory.create({
        data: {
          subscriptionId: updated.id,
          effectiveFrom: new Date(),
          renewalDay: updated.renewalDay ?? null,
          renewalDayUserSet: (updated as any).renewalDayUserSet ?? false,
          paymentOnStartup: (updated as any).paymentOnStartup ?? false,
          signupIncludesCurrentMonth: (updated as any).signupIncludesCurrentMonth ?? true,
          renewalMonthOffset: (updated as any).renewalMonthOffset ?? 0,
          changedBy: changedByUserId ?? null,
        },
      });
    }

    // If price changed, update the sentinel price change record
    if (price !== undefined && price !== null) {
      const currency = (dto.currency ?? existing.currency ?? 'EUR') as string;
      await this.upsertSentinelPrice(updated.id, price, currency);
      await this.cache.del(this.subSlugKey(slug));
    }

    // Delete old images from Cloudinary if replaced or cleared
    if (dto.coverImage !== undefined && dto.coverImage !== existing.coverImage) {
      await this.uploadService.deleteImages([existing.coverImage]);
    }
    if (dto.logoUrl !== undefined && dto.logoUrl !== existing.logoUrl) {
      await this.uploadService.deleteImages([existing.logoUrl]);
    }

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

    await this.indexSubscription(updated.id);
    return updated;
  }

  async delete(slug: string) {
    const sub = await this.findBySlug(slug);
    await this.uploadService.deleteImages([sub.coverImage, sub.logoUrl]);
    await this.typesense.deleteDocument('subscriptions', sub.id);
    return this.prisma.subscription.delete({ where: { slug } });
  }

  private async getSubscriptionMonths(slug: string) {
    const subscription = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    if (subscription.parentSubscriptionId) {
      throw new BadRequestException('Cannot manage months on a variant subscription. Use the parent subscription.');
    }
    return subscription;
  }

  async getMonths(slug: string, page = 1, pageSize = 12, all = false, ownOnly = false, fromYear?: number, fromMonth?: number) {
    const sub = await this.prisma.subscription.findUnique({
      where: { slug },
      select: { id: true, parentSubscriptionId: true, startDate: true, endDate: true },
    });
    if (!sub) throw new NotFoundException(`Subscription '${slug}' not found`);

    const effectiveId = (!ownOnly && sub.parentSubscriptionId) ? sub.parentSubscriptionId : sub.id;

    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;

    const andConditions: Record<string, unknown>[] = [];

    if (!all) {
      andConditions.push({
        OR: [
          { year: { lt: nowYear } },
          { year: nowYear, month: { lt: nowMonth } },
        ],
      });
    }

    if (sub.parentSubscriptionId) {
      if (sub.startDate) {
        const startYear = sub.startDate.getFullYear();
        const startMonth = sub.startDate.getMonth() + 1;
        andConditions.push({
          OR: [{ year: { gt: startYear } }, { year: startYear, month: { gte: startMonth } }],
        });
      }
      if (sub.endDate) {
        const endYear = sub.endDate.getFullYear();
        const endMonth = sub.endDate.getMonth() + 1;
        andConditions.push({
          OR: [{ year: { lt: endYear } }, { year: endYear, month: { lte: endMonth } }],
        });
      }
    }

    if (fromYear != null) {
      const fy = fromYear;
      const fm = fromMonth ?? 1;
      andConditions.push({
        OR: [{ year: { gt: fy } }, { year: fy, month: { gte: fm } }],
      });
    }

    const where =
      andConditions.length > 0
        ? { subscriptionId: effectiveId, AND: andConditions }
        : { subscriptionId: effectiveId };

    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.subscriptionMonth.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        select: {
          id: true,
          year: true,
          month: true,
          theme: true,
          seriesId: true,
          coverImage: true,
          isSpoiler: true,
          signatureType: true,
          cardArtist: { select: { id: true, name: true, slug: true, instagram: true } },
          books: {
            select: {
              bookId: true,
              editionId: true,
              isMainBook: true,
              signatureType: true,
              book: { select: { id: true, title: true, slug: true } },
              edition: {
                select: {
                  id: true,
                  slug: true,
                  additionalImages: true,
                  bookBoxCompanyCustomName: true,
                  bookBoxCompany: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.subscriptionMonth.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
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

    const monthData = {
      year: dto.year,
      month: dto.month,
      theme: dto.theme,
      coverImage: dto.coverImage,
      spoilerImage: dto.spoilerImage,
      isSpoiler: dto.isSpoiler ?? false,
      actualShipping: dto.actualShipping ? dto.actualShipping : undefined,
      boxPrice: dto.boxPrice ? dto.boxPrice : undefined,
      signatureType: dto.signatureType ?? null,
      cardArtistId: dto.cardArtistId ?? null,
    };

    const created = await this.prisma.subscriptionMonth.create({
      data: { subscriptionId: subscription.id, ...monthData },
    });

    return created;
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

    const updated = await this.prisma.subscriptionMonth.update({
      where: { id: existing.id },
      data: {
        ...dto,
        cardArtistId: dto.cardArtistId === null ? null : dto.cardArtistId,
      },
    });

    return updated;
  }

  async deleteMonth(subscriptionSlug: string, year: number, month: number) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: { subscriptionId: subscription.id, year, month },
      },
    });
    if (!existing) throw new NotFoundException(`Month ${month}/${year} not found`);

    const deleted = await this.prisma.subscriptionMonth.delete({ where: { id: existing.id } });

    return deleted;
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
    const intervalMonths = (sub as any).intervalMonths as number ?? 1;
    const startingMonth = (sub as any).startingMonth as number | null;
    const userStartDate = entry.startDate ?? null;
    const paymentOnStartup = (sub as any).paymentOnStartup as boolean;
    const signupIncludesCurrentMonth = (sub as any).signupIncludesCurrentMonth as boolean;
    const skippedMonths = entry.skipRecords.map((r) => ({ year: r.month.year, month: r.month.month }));

    // For paymentOnStartup: find the ACTUAL first subscription month that was paid at signup.
    let paidUpFrontDate: Date | null = null;
    if (paymentOnStartup && userStartDate) {
      const joinDate = new Date(userStartDate);
      const joinYear = joinDate.getUTCFullYear();
      const joinMonth = joinDate.getUTCMonth() + 1;
      const joinDay = joinDate.getUTCDate();
      // If signupIncludesCurrentMonth: signup month is always the first paid month,
      // regardless of whether renewalDay has already passed.
      const renewalPassedThisMonth = !signupIncludesCurrentMonth && renewalDay < joinDay;
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
      renewalDay, intervalMonths, startingMonth, userStartDate, skippedMonths,
      paidUpFrontDate,
    );

    const { skipRecords: _sr, ...entryWithoutSkips } = entry;
    return { ...entryWithoutSkips, nextRenewalDate: nextRenewalDate ? nextRenewalDate.toISOString() : null };
  }

  private computeNextRenewalDate(
    renewalDay: number,
    intervalMonths: number,
    startingMonth: number | null,
    userStartDate: string | null,
    skippedMonths: { year: number; month: number }[] = [],
    paidUpFrontDate: Date | null = null,
  ): Date | null {
    return computeNextRenewalDate(renewalDay, intervalMonths, startingMonth, userStartDate, skippedMonths, paidUpFrontDate);
  }

  private incrementMonth(year: number, month: number): [number, number] {
    return month === 12 ? [year + 1, 1] : [year, month + 1];
  }

  async getMySubscriptions(userId: string, activeFilter?: boolean) {
    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: { userId, ...(activeFilter !== undefined ? { active: activeFilter } : {}) },
      orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
      select: {
        id: true,
        active: true,
        startDate: true,
        cancellationDate: true,
        cancellationReason: true,
        renewalDay: true,
        nextRenewalDate: true,
        costCurrency: true,
        basePrice: true,
        shippingCost: true,
        skipRecords: {
          where: { undoneAt: null },
          include: { month: { select: { year: true, month: true } } },
        },
        feeTemplates: {
          select: {
            customAmount: true,
            customCurrency: true,
            feeTemplate: {
              select: { defaultAmount: true, defaultCurrency: true },
            },
          },
        },
        subscription: {
          select: {
            id: true,
            slug: true,
            name: true,
            coverImage: true,
            logoUrl: true,
            currency: true,
            priceChanges: { orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }] },
            isDiscontinued: true,
            paymentOnStartup: true,
            renewalDay: true,
            intervalMonths: true,
            startingMonth: true,
            company: { select: { name: true, slug: true, brandColors: true } },
          },
        },
        membershipHistory: {
          orderBy: { startDate: 'asc' },
          select: { id: true, startDate: true, endDate: true, cancellationReason: true },
        },
      },
    });

    return Promise.all(entries.map(async (entry) => {
      const { priceChanges: subPriceChanges, ...subRest } = entry.subscription as any;
      const sub = { ...subRest, price: this.computeCurrentPrice(subPriceChanges ?? []) };

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

      // Compute total renewal amount — use subscription price changes for default-pricing entries
      const cur = entry.costCurrency ?? sub.currency ?? null;
      const fallbackBase = entry.basePrice ? parseFloat(entry.basePrice.toString()) : null;
      const shipping = entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null;
      const subCurrency = cur?.toUpperCase() ?? '';
      const sameCurrencyFees = (entry as any).feeTemplates
        ? ((entry as any).feeTemplates as Array<{
            customAmount: { toString(): string } | null;
            customCurrency: string | null;
            feeTemplate: { defaultAmount: { toString(): string } | null; defaultCurrency: string };
          }>).reduce((sum, link) => {
            const feeCurrency = (link.customCurrency ?? link.feeTemplate.defaultCurrency).toUpperCase();
            if (feeCurrency !== subCurrency) return sum;
            const amt = parseFloat((link.customAmount ?? link.feeTemplate.defaultAmount ?? 0).toString());
            return sum + (isNaN(amt) ? 0 : amt);
          }, 0)
        : 0;

      // Determine next renewal month/year (use UTC to avoid timezone issues)
      let nextBase = fallbackBase;
      let nextRenewalPriceChanged = false;
      let nextRenewalNewPrice: string | null = null;
      if (storedRenewalDate) {
        const renewalYear = storedRenewalDate.getUTCFullYear();
        const renewalMonth = storedRenewalDate.getUTCMonth() + 1;
        // Pass targetCurrency so multi-currency records are resolved correctly.
        // If no records exist for the user's currency, resolveEffectiveBasePrice
        // returns fromPriceChange: false and the user's custom price is preserved.
        const resolved = resolveEffectiveBasePrice(
          subPriceChanges ?? [],
          renewalYear,
          renewalMonth,
          fallbackBase,
          entry.costCurrency,
        );
        if (resolved.fromPriceChange && resolved.price !== fallbackBase) {
          nextBase = resolved.price;
          nextRenewalPriceChanged = true;
          nextRenewalNewPrice = resolved.price !== null ? resolved.price.toFixed(2) : null;
        } else {
          nextBase = resolved.price ?? fallbackBase;
        }
      }

      const nextRenewalAmount = nextBase !== null
        ? (nextBase + (shipping ?? 0) + sameCurrencyFees)
        : null;

      const { skipRecords: _sr, feeTemplates: _ft, membershipHistory, ...entryWithoutSkips } = entry as typeof entry & { feeTemplates: unknown[]; membershipHistory: Array<{ id: string; startDate: string | null; endDate: string | null; cancellationReason: string | null }> };
      return {
        ...entryWithoutSkips,
        subscription: { ...sub },
        membershipHistory: membershipHistory ?? [],
        nextRenewalDate: storedRenewalDate ? storedRenewalDate.toISOString() : null,
        nextRenewalAmount: nextRenewalAmount !== null ? nextRenewalAmount.toFixed(2) : null,
        nextRenewalCurrency: cur,
        nextRenewalPriceChanged,
        nextRenewalNewPrice,
      };
    }));
  }

  async getOrphanedMembershipHistory(userId: string) {
    const records = await this.prisma.userSubscriptionMembershipHistory.findMany({
      where: { userId, entryId: null },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        cancellationReason: true,
        subscriptionId: true,
        subscription: {
          select: {
            id: true,
            slug: true,
            name: true,
            coverImage: true,
            logoUrl: true,
            currency: true,
            isDiscontinued: true,
            company: { select: { name: true, slug: true, brandColors: true } },
          },
        },
      },
    });

    // Group by subscription
    const grouped = new Map<string, { subscription: (typeof records)[0]['subscription']; records: Array<{ id: string; startDate: string | null; endDate: string | null; cancellationReason: string | null }> }>();
    for (const r of records) {
      const key = r.subscriptionId;
      if (!grouped.has(key)) {
        grouped.set(key, { subscription: r.subscription, records: [] });
      }
      grouped.get(key)!.records.push({ id: r.id, startDate: r.startDate, endDate: r.endDate, cancellationReason: r.cancellationReason });
    }
    return Array.from(grouped.values());
  }

  async removeOrphanedHistoryRecord(userId: string, historyId: string) {
    const record = await this.prisma.userSubscriptionMembershipHistory.findFirst({
      where: { id: historyId, userId, entryId: null },
    });
    if (!record) throw new NotFoundException('Orphaned history record not found');
    await this.prisma.userSubscriptionMembershipHistory.delete({ where: { id: historyId } });
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
    }).then(async (updated) => {
      this.crowdStatsService.decrementSubscriberCount(sub.id).catch(() => {});
      // Write membership history record for this completed period
      await this.prisma.userSubscriptionMembershipHistory.create({
        data: {
          userId,
          subscriptionId: sub.id,
          entryId: entry.id,
          startDate: entry.startDate ?? null,
          endDate: dto.cancellationDate ?? new Date().toISOString().slice(0, 10),
          cancellationReason: dto.cancellationReason ?? null,
        },
      }).catch(() => {});
      return updated;
    });
  }

  async removeMySubscription(
    userId: string,
    slug: string,
    opts: { removeBooks: boolean; removeSpending: boolean; historyId?: string; removeAllPeriods?: boolean; removeCurrentOnly?: boolean },
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
      // Determine which months to target based on period selection
      let monthFilter: { year: number; month: number }[] | null = null;

      if (opts.historyId && !opts.removeAllPeriods) {
        // Remove books only from months within the selected history period's date range
        const historyRecord = await this.prisma.userSubscriptionMembershipHistory.findFirst({
          where: { id: opts.historyId, userId },
        });
        if (historyRecord?.startDate || historyRecord?.endDate) {
          // Parse range
          const rangeStart = historyRecord.startDate
            ? (() => { const p = historyRecord.startDate.split('-').map(Number); return { year: p[0], month: p[1] }; })()
            : null;
          const rangeEnd = historyRecord.endDate
            ? (() => { const p = historyRecord.endDate.split('-').map(Number); return { year: p[0], month: p[1] }; })()
            : null;

          // Find subscription months in this range
          const monthsInRange = await this.prisma.subscriptionMonth.findMany({
            where: {
              subscriptionId: sub.id,
              ...(rangeStart || rangeEnd ? {
                AND: [
                  ...(rangeStart ? [{ OR: [{ year: { gt: rangeStart.year } }, { year: rangeStart.year, month: { gte: rangeStart.month } }] }] : []),
                  ...(rangeEnd ? [{ OR: [{ year: { lt: rangeEnd.year } }, { year: rangeEnd.year, month: { lte: rangeEnd.month } }] }] : []),
                ],
              } : {}),
            },
            select: { id: true },
          });

          // Delete book entries that came from these months (via purchaseGroup or matching month metadata)
          // We match by the month's books' editionIds linked to UserBookEntry for this user+subscription
          const monthIds = monthsInRange.map(m => m.id);
          if (monthIds.length > 0) {
            // Get editions from these months
            const monthBooks = await this.prisma.subscriptionMonthBook.findMany({
              where: { monthId: { in: monthIds }, editionId: { not: null } },
              select: { editionId: true, bookId: true },
            });
            const editionIds = monthBooks.map(mb => mb.editionId).filter((id): id is string => id != null);
            const bookIds = monthBooks.map(mb => mb.bookId);

            const affectedEntries = await this.prisma.userBookEntry.findMany({
              where: {
                userId,
                subscriptionEntryId: entry.id,
                OR: [
                  ...(editionIds.length ? [{ editionId: { in: editionIds } }] : []),
                  { bookId: { in: bookIds } },
                ],
                purchaseGroupId: { not: null },
              },
              select: { id: true, purchaseGroupId: true },
            });
            const groupIds = [...new Set(affectedEntries.map(e => e.purchaseGroupId as string))];

            await this.prisma.userBookEntry.deleteMany({
              where: {
                userId,
                subscriptionEntryId: entry.id,
                OR: [
                  ...(editionIds.length ? [{ editionId: { in: editionIds } }] : []),
                  { bookId: { in: bookIds } },
                ],
              },
            });

            if (groupIds.length > 0) {
              await this.prisma.userPurchaseGroup.deleteMany({
                where: { id: { in: groupIds }, bookEntries: { none: {} } },
              });
            }
          }
        }
      } else {
        // Remove ALL books linked to this subscription entry
        const affectedEntries = await this.prisma.userBookEntry.findMany({
          where: { userId, subscriptionEntryId: entry.id, purchaseGroupId: { not: null } },
          select: { purchaseGroupId: true },
        });
        const groupIds = [...new Set(affectedEntries.map((e) => e.purchaseGroupId as string))];

        await this.prisma.userBookEntry.deleteMany({
          where: { userId, subscriptionEntryId: entry.id },
        });

        if (groupIds.length > 0) {
          await this.prisma.userPurchaseGroup.deleteMany({
            where: { id: { in: groupIds }, bookEntries: { none: {} } },
          });
        }
      }
    }

    // If removing only a specific history period (not the whole entry), just delete the history record
    if (opts.historyId && !opts.removeAllPeriods) {
      await this.prisma.userSubscriptionMembershipHistory.deleteMany({
        where: { id: opts.historyId, userId },
      });
      return { success: true };
    }

    // If removing only the current active period (keep historical records)
    if (opts.removeCurrentOnly) {
      // Detach history records from the entry (set entryId = null) so they survive entry deletion
      await this.prisma.userSubscriptionMembershipHistory.updateMany({
        where: { entryId: entry.id, userId },
        data: { entryId: null },
      });
    }

    // Delete skip state for this subscription (no FK cascade, must be explicit)
    await this.prisma.userSubscriptionSkipState.deleteMany({
      where: { userId, subscriptionId: sub.id },
    });

    // Decrement subscriber count if the entry was still active when removed
    if (entry.active) {
      this.crowdStatsService.decrementSubscriberCount(sub.id).catch(() => {});
    }

    // Delete entry (cascades: billing periods, cost changes, fee templates, skip records, tags)
    // History records that were detached (entryId=null) will survive
    await this.prisma.userSubscriptionEntry.delete({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    return { success: true };
  }

  async updateMyEntryCosts(
    userId: string,
    slug: string,
    dto: { basePrice?: string; shippingCost?: string; costCurrency?: string; linkedFeeTemplates?: Array<{ templateId: string; customAmount?: number; customCurrency?: string }> },
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
        ...(dto.costCurrency !== undefined && { costCurrency: dto.costCurrency }),
        ...('trackingNumber' in dto && { trackingNumber: dto.trackingNumber ?? null }),
      },
    });

    // Propagate currency to book entries that are missing it
    if (dto.costCurrency) {
      // costCurrency is now tracked at the subscription entry level only
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

    // If re-joining a previously cancelled entry, archive the old period (if not already in history)
    if (existing && !existing.active) {
      const alreadyArchived = await this.prisma.userSubscriptionMembershipHistory.findFirst({
        where: { entryId: existing.id, endDate: existing.cancellationDate ?? undefined },
      });
      if (!alreadyArchived) {
        await this.prisma.userSubscriptionMembershipHistory.create({
          data: {
            userId,
            subscriptionId: sub.id,
            entryId: existing.id,
            startDate: existing.startDate ?? null,
            endDate: existing.cancellationDate ?? null,
            cancellationReason: existing.cancellationReason ?? null,
          },
        }).catch(() => {});
      }
    }

    // Parse cancellationDate (for historical cancelled entries)
    let cancellationDateObj: Date | null = null;
    if (dto.alreadyCancelled && dto.cancellationDate) {
      const parts = dto.cancellationDate.split('-').map(Number);
      cancellationDateObj = new Date(parts[0], parts[1] - 1, parts[2] ?? 1);
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
        active: !dto.alreadyCancelled,
        startDate: startDateStr,
        basePrice: dto.basePrice ? parseFloat(dto.basePrice) : null,
        shippingCost: dto.shippingCost ? parseFloat(dto.shippingCost) : null,
        costCurrency: dto.costCurrency ?? (sub as any).currency ?? 'EUR',
        renewalDay,
        ...(dto.alreadyCancelled && {
          cancellationDate: dto.cancellationDate ?? new Date().toISOString().slice(0, 10),
          cancellationReason: dto.cancellationReason ?? null,
        }),
      },
      update: {
        active: !dto.alreadyCancelled,
        cancellationDate: dto.alreadyCancelled
          ? (dto.cancellationDate ?? new Date().toISOString().slice(0, 10))
          : null,
        cancellationReason: dto.alreadyCancelled ? (dto.cancellationReason ?? null) : null,
        startDate: startDateStr ?? undefined,
        basePrice: dto.basePrice !== undefined ? (dto.basePrice === '' ? null : parseFloat(dto.basePrice)) : undefined,
        shippingCost: dto.shippingCost !== undefined ? (dto.shippingCost === '' ? null : parseFloat(dto.shippingCost)) : undefined,
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

    // Compute eligible past months: from startDate+1 (or startDate if signupIncludesCurrentMonth) to cancellationDate month (or current month)
    const isCombo = (sub as any).isCombo as boolean;
    const componentIds = (sub as any).componentIds as string[];
    const signupIncludesCurrentMonth = (sub as any).signupIncludesCurrentMonth as boolean;

    // If this sub is a variant of a content stream, months live on the parent.
    // Also clamp startDate to the subscription's own startDate (earliest it could have existed).
    // This applies to variants, combos, and regular subs alike — a user shouldn't backfill
    // before the subscription was launched.
    const parentSubscriptionId = (sub as any).parentSubscriptionId as string | null;
    const variantDbStartDate = (sub as any).startDate as Date | null;
    // Effective user start: max(user-provided startDate, subscription's own startDate)
    let effectiveStartDateObj = startDateObj;
    if (variantDbStartDate) {
      if (!effectiveStartDateObj || variantDbStartDate > effectiveStartDateObj) {
        effectiveStartDateObj = variantDbStartDate;
      }
    }
    const monthsSubscriptionId = parentSubscriptionId ?? sub.id;

    const eligibleMonths = isCombo
      ? await this.getComboEligibleMonths(componentIds, effectiveStartDateObj, cancellationDateObj, signupIncludesCurrentMonth)
      : await this.getEligibleMonths(monthsSubscriptionId, effectiveStartDateObj, cancellationDateObj, signupIncludesCurrentMonth);

    // If paymentOnStartup and NOT already cancelled: register the first upcoming month's books as preorders
    // (only for non-combo subscriptions — combos have no own SubscriptionMonth records)
    const paymentOnStartup = (sub as any).paymentOnStartup as boolean;
    if (paymentOnStartup && startDateObj && !isCombo && !dto.alreadyCancelled) {
      await this.recordFirstMonthAsPreorder(entry.id, userId, sub.id, startDateObj, entry, signupIncludesCurrentMonth);
    }

    // Persist nextRenewalDate (will be null for cancelled entries)
    await refreshNextRenewalDate(this.prisma, entry.id);
    // Backfill past renewal history for calendar display (fire-and-forget)
    backfillRenewalHistory(this.prisma, entry.id).catch(() => {});
    // Update subscriber count snapshot (fire-and-forget, skip for already-cancelled historical entries)
    if (!dto.alreadyCancelled) {
      this.crowdStatsService.incrementSubscriberCount(sub.id).catch(() => {});
    }

    return { entry, eligibleMonths };
  }

  private async getEligibleMonths(subscriptionId: string, startDateObj: Date | null, endDateObj?: Date | null, signupIncludesCurrentMonth = false) {
    if (!startDateObj) return [];

    const now = new Date();
    // Use endDate if provided (cancelled subscription), otherwise current month
    const limitDate = endDateObj ?? now;
    const limitYear = limitDate.getFullYear();
    const limitMonth = limitDate.getMonth() + 1;

    // First eligible month: if signupIncludesCurrentMonth=true → same month as startDate, otherwise next month
    const firstEligibleDate = signupIncludesCurrentMonth
      ? new Date(startDateObj.getFullYear(), startDateObj.getMonth(), 1)
      : new Date(startDateObj.getFullYear(), startDateObj.getMonth() + 1, 1);
    const startYear = firstEligibleDate.getFullYear();
    const startMonth = firstEligibleDate.getMonth() + 1;

    // If startDate is at or after limit month → nothing to backfill
    if (startYear > limitYear || (startYear === limitYear && startMonth > limitMonth)) {
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
              { year: { lt: limitYear } },
              { year: limitYear, month: { lte: limitMonth } },
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
                  include: { ...bookAuthorsInclude },
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
   * Returns eligible past months for a combo subscription.
   * Each entry is a synthetic month (no real DB ID) aggregating books from
   * ALL component subscriptions' months for the same year/month slot.
   * Synthetic ID format: `COMBO_${year}_${month}` (no colons to avoid key-parsing issues).
   */
  private async getComboEligibleMonths(componentIds: string[], startDateObj: Date | null, endDateObj?: Date | null, signupIncludesCurrentMonth = false) {
    if (!startDateObj || componentIds.length === 0) return [];

    const now = new Date();
    const limitDate = endDateObj ?? now;
    const limitYear = limitDate.getFullYear();
    const limitMonth = limitDate.getMonth() + 1;

    // Respect signupIncludesCurrentMonth (same logic as getEligibleMonths):
    // if false → first eligible month is startDate+1 month, if true → startDate month is included
    const firstEligibleDate = signupIncludesCurrentMonth
      ? new Date(startDateObj.getFullYear(), startDateObj.getMonth(), 1)
      : new Date(startDateObj.getFullYear(), startDateObj.getMonth() + 1, 1);
    const startYear = firstEligibleDate.getFullYear();
    const startMonth = firstEligibleDate.getMonth() + 1;

    if (startYear > limitYear || (startYear === limitYear && startMonth > limitMonth)) {
      return [];
    }

    const componentMonths = await this.prisma.subscriptionMonth.findMany({
      where: {
        subscriptionId: { in: componentIds },
        AND: [
          {
            OR: [
              { year: { gt: startYear } },
              { year: startYear, month: { gte: startMonth } },
            ],
          },
          {
            OR: [
              { year: { lt: limitYear } },
              { year: limitYear, month: { lte: limitMonth } },
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
                  include: { ...bookAuthorsInclude },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    // Group by year/month, merge books (deduplicate by editionId)
    const grouped = new Map<string, { year: number; month: number; booksMap: Map<string, (typeof componentMonths)[0]['books'][0]> }>();
    for (const m of componentMonths) {
      const key = `${m.year}_${m.month}`;
      if (!grouped.has(key)) {
        grouped.set(key, { year: m.year, month: m.month, booksMap: new Map() });
      }
      for (const b of m.books) {
        if (b.editionId && !grouped.get(key)!.booksMap.has(b.editionId)) {
          grouped.get(key)!.booksMap.set(b.editionId, b);
        }
      }
    }

    return Array.from(grouped.entries())
      .sort(([, a], [, b]) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .map(([, { year, month, booksMap }]) => ({
        id: `COMBO_${year}_${month}`,
        year,
        month,
        theme: null as string | null,
        series: null as { id: string; name: string; slug: string } | null,
        books: Array.from(booksMap.values()),
        isComboMonth: true,
      }));
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
    entry: { id: string; renewalDay: number | null; basePrice: unknown; shippingCost: unknown; costCurrency: string | null; feeTemplates?: unknown[] },
    signupIncludesCurrentMonth = false,
  ) {
    const startYear = startDateObj.getFullYear();
    const startMonth = startDateObj.getMonth() + 1;
    const joinDay = startDateObj.getDate();
    const renewalDay = entry.renewalDay ?? 1;

    // If signupIncludesCurrentMonth: signup month is always the first paid month.
    // Otherwise: if renewalDay has already passed this month, start from next month.
    const renewalPassedThisMonth = !signupIncludesCurrentMonth && renewalDay < joinDay;
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
      userId: string; feeTemplateId?: string | null; name: string; amount: number;
      currency: string; date: Date; category: any; purchaseGroupId: string;
    }[] = [];

    // Create ONE purchase group for this billing period
    const group = await this.prisma.userPurchaseGroup.create({
      data: {
        userId,
        fromSubscription: true,
        subscriptionEntryId: entryId,
        totalAmount: entry.basePrice ? parseFloat((entry.basePrice as any).toString()) : 0,
        shippingAmount: entry.shippingCost ? parseFloat((entry.shippingCost as any).toString()) : null,
        currency: entry.costCurrency ?? 'USD',
        purchasedAt: purchaseDate,
        title: `Subscription – ${firstMonth.year}/${String(firstMonth.month).padStart(2, '0')}`,
      },
    });

    for (const mb of monthBooks) {
      try {
        await this.upsertSubscriptionBookEntry({
          userId,
          bookId: mb.bookId!,
          editionId: mb.editionId!,
          subscriptionEntryId: entryId,
          purchaseGroupId: group.id,
          signatureType: mb.signatureType ?? firstMonth.signatureType ?? null,
          changedAt: startDateObj,
        });

      } catch {
        // skip if already exists
      }
    }

    // Fee templates once per purchase group
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
   * Upsert a subscription book entry: if the entry already exists link it to the purchase group,
   * otherwise create it (PREORDER) and record ownership history with the correct date.
   */
  private async upsertSubscriptionBookEntry(opts: {
    userId: string;
    bookId: string;
    editionId: string;
    subscriptionEntryId: string;
    purchaseGroupId: string;
    signatureType: $Enums.SignatureType | null;
    changedAt: Date;
  }): Promise<void> {
    const existing = await this.prisma.userBookEntry.findFirst({
      where: { userId: opts.userId, editionId: opts.editionId, subscriptionEntryId: opts.subscriptionEntryId },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.userBookEntry.update({
        where: { id: existing.id },
        data: { purchaseGroupId: opts.purchaseGroupId },
      });
      return;
    }
    await this.prisma.userBookEntry.create({
      data: {
        userId: opts.userId,
        bookId: opts.bookId,
        editionId: opts.editionId,
        ownershipStatus: 'PREORDER',
        readingStatus: 'UNREAD',
        subscriptionEntryId: opts.subscriptionEntryId,
        purchaseGroupId: opts.purchaseGroupId,
        signatureType: opts.signatureType,
      },
    }).then(created =>
      this.prisma.ownershipStatusHistory.create({
        data: { userBookEntryId: created.id, status: 'PREORDER', changedAt: opts.changedAt },
      }).catch(() => {}),
    );
  }

  async backfillSubscription(userId: string, slug: string, dto: BackfillSubscriptionDto) {
    const sub = await this.findBySlug(slug);
    const isCombo = (sub as any).isCombo as boolean;
    const componentIds = (sub as any).componentIds as string[];

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

    // Pre-load settings history for per-month resolution (avoids DB calls in the loop)
    const settingsHistory = await this.prisma.subscriptionSettingsHistory.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { effectiveFrom: 'desc' },
    });
    const fallbackSettings: SubscriptionSettings = {
      renewalDay: (sub as any).renewalDay ?? null,
      renewalDayUserSet: (sub as any).renewalDayUserSet ?? false,
      paymentOnStartup: (sub as any).paymentOnStartup ?? false,
      signupIncludesCurrentMonth: (sub as any).signupIncludesCurrentMonth ?? true,
      renewalMonthOffset: (sub as any).renewalMonthOffset ?? 0,
    };

    // Pre-process billing batches into a map: monthId → { batch, batchIndex }
    const batchByMonthId = new Map<string, { batch: BackfillBillingBatchDto; batchIndex: number }>();
    if (dto.billingBatches?.length) {
      dto.billingBatches.forEach((batch, idx) => {
        batch.monthIds.forEach(mid => batchByMonthId.set(mid, { batch, batchIndex: idx }));
      });
    }
    // Track created billing period IDs by batch index (to reuse within same batch)
    const billingPeriodIdByBatch = new Map<number, string>();

    let booksAdded = 0;
    let skipsRecorded = 0;

    // ── Combo path ────────────────────────────────────────────────────────────
    if (isCombo) {
      // Server-side validation: only accept IDs that are in the computed eligible set
      const startDateObj = entry.startDate ? (() => {
        const parts = entry.startDate.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2] ?? 1);
      })() : null;
      const cancellationDateObj = entry.cancellationDate ? (() => {
        const parts = entry.cancellationDate.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2] ?? 1);
      })() : null;
      const eligibleComboMonths = await this.getComboEligibleMonths(componentIds, startDateObj, cancellationDateObj, fallbackSettings.signupIncludesCurrentMonth);
      const eligibleIds = new Set(eligibleComboMonths.map(m => m.id));

      const validComboIds = dto.selectedMonthIds.filter(id => eligibleIds.has(id));

      const fallbackBase = entry.basePrice ? parseFloat(entry.basePrice.toString()) : 0;
      const comboSubCurrency = (sub as any).currency as string ?? 'EUR';
      const comboEntryCostCurrency = entry.costCurrency ?? comboSubCurrency;
      const comboPriceHistoryApplies = comboEntryCostCurrency === comboSubCurrency;
      const subPriceChanges = comboPriceHistoryApplies
        ? await this.prisma.subscriptionPriceChange.findMany({
            where: { subscriptionId: sub.id },
            orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
          })
        : [];
      const feesToCreate: {
        userId: string; feeTemplateId?: string | null; name: string; amount: number;
        currency: string; date: Date; category: any; purchaseGroupId: string;
      }[] = [];
      const discountsToCreate: {
        userId: string; name: string; amount: number; currency: string;
        date: Date; purchaseGroupId: string; billingPeriodId?: string;
      }[] = [];

      // paymentOnStartup: find the earliest selected combo month so we can
      // assign entry.startDate as its purchase date (same logic as regular path).
      // Use fallbackSettings (subscription-level setting at backfill time — resolved per-month in loop)
      const comboPaymentOnStartup = fallbackSettings.paymentOnStartup;
      let earliestComboId: string | null = null;
      if (comboPaymentOnStartup && entry.startDate) {
        let earliestYear = Infinity; let earliestMonth = Infinity;
        for (const comboId of validComboIds) {
          const parts = comboId.split('_');
          const y = parseInt(parts[1]); const m = parseInt(parts[2]);
          if (y < earliestYear || (y === earliestYear && m < earliestMonth)) {
            earliestYear = y; earliestMonth = m; earliestComboId = comboId;
          }
        }
      }

      for (const comboId of validComboIds) {
        // Parse year/month from synthetic ID: COMBO_YEAR_MONTH
        const parts = comboId.split('_');
        const year = parseInt(parts[1]);
        const month = parseInt(parts[2]);

        // Fetch books from all component months for this year/month
        const componentMonths = await this.prisma.subscriptionMonth.findMany({
          where: { subscriptionId: { in: componentIds }, year, month },
          select: { books: { select: { bookId: true, editionId: true, signatureType: true } } },
        });
        // Deduplicate books by editionId
        const bookMap = new Map<string, { bookId: string; editionId: string; signatureType: $Enums.SignatureType | null }>();
        for (const m of componentMonths) {
          for (const b of m.books) {
            if (b.editionId && b.bookId && !bookMap.has(b.editionId)) {
              bookMap.set(b.editionId, { bookId: b.bookId, editionId: b.editionId, signatureType: b.signatureType });
            }
          }
        }
        const monthBooks = Array.from(bookMap.values());
        if (monthBooks.length === 0) continue;

        const comboSettings = resolveEffectiveSettings(settingsHistory, year, month, fallbackSettings);
        const comboOffset: number = comboSettings.renewalMonthOffset;
        const comboRenewalDay = entry.renewalDay ?? comboSettings.renewalDay ?? 1;
        const renewalDate = (earliestComboId === comboId && entry.startDate)
          ? new Date(entry.startDate)
          : (() => {
              const [ry, rm] = comboOffset === 0
                ? [year, month]
                : (() => {
                    let m = month - comboOffset; let y = year;
                    while (m <= 0) { m += 12; y--; }
                    while (m > 12) { m -= 12; y++; }
                    return [y, m] as [number, number];
                  })();
              return new Date(Date.UTC(ry, rm - 1, comboRenewalDay));
            })();
        const resolved = resolveEffectiveBasePrice(subPriceChanges, year, month, fallbackBase, entry.costCurrency);
        const basePrice = resolved.price ?? fallbackBase;

        const group = await this.prisma.userPurchaseGroup.create({
          data: {
            userId,
            fromSubscription: true,
            subscriptionEntryId: entry.id,
            totalAmount: basePrice,
            shippingAmount: entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null,
            currency: entry.costCurrency ?? 'USD',
            purchasedAt: renewalDate,
            title: `Subscription – ${year}/${String(month).padStart(2, '0')}`,
          },
        });

        for (const mb of monthBooks) {
          try {
            await this.upsertSubscriptionBookEntry({
              userId,
              bookId: mb.bookId,
              editionId: mb.editionId,
              subscriptionEntryId: entry.id,
              purchaseGroupId: group.id,
              signatureType: mb.signatureType,
              changedAt: renewalDate,
            });
            booksAdded++;
          } catch {
            // skip duplicates silently
          }
        }

        // Fee templates once per purchase group (not per book)
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
            purchaseGroupId: group.id,
          });
        }
      }

      if (feesToCreate.length > 0) {
        await this.prisma.userPurchaseFee.createMany({
          data: feesToCreate,
          skipDuplicates: true,
        });
      }

      if (discountsToCreate.length > 0) {
        await this.prisma.userPurchaseDiscount.createMany({
          data: discountsToCreate,
          skipDuplicates: true,
        });
      }

      // Auto-derive skipped months for combo: eligible months with books that were NOT selected.
      // Uses the same component month ID approach as recordSkip() so skip records are consistent.
      const subWithComboPolicy = await this.prisma.subscription.findUnique({
        where: { id: sub.id },
        include: { skipPolicy: true },
      });
      const comboPolicy = subWithComboPolicy?.skipPolicy ?? null;
      const selectedComboSet = new Set(dto.selectedMonthIds);
      const skippableComboMonths = eligibleComboMonths
        .filter(m => m.books.length > 0 && !selectedComboSet.has(m.id))
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

      let firstSkipDateInWindow: Date | null = null;
      let prevWindowKey: string | null = null;
      for (const m of skippableComboMonths) {
        // Resolve the real DB month ID from any component subscription (same as recordSkip)
        const compMonth = await this.prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: componentIds }, year: m.year, month: m.month },
          orderBy: { subscriptionId: 'asc' },
        });
        if (!compMonth) continue;

        const windowKey = this.computeWindowKeyForBackfill(comboPolicy, firstSkipDateInWindow, entry.startDate, m.year, m.month);
        // Detect window transition: reset so this month anchors the new window for subsequent iterations
        if (prevWindowKey !== null && windowKey !== prevWindowKey) {
          firstSkipDateInWindow = null;
        }
        prevWindowKey = windowKey;
        const comboSkipSettings = resolveEffectiveSettings(settingsHistory, m.year, m.month, fallbackSettings);
        const comboSkipRenewalDay = entry.renewalDay ?? comboSkipSettings.renewalDay ?? 1;
        const skippedAt = new Date(m.year, m.month - 1, comboSkipRenewalDay);

        await this.prisma.userSkipRecord.upsert({
          where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: compMonth.id } },
          create: { userId, userEntryId: entry.id, subscriptionMonthId: compMonth.id, windowKey, skippedAt },
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

      // Recompute skip state so counters reflect any newly recorded skips
      await this.skipPolicyEngine.recomputeSkipState(userId, sub.id);
      // Backfill past renewal history for calendar display
      backfillRenewalHistory(this.prisma, entry.id).catch(() => {});
      return { booksAdded, skipsRecorded };
    }

    // ── Regular (non-combo) path ──────────────────────────────────────────────
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

    // Load subscription price changes for historical pricing.
    // targetCurrency passed to resolveEffectiveBasePrice ensures multi-currency records are applied
    // correctly: if no records exist for the user's currency, their entered basePrice is preserved.
    const entryCostCurrency = entry.costCurrency ?? null;
    const subPriceChanges = await this.prisma.subscriptionPriceChange.findMany({
      where: { subscriptionId: sub.id },
      orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
    });
    const fallbackBase = entry.basePrice ? parseFloat(entry.basePrice.toString()) : 0;

    // If paymentOnStartup: the earliest selected month's books get purchaseDate = entry.startDate
    // Use fallbackSettings — the current setting is representative since we resolve per-month in the loop
    const paymentOnStartup = fallbackSettings.paymentOnStartup;
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
      userId: string; feeTemplateId?: string | null; name: string; amount: number;
      currency: string; date: Date; category: any; purchaseGroupId: string;
    }[] = [];
    const discountsToCreate: {
      userId: string; name: string; amount: number; currency: string;
      date: Date; purchaseGroupId: string; billingPeriodId?: string;
    }[] = [];

    for (const monthId of dto.selectedMonthIds) {
      const monthRecord = monthMap.get(monthId);
      if (!monthRecord) continue;

      const monthSettings = resolveEffectiveSettings(settingsHistory, monthRecord.year, monthRecord.month, fallbackSettings);
      const nonComboOffset: number = monthSettings.renewalMonthOffset;
      const monthRenewalDay = entry.renewalDay ?? monthSettings.renewalDay ?? 1;
      const renewalDate = (earliestMonthId === monthId && entry.startDate)
        ? new Date(entry.startDate)
        : (() => {
            const [ry, rm] = nonComboOffset === 0
              ? [monthRecord.year, monthRecord.month]
              : (() => {
                  let m = monthRecord.month - nonComboOffset; let y = monthRecord.year;
                  while (m <= 0) { m += 12; y--; }
                  while (m > 12) { m -= 12; y++; }
                  return [y, m] as [number, number];
                })();
            return new Date(Date.UTC(ry, rm - 1, monthRenewalDay));
          })();
      const monthBooks = monthRecord.books.filter(mb => mb.editionId && mb.bookId);

      const batchInfo = batchByMonthId.get(monthId);
      const batch = batchInfo?.batch;
      const batchIdx = batchInfo?.batchIndex;

      // Determine amounts
      const resolvedBase = resolveEffectiveBasePrice(subPriceChanges, monthRecord.year, monthRecord.month, fallbackBase, entryCostCurrency);
      const baseAmount = batch
        ? batch.baseAmount / batch.monthsCovered
        : (resolvedBase.price ?? fallbackBase);
      const shippingAmt = batch
        ? (batch.shippingAmount != null ? batch.shippingAmount / batch.monthsCovered : null)
        : (entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null);
      const purchasedAtDate = batch ? new Date(batch.billedAt) : renewalDate;

      // Create ONE purchase group per month
      const group = await this.prisma.userPurchaseGroup.create({
        data: {
          userId,
          fromSubscription: true,
          subscriptionEntryId: entry.id,
          totalAmount: baseAmount,
          shippingAmount: shippingAmt,
          currency: entry.costCurrency ?? 'USD',
          purchasedAt: purchasedAtDate,
          title: `Subscription – ${monthRecord.year}/${String(monthRecord.month).padStart(2, '0')}`,
        },
      });

      // Link to billing period if this month is part of a batch
      if (batch && batchIdx !== undefined) {
        let periodId = billingPeriodIdByBatch.get(batchIdx);
        if (!periodId) {
          const n = batch.monthsCovered;
          const sortedMonths = [...batch.monthIds].sort();
          const firstMonthId = sortedMonths[0];
          const firstMonthRec = monthRecords.find(m => m.id === firstMonthId) ?? monthRecord;
          const lastMonthId = sortedMonths[sortedMonths.length - 1];
          const lastMonthRec = monthRecords.find(m => m.id === lastMonthId) ?? monthRecord;

          const period = await this.prisma.userSubBillingPeriod.create({
            data: {
              entryId: entry.id,
              baseAmount: batch.baseAmount,
              shipping: batch.shippingAmount ?? null,
              monthsCovered: n,
              coveredFromYear: firstMonthRec.year,
              coveredFromMonth: firstMonthRec.month,
              coveredToYear: lastMonthRec.year,
              coveredToMonth: lastMonthRec.month,
              paidCurrency: batch.currency,
              billedAt: new Date(batch.billedAt),
            },
          });
          periodId = period.id;
          billingPeriodIdByBatch.set(batchIdx, periodId);
        }
        await this.prisma.userPurchaseGroup.update({
          where: { id: group.id },
          data: { billingPeriodId: periodId },
        });

        // Add batch-level fees to this purchase group (divided by N if same currency)
        if (batch.fees?.length) {
          for (const f of batch.fees) {
            feesToCreate.push({
              userId,
              name: f.name,
              amount: f.currency === batch.currency ? f.amount / batch.monthsCovered : f.amount,
              currency: f.currency,
              date: purchasedAtDate,
              category: 'OTHER' as any,
              purchaseGroupId: group.id,
            });
          }
        }

        // Add batch-level discounts to this purchase group (divided by N if same currency)
        if (batch.discounts?.length) {
          for (const d of batch.discounts) {
            discountsToCreate.push({
              userId,
              name: d.name,
              amount: d.currency === batch.currency ? d.amount / batch.monthsCovered : d.amount,
              currency: d.currency,
              date: purchasedAtDate,
              purchaseGroupId: group.id,
              billingPeriodId: periodId,
            });
          }
        }
      }

      for (const mb of monthBooks) {
        const override = dto.bookPrices?.find(bp => bp.monthId === monthId && bp.editionId === mb.editionId);
        if (override != null) {
          await this.prisma.userPurchaseGroup.update({
            where: { id: group.id },
            data: { totalAmount: override.price ?? 0 },
          });
        }

        try {
          await this.upsertSubscriptionBookEntry({
            userId,
            bookId: mb.bookId!,
            editionId: mb.editionId!,
            subscriptionEntryId: entry.id,
            purchaseGroupId: group.id,
            signatureType: mb.signatureType ?? monthRecord.signatureType ?? null,
            changedAt: renewalDate,
          });
          booksAdded++;
        } catch {
          // skip duplicates silently
        }
      }

      // Fee templates once per purchase group (not per book)
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
          date: purchasedAtDate,
          category: template.category,
          purchaseGroupId: group.id,
        });
      }
    }

    // Single batch insert for all fees
    if (feesToCreate.length > 0) {
      await this.prisma.userPurchaseFee.createMany({
        data: feesToCreate,
        skipDuplicates: true,
      });
    }

    // Single batch insert for all discounts
    if (discountsToCreate.length > 0) {
      await this.prisma.userPurchaseDiscount.createMany({
        data: discountsToCreate,
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

    const cancellationDateObj = entry.cancellationDate
      ? (() => {
          const parts = entry.cancellationDate.split('-').map(Number);
          return new Date(parts[0], parts[1] - 1, parts[2] ?? 1);
        })()
      : null;

    if (startDateObj) {
      const eligibleMonths = await this.getEligibleMonths(sub.id, startDateObj, cancellationDateObj);
      const skippableMonths = eligibleMonths
        .filter(m => m.books.length > 0 && !selectedSet.has(m.id))
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

      let firstSkipDateInWindow: Date | null = null;
      let prevWindowKey: string | null = null;

      for (const m of skippableMonths) {
        const windowKey = this.computeWindowKeyForBackfill(policy, firstSkipDateInWindow, entry.startDate, m.year, m.month);
        // Detect window transition: reset so this month anchors the new window for subsequent iterations
        if (prevWindowKey !== null && windowKey !== prevWindowKey) {
          firstSkipDateInWindow = null;
        }
        prevWindowKey = windowKey;
        const skipSettings = resolveEffectiveSettings(settingsHistory, m.year, m.month, fallbackSettings);
        const skipRenewalDay = entry.renewalDay ?? skipSettings.renewalDay ?? 1;
        const skippedAt = new Date(m.year, m.month - 1, skipRenewalDay);

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

  async updateMyBillingMode(userId: string, slug: string, dto: UpdateBillingModeDto) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { userId_subscriptionId: { userId, subscriptionId: sub.id } },
    });
    if (!entry) throw new NotFoundException('Subscription entry not found');

    if (dto.scheduledPrepayOptionId) {
      const option = await this.prisma.subscriptionPrepayOption.findFirst({
        where: { id: dto.scheduledPrepayOptionId, subscriptionId: sub.id },
      });
      if (!option) throw new BadRequestException('Invalid prepay option');
    }

    await this.prisma.userSubscriptionEntry.update({
      where: { id: entry.id },
      data: { scheduledPrepayOptionId: dto.scheduledPrepayOptionId },
    });

    return { ok: true };
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
    const sub = await findBySlugOrThrow(this.prisma.subscription, subscriptionSlug, 'Subscription');

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
    const sub = await findBySlugOrThrow(this.prisma.subscription, subscriptionSlug, 'Subscription');

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
    const sub = await findBySlugOrThrow(this.prisma.subscription, subscriptionSlug, 'Subscription');

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

    // Try to read from DB snapshot first (calculated by cron every 3 days)
    const snapshot = await this.prisma.subscriptionCountryFeeSnapshot.findUnique({
      where: { subscriptionId_country: { subscriptionId: subscription.id, country: country.toUpperCase() } },
    });

    if (snapshot) {
      const data = snapshot.data as unknown as CountryFeeHint[];
      this.countryFeeCache.set(key, { data, expiresAt: Date.now() + 3_600_000 }); // 1h L1 cache
      return data;
    }

    // Fallback: live aggregation (snapshot not yet calculated — first visit before first cron run)
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

    this.countryFeeCache.set(key, { data, expiresAt: Date.now() + 3_600_000 }); // 1h TTL (fallback path)
    return data;
  }

  async importMonthsFromVariant(parentSlug: string, variantSlug: string) {
    const parent = await this.findBySlug(parentSlug);
    const variant = await this.findBySlug(variantSlug);

    if (variant.parentSubscriptionId !== parent.id) {
      throw new Error(`${variantSlug} is not a variant of ${parentSlug}`);
    }

    const { count } = await this.prisma.subscriptionMonth.updateMany({
      where: { subscriptionId: variant.id },
      data: { subscriptionId: parent.id },
    });

    // Bust cache for both
    await this.cache.del(this.subSlugKey(parentSlug));
    await this.cache.del(this.subSlugKey(variantSlug));

    return { migratedCount: count };
  }

  async listPriceChanges(slug: string) {
    const sub = await this.findBySlug(slug);
    return this.prisma.subscriptionPriceChange.findMany({
      where: {
        subscriptionId: sub.id,
        NOT: { effectiveYear: 1900 }, // sentinel record is internal; not shown in the list
      },
      orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
    });
  }

  async createPriceChange(slug: string, dto: CreatePriceChangeDto) {
    const sub = await this.findBySlug(slug);
    const result = await this.prisma.subscriptionPriceChange.upsert({
      where: {
        subscriptionId_effectiveYear_effectiveMonth_currency: {
          subscriptionId: sub.id,
          effectiveYear: dto.effectiveYear,
          effectiveMonth: dto.effectiveMonth,
          currency: dto.currency,
        },
      },
      create: {
        subscriptionId: sub.id,
        effectiveMonth: dto.effectiveMonth,
        effectiveYear: dto.effectiveYear,
        newBasePrice: dto.newBasePrice,
        currency: dto.currency,
        notes: dto.notes ?? null,
      },
      update: {
        newBasePrice: dto.newBasePrice,
        currency: dto.currency,
        notes: dto.notes ?? null,
      },
    });
    await this.cache.del(this.subSlugKey(slug));
    return result;
  }

  async deletePriceChange(slug: string, id: string) {
    const sub = await this.findBySlug(slug);
    const change = await this.prisma.subscriptionPriceChange.findUnique({ where: { id } });
    if (!change) throw new NotFoundException('Price change not found');
    if (change.subscriptionId !== sub.id) throw new ForbiddenException();
    if (change.effectiveYear === 1900 && change.effectiveMonth === 1) {
      throw new BadRequestException('Cannot delete the initial price record. Update the subscription price instead.');
    }
    await this.prisma.subscriptionPriceChange.delete({ where: { id } });
    await this.cache.del(this.subSlugKey(slug));
  }

  private async indexSubscription(subscriptionId: string): Promise<void> {
    try {
      const sub = await this.prisma.subscription.findUnique({
        where: { id: subscriptionId },
        select: {
          id: true,
          slug: true,
          name: true,
          intervalMonths: true,
          isDiscontinued: true,
          isContentStream: true,
          company: { select: { name: true } },
        },
      });
      if (!sub) return;
      if (sub.isContentStream) {
        await this.typesense.deleteDocument('subscriptions', sub.id).catch(() => {});
        return;
      }
      await this.typesense.upsertDocument('subscriptions', {
        id: sub.id,
        slug: sub.slug,
        name: sub.name,
        companyName: sub.company?.name ?? '',
        type: formatIntervalForTypesense(sub.intervalMonths ?? 1),
        isDiscontinued: sub.isDiscontinued,
      });
    } catch (err) {
      this.logger.error(`Failed to index subscription ${subscriptionId}`, err);
    }
  }

  // ── Prepay Options CRUD ──────────────────────────────────────────────────────

  async getPrepayOptions(slug: string) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    return this.prisma.subscriptionPrepayOption.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { months: 'asc' },
    });
  }

  async createPrepayOption(slug: string, dto: CreatePrepayOptionDto) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    return this.prisma.subscriptionPrepayOption.create({
      data: {
        subscriptionId: sub.id,
        months: dto.months,
        price: dto.price,
        currency: dto.currency,
        label: dto.label ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      },
    });
  }

  async updatePrepayOption(slug: string, id: string, dto: UpdatePrepayOptionDto) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    const existing = await this.prisma.subscriptionPrepayOption.findUnique({ where: { id } });
    if (!existing || existing.subscriptionId !== sub.id) {
      throw new NotFoundException(`Prepay option '${id}' not found for subscription '${slug}'`);
    }
    return this.prisma.subscriptionPrepayOption.update({
      where: { id },
      data: {
        ...(dto.months !== undefined && { months: dto.months }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.label !== undefined && { label: dto.label ?? null }),
        ...(dto.validFrom !== undefined && { validFrom: dto.validFrom ? new Date(dto.validFrom) : null }),
        ...(dto.validUntil !== undefined && { validUntil: dto.validUntil ? new Date(dto.validUntil) : null }),
      },
    });
  }

  async deletePrepayOption(slug: string, id: string) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    const existing = await this.prisma.subscriptionPrepayOption.findUnique({ where: { id } });
    if (!existing || existing.subscriptionId !== sub.id) {
      throw new NotFoundException(`Prepay option '${id}' not found for subscription '${slug}'`);
    }
    return this.prisma.subscriptionPrepayOption.delete({ where: { id } });
  }

  async migrateMonths(slug: string, targetSubscriptionId: string) {
    const source = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');

    const target = await this.prisma.subscription.findUnique({ where: { id: targetSubscriptionId } });
    if (!target) throw new NotFoundException(`Target subscription '${targetSubscriptionId}' not found`);
    if (!target.isContentStream) throw new BadRequestException('Target subscription must be a content stream');
    if (target.companyId !== source.companyId) throw new BadRequestException('Source and target must belong to the same company');
    if (target.id === source.id) throw new BadRequestException('Source and target cannot be the same subscription');

    // Check for conflicting months (same year+month already exist in target)
    const sourceMonths = await this.prisma.subscriptionMonth.findMany({
      where: { subscriptionId: source.id },
      select: { year: true, month: true },
    });
    const targetMonths = await this.prisma.subscriptionMonth.findMany({
      where: { subscriptionId: target.id },
      select: { year: true, month: true },
    });
    const targetKeys = new Set(targetMonths.map(m => `${m.year}-${m.month}`));
    const conflicts = sourceMonths.filter(m => targetKeys.has(`${m.year}-${m.month}`));
    if (conflicts.length > 0) {
      throw new ConflictException(
        `Cannot migrate: target already has ${conflicts.length} conflicting month(s): ${conflicts.map(m => `${m.year}-${m.month}`).join(', ')}`
      );
    }

    const { count } = await this.prisma.subscriptionMonth.updateMany({
      where: { subscriptionId: source.id },
      data: { subscriptionId: target.id },
    });

    return { migratedCount: count, sourceId: source.id, targetId: target.id };
  }
}
