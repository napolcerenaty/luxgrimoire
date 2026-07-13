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
  UpdateSettingsHistoryEffectiveFromDto,
} from './subscriptions.dto';
import { generateSlugFromParts, generateSubscriptionSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { findBySlugOrThrow } from '../../common/prisma.utils';
import { computeNextRenewalDate, refreshNextRenewalDate, backfillRenewalHistory } from '../../common/utils/renewal-date.util';
import { SkipPolicyEngine } from '../skip-policy/skip-policy.engine';
import { RenewalCronService } from './renewal.cron';
import { CountryFeeSnapshotCronService } from './country-fee-snapshot.cron';
import { resolveEffectiveBasePrice, parseFirstBilledYearMonth } from './price-change.util';
import { resolveEffectiveSettings, SubscriptionSettings } from './subscription-settings.util';
import { CrowdStatsService } from '../crowd-stats/crowd-stats.service';
import { StatsService } from '../stats/stats.service';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';

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

/**
 * Compute the first eligible box month for a subscriber.
 * Mirrors the renewal-cycle logic used throughout joinSubscription / backfill.
 *
 *   joinDay >= renewalDay → renewal already happened → lastBillingMonth = joinMonth
 *   joinDay <  renewalDay → renewal hasn't happened  → lastBillingMonth = joinMonth - 1
 *   currentBoxMonth = lastBillingMonth + renewalMonthOffset
 *   signupIncludesCurrentMonth=true  → firstBox = currentBoxMonth
 *   signupIncludesCurrentMonth=false → firstBox = currentBoxMonth + 1
 */
export function computeFirstEligibleBoxMonth(
  joinDate: Date,
  renewalDay: number,
  renewalMonthOffset: number,
  signupIncludesCurrentMonth: boolean,
): { year: number; month: number } {
  const joinDay = joinDate.getDate();
  const renewalAlreadyHappened = joinDay >= renewalDay;

  let lastBillingMonth = joinDate.getMonth() + 1;
  let lastBillingYear = joinDate.getFullYear();
  if (!renewalAlreadyHappened) {
    lastBillingMonth -= 1;
    if (lastBillingMonth === 0) { lastBillingMonth = 12; lastBillingYear -= 1; }
  }

  let boxMonth = lastBillingMonth + renewalMonthOffset;
  let boxYear = lastBillingYear;
  while (boxMonth > 12) { boxMonth -= 12; boxYear += 1; }
  while (boxMonth < 1)  { boxMonth += 12; boxYear -= 1; }

  if (!signupIncludesCurrentMonth) {
    boxMonth += 1;
    if (boxMonth > 12) { boxMonth = 1; boxYear += 1; }
  }

  return { year: boxYear, month: boxMonth };
}

/**
 * Compute the last box month whose renewal has already processed as of the reference date.
 * Used for both the "today" upper limit and the cancellation-date upper limit.
 *
 *   refDay >= renewalDay → renewal has happened → lastBilledMonth = refMonth
 *   refDay <  renewalDay → renewal hasn't fired  → lastBilledMonth = refMonth - 1
 *   lastBoxMonth = lastBilledMonth + renewalMonthOffset
 */
export function computeLastProcessedBoxMonth(
  referenceDate: Date,
  renewalDay: number,
  renewalMonthOffset: number,
): { year: number; month: number } {
  const refDay = referenceDate.getDate();
  const renewalHappened = refDay >= renewalDay;

  let lastBilledMonth = referenceDate.getMonth() + 1;
  let lastBilledYear = referenceDate.getFullYear();
  if (!renewalHappened) {
    lastBilledMonth -= 1;
    if (lastBilledMonth === 0) { lastBilledMonth = 12; lastBilledYear -= 1; }
  }

  let boxMonth = lastBilledMonth + renewalMonthOffset;
  let boxYear = lastBilledYear;
  while (boxMonth > 12) { boxMonth -= 12; boxYear += 1; }
  while (boxMonth < 1)  { boxMonth += 12; boxYear -= 1; }

  return { year: boxYear, month: boxMonth };
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly skipPolicyEngine: SkipPolicyEngine,
    private readonly renewalCron: RenewalCronService,
    private readonly countryFeeSnapshotService: CountryFeeSnapshotCronService,
    private readonly uploadService: UploadService,
    private readonly crowdStatsService: CrowdStatsService,
    private readonly statsService: StatsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly mediaAssetsService?: MediaAssetsService,
    private readonly scheduledReminders?: ScheduledRemindersService,
  ) {}

  private mapCompanyAssets(company: any) {
    if (!company) return company;
    return {
      ...company,
      logoUrl: company.logoAsset?.publicId ?? company.logoUrl,
    };
  }

  private mapMonthAssets(month: any) {
    if (!month) return month;
    return {
      ...month,
      coverImage: month.coverImageAsset?.publicId ?? month.coverImage,
      spoilerImage: month.spoilerImageAsset?.publicId ?? month.spoilerImage,
    };
  }

  private mapSubscriptionAssets(subscription: any) {
    if (!subscription) return subscription;
    return {
      ...subscription,
      coverImage: subscription.coverImageAsset?.publicId ?? subscription.coverImage,
      logoUrl: subscription.logoAsset?.publicId ?? subscription.logoUrl,
      company: this.mapCompanyAssets(subscription.company),
      months: Array.isArray(subscription.months)
        ? subscription.months.map((month: any) => this.mapMonthAssets(month))
        : subscription.months,
    };
  }

  private readonly SUB_SLUG_TTL = 60_000; // 60 seconds (content is date-dynamic)
  private readonly subSlugKey = (slug: string) => `subscriptions:slug:${slug}`;

  // Months list changes ~1-2x/month → 24h cache with version-based invalidation
  private readonly SUB_MONTHS_TTL = 24 * 60 * 60 * 1000;
  private readonly subMonthsBustKey = (slug: string) => `subscriptions:months-bust:${slug}`;
  private readonly subMonthsKey = (slug: string, version: number, page: number, pageSize: number, all: boolean, ownOnly: boolean, fromYear?: number, fromMonth?: number, untilYear?: number, untilMonth?: number) =>
    `subscriptions:months:${slug}:v${version}:${page}:${pageSize}:${all}:${ownOnly}:${fromYear ?? ''}:${fromMonth ?? ''}:${untilYear ?? ''}:${untilMonth ?? ''}`;

  private async getMonthsCacheVersion(slug: string): Promise<number> {
    return (await this.cache.get<number>(this.subMonthsBustKey(slug))) ?? 0;
  }

  private async invalidateMonthsCache(slug: string): Promise<void> {
    await this.cache.set(this.subMonthsBustKey(slug), Date.now(), this.SUB_MONTHS_TTL);
  }


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
   *  Returns the sentinel price (year=1900) as "base price", or null if no records exist.
   *  When defaultCurrency is provided, only records matching that currency are considered. */
  private computeCurrentPrice(
    priceChanges: { effectiveYear: number; effectiveMonth: number; newBasePrice: { toString(): string }; currency: string }[],
    defaultCurrency?: string | null,
  ): string | null {
    if (!priceChanges.length) return null;
    const pool = defaultCurrency
      ? priceChanges.filter(pc => pc.currency === defaultCurrency)
      : priceChanges;
    if (!pool.length) return null;
    // Return the most recent explicit price change (excluding sentinel 1900-01).
    // Fall back to sentinel if no explicit change exists.
    const explicit = pool
      .filter(pc => pc.effectiveYear !== 1900)
      .sort((a, b) => b.effectiveYear !== a.effectiveYear ? b.effectiveYear - a.effectiveYear : b.effectiveMonth - a.effectiveMonth);
    const best = explicit[0] ?? pool.find(pc => pc.effectiveYear === 1900 && pc.effectiveMonth === 1);
    return best ? parseFloat(best.newBasePrice.toString()).toFixed(2) : null;
  }

  async create(dto: CreateSubscriptionDto) {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) throw new NotFoundException(`Company '${dto.companyId}' not found`);

    const slug = generateSubscriptionSlug(company.name, dto.name);
    const currency = dto.currency ?? 'EUR';
    const coverImageAsset = dto.coverImage ? await this.mediaAssetsService?.ensureForPublicId(dto.coverImage) : null;
    const logoAsset = dto.logoUrl ? await this.mediaAssetsService?.ensureForPublicId(dto.logoUrl) : null;
    const subscription = await (this.prisma.subscription as any).create({
      data: {
        slug,
        companyId: dto.companyId,
        name: dto.name,
        description: dto.description,
        coverImage: dto.coverImage,
        coverImageAssetId: coverImageAsset?.id ?? null,
        logoUrl: dto.logoUrl,
        logoAssetId: logoAsset?.id ?? null,
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
        renewalMonthOffset: dto.renewalMonthOffset ?? 0,
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

    // Auto-create sentinel settings history snapshot so resolveEffectiveSettings
    // always has a match, even for archival subscriptions backfilled before DB creation.
    await this.prisma.subscriptionSettingsHistory.create({
      data: {
        subscriptionId: subscription.id,
        effectiveFrom: new Date(0), // epoch = "was always like this"
        renewalDay: subscription.renewalDay ?? null,
        renewalDayUserSet: (subscription as any).renewalDayUserSet ?? false,
        paymentOnStartup: (subscription as any).paymentOnStartup ?? false,
        signupIncludesCurrentMonth: (subscription as any).signupIncludesCurrentMonth ?? false,
        renewalMonthOffset: (subscription as any).renewalMonthOffset ?? 0,
        changedBy: null,
        notes: 'Initial snapshot',
      },
    });

    // Set combo components
    if (dto.componentIds?.length) {
      await this.prisma.subscriptionComboComponent.createMany({
        data: dto.componentIds.map((componentId) => ({ comboId: subscription.id, componentId })),
        skipDuplicates: true,
      });
    }

    await this.indexSubscription(subscription.id);
    await this.cache.del(`companies:slug:${company.slug}`);
    return this.mapSubscriptionAssets({
      ...subscription,
      coverImageAsset: coverImageAsset
        ? { id: coverImageAsset.id, publicId: coverImageAsset.publicId }
        : null,
      logoAsset: logoAsset
        ? { id: logoAsset.id, publicId: logoAsset.publicId }
        : null,
    });
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
    if (query.skipPolicyType) {
      const billingType = query.skipPolicyBillingType;
      if (query.skipPolicyType === 'NONE') {
        if (billingType && billingType !== 'ALL') {
          where.skipPolicies = {
            some: { type: 'NONE', billingType: { in: [billingType, 'ALL'] } },
          };
        } else {
          // any billing type having a NONE policy
          where.skipPolicies = { some: { type: 'NONE' } };
        }
      } else {
        const policyFilter: Record<string, unknown> = { type: query.skipPolicyType };
        if (billingType && billingType !== 'ALL') {
          policyFilter['billingType'] = { in: [billingType, 'ALL'] };
        }
        where.skipPolicies = { some: policyFilter };
      }
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
      (this.prisma.subscription as any).findMany({
        where,
        skip,
        take: pageSize,
        include: {
          company: {
            select: {
              id: true,
              slug: true,
              name: true,
              logoUrl: true,
              logoAsset: { select: { id: true, publicId: true } },
              brandColors: true,
            },
          },
          skipPolicies: { select: { type: true, billingType: true } },
          comboComponents: { select: { componentId: true } },
          priceChanges: { where: { effectiveYear: 1900, effectiveMonth: 1 } },
          coverImageAsset: { select: { id: true, publicId: true } },
          logoAsset: { select: { id: true, publicId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    const mapped = data.map(({ comboComponents, priceChanges, ...rest }: any) => ({
      ...this.mapSubscriptionAssets(rest),
      price: this.computeCurrentPrice(priceChanges, (rest as any).currency),
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
      select: {
        id: true,
        name: true,
        companyId: true,
        coverImage: true,
        logoUrl: true,
        coverImageAsset: { select: { id: true, publicId: true } },
        logoAsset: { select: { id: true, publicId: true } },
      },
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
            logoAsset: { select: { id: true, publicId: true } },
            country: true,
            hasOfficialImagePermission: true,
            brandColors: true,
          },
        },
        skipPolicies: true,
        coverImageAsset: { select: { id: true, publicId: true } },
        logoAsset: { select: { id: true, publicId: true } },
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
                coverImageAsset: { select: { id: true, publicId: true } },
                parentSubscriptionId: true,
                startDate: true,
                endDate: true,
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
                    coverImageAsset: { select: { id: true, publicId: true } },
                    spoilerImageAsset: { select: { id: true, publicId: true } },
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
            coverImageAsset: { select: { id: true, publicId: true } },
            spoilerImageAsset: { select: { id: true, publicId: true } },
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
          coverImageAsset: { select: { id: true, publicId: true } },
          spoilerImageAsset: { select: { id: true, publicId: true } },
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

    // For combo subscriptions: if any component is a content stream variant,
    // its months live on the parent subscription — replace the empty months array.
    const processedComboComponents = await Promise.all(
      comboComponents.map(async (cc) => {
        const comp = cc.component as any;
        if (!comp.parentSubscriptionId) return cc;
        const andConds: Record<string, unknown>[] = [
          { OR: [{ year: { gt: nowYear } }, { year: nowYear, month: { gte: nowMonth } }] },
        ];
        if (comp.startDate) {
          const sy = (comp.startDate as Date).getFullYear();
          const sm = (comp.startDate as Date).getMonth() + 1;
          andConds.push({ OR: [{ year: { gt: sy } }, { year: sy, month: { gte: sm } }] });
        }
        if (comp.endDate) {
          const ey = (comp.endDate as Date).getFullYear();
          const em = (comp.endDate as Date).getMonth() + 1;
          andConds.push({ OR: [{ year: { lt: ey } }, { year: ey, month: { lte: em } }] });
        }
        const parentMonths = await this.prisma.subscriptionMonth.findMany({
          where: { subscriptionId: comp.parentSubscriptionId, AND: andConds },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            cardArtist: { select: { id: true, name: true, slug: true, instagram: true } },
            coverImageAsset: { select: { id: true, publicId: true } },
            spoilerImageAsset: { select: { id: true, publicId: true } },
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
        });
        return { ...cc, component: { ...comp, months: parentMonths } };
      }),
    );

    const sentinelRecord = priceChanges.find((pc) => pc.effectiveYear === 1900 && pc.effectiveMonth === 1 && pc.currency === rest.currency);
    return {
      ...this.mapSubscriptionAssets(rest),
      price: this.computeCurrentPrice(priceChanges, rest.currency),
      // Original price: the sentinel record's value — represents the price from the very beginning,
      // before any explicit price changes. Used by the frontend as a fallback when resolving
      // historical prices for months that predate the first explicit price change.
      originalBasePrice: sentinelRecord
        ? parseFloat(sentinelRecord.newBasePrice.toString()).toFixed(2)
        : this.computeCurrentPrice(priceChanges, rest.currency),
      months: months.map((month: any) => this.mapMonthAssets(month)),
      componentIds: comboComponents.map((c) => c.componentId),
      components: processedComboComponents.map((c) => ({
        componentId: c.componentId,
        component: this.mapSubscriptionAssets(c.component),
      })),
    };
  }

  async listSettingsHistory(slug: string) {
    const sub = await this.findBySlug(slug);
    return this.prisma.subscriptionSettingsHistory.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async updateSettingsHistoryEffectiveFrom(slug: string, recordId: string, dto: UpdateSettingsHistoryEffectiveFromDto) {
    const sub = await this.findBySlug(slug);
    const record = await this.prisma.subscriptionSettingsHistory.findFirst({
      where: { id: recordId, subscriptionId: sub.id },
    });
    if (!record) throw new NotFoundException('Settings history record not found');

    const isInitialSentinel = (record as any).effectiveFrom.getTime() === 0;
    const updateData: Record<string, unknown> = {};

    // effectiveFrom: editable only for non-sentinel records
    if (dto.effectiveFrom !== undefined) {
      if (isInitialSentinel) throw new BadRequestException('Cannot change effectiveFrom of the initial snapshot record');
      const newDate = new Date(dto.effectiveFrom);
      if (isNaN(newDate.getTime())) throw new BadRequestException('Invalid effectiveFrom date');
      updateData.effectiveFrom = newDate;
    }

    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.renewalDay !== undefined) updateData.renewalDay = dto.renewalDay;
    if (dto.renewalDayUserSet !== undefined) updateData.renewalDayUserSet = dto.renewalDayUserSet;
    if (dto.paymentOnStartup !== undefined) updateData.paymentOnStartup = dto.paymentOnStartup;
    if (dto.signupIncludesCurrentMonth !== undefined) updateData.signupIncludesCurrentMonth = dto.signupIncludesCurrentMonth;
    if (dto.renewalMonthOffset !== undefined) updateData.renewalMonthOffset = dto.renewalMonthOffset;

    if (Object.keys(updateData).length === 0) throw new BadRequestException('No fields to update');

    return this.prisma.subscriptionSettingsHistory.update({
      where: { id: recordId },
      data: updateData,
    });
  }

  async deleteSettingsHistory(slug: string, recordId: string) {
    const sub = await this.findBySlug(slug);
    const record = await this.prisma.subscriptionSettingsHistory.findFirst({
      where: { id: recordId, subscriptionId: sub.id },
    });
    if (!record) throw new NotFoundException('Settings history record not found');
    const isInitialSentinel = (record as any).effectiveFrom.getTime() === 0;
    if (isInitialSentinel) throw new BadRequestException('Cannot delete the initial snapshot record');
    return this.prisma.subscriptionSettingsHistory.delete({ where: { id: recordId } });
  }

  async update(slug: string, dto: UpdateSubscriptionDto, changedByUserId?: string) {
    const existing = await this.findBySlug(slug);
    const { componentIds, price, settingsEffectiveFrom, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.coverImage !== undefined) {
      const coverImageAsset = dto.coverImage ? await this.mediaAssetsService?.ensureForPublicId(dto.coverImage) : null;
      data.coverImageAssetId = coverImageAsset?.id ?? null;
    }
    if (dto.logoUrl !== undefined) {
      const logoAsset = dto.logoUrl ? await this.mediaAssetsService?.ensureForPublicId(dto.logoUrl) : null;
      data.logoAssetId = logoAsset?.id ?? null;
    }
    const updated = await (this.prisma.subscription as any).update({ where: { slug }, data });

    // Record settings history if any tracked field changed
    const settingsFields: (keyof SubscriptionSettings)[] = [
      'renewalDay', 'renewalDayUserSet', 'paymentOnStartup', 'signupIncludesCurrentMonth', 'renewalMonthOffset',
    ];
    const anySettingsChanged = settingsFields.some(
      f => dto[f as keyof UpdateSubscriptionDto] !== undefined && (dto as any)[f] !== (existing as any)[f],
    );
    if (anySettingsChanged) {
      if (!settingsEffectiveFrom) {
        throw new BadRequestException('settingsEffectiveFrom is required when changing renewal settings');
      }
      const effectiveFromDate = new Date(settingsEffectiveFrom);

      // If no history exists yet (subscription predates sentinel creation), insert
      // an epoch sentinel of the OLD settings first, so months before this change
      // resolve correctly instead of falling back to the new (post-change) settings.
      const existingHistory = await this.prisma.subscriptionSettingsHistory.count({
        where: { subscriptionId: updated.id },
      });
      if (existingHistory === 0) {
        await this.prisma.subscriptionSettingsHistory.create({
          data: {
            subscriptionId: updated.id,
            effectiveFrom: new Date(0),
            renewalDay: (existing as any).renewalDay ?? null,
            renewalDayUserSet: (existing as any).renewalDayUserSet ?? false,
            paymentOnStartup: (existing as any).paymentOnStartup ?? false,
            signupIncludesCurrentMonth: (existing as any).signupIncludesCurrentMonth ?? true,
            renewalMonthOffset: (existing as any).renewalMonthOffset ?? 0,
            changedBy: null,
            notes: 'Initial snapshot (auto-created on first settings change)',
          },
        });
      }
      await this.prisma.subscriptionSettingsHistory.create({
        data: {
          subscriptionId: updated.id,
          effectiveFrom: effectiveFromDate,
          renewalDay: updated.renewalDay ?? null,
          renewalDayUserSet: (updated as any).renewalDayUserSet ?? false,
          paymentOnStartup: (updated as any).paymentOnStartup ?? false,
          signupIncludesCurrentMonth: (updated as any).signupIncludesCurrentMonth ?? true,
          renewalMonthOffset: (updated as any).renewalMonthOffset ?? 0,
          changedBy: changedByUserId ?? null,
        },
      });

      // Auto-refresh nextRenewalDate for active entries whose upcoming renewal is ON or AFTER
      // effectiveFrom — those entries are affected by the new settings.
      // Entries whose nextRenewalDate is before effectiveFrom will be processed by the cron
      // before the new settings kick in, so they must be left unchanged.
      const affectedEntries = await this.prisma.userSubscriptionEntry.findMany({
        where: {
          subscriptionId: updated.id,
          active: true,
          OR: [
            { nextRenewalDate: { gte: effectiveFromDate } },
            { nextRenewalDate: null },
          ],
        },
        select: { id: true },
      });
      // Fire-and-forget; errors are logged but must not fail the settings save
      setImmediate(() => {
        Promise.all(affectedEntries.map(e => refreshNextRenewalDate(this.prisma, e.id)))
          .catch(err => this.logger.error({ err }, 'Auto-refresh of nextRenewalDate after settings change failed'));
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
    if (existing.company?.slug) {
      await this.cache.del(`companies:slug:${existing.company.slug}`);
    }
    return this.mapSubscriptionAssets(updated);
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

  async getMonths(slug: string, page = 1, pageSize = 12, all = false, ownOnly = false, fromYear?: number, fromMonth?: number, untilYear?: number, untilMonth?: number) {
    const version = await this.getMonthsCacheVersion(slug);
    const cacheKey = this.subMonthsKey(slug, version, page, pageSize, all, ownOnly, fromYear, fromMonth, untilYear, untilMonth);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

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

    if (untilYear != null) {
      const uy = untilYear;
      const um = untilMonth ?? 12;
      andConditions.push({
        OR: [{ year: { lt: uy } }, { year: uy, month: { lt: um } }],
      });
    }

    const where =
      andConditions.length > 0
        ? { subscriptionId: effectiveId, AND: andConditions }
        : { subscriptionId: effectiveId };

    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      (this.prisma.subscriptionMonth as any).findMany({
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
          coverImageAsset: { select: { id: true, publicId: true } },
          spoilerImage: true,
          spoilerImageAsset: { select: { id: true, publicId: true } },
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

    const result = {
      data: data.map((month: any) => this.mapMonthAssets(month)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
    await this.cache.set(cacheKey, result, this.SUB_MONTHS_TTL);
    return result;
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

    const coverImageAsset = dto.coverImage ? await this.mediaAssetsService?.ensureForPublicId(dto.coverImage) : null;
    const spoilerImageAsset = dto.spoilerImage ? await this.mediaAssetsService?.ensureForPublicId(dto.spoilerImage) : null;
    const monthData = {
      year: dto.year,
      month: dto.month,
      theme: dto.theme,
      coverImage: dto.coverImage,
      coverImageAssetId: coverImageAsset?.id ?? null,
      spoilerImage: dto.spoilerImage,
      spoilerImageAssetId: spoilerImageAsset?.id ?? null,
      isSpoiler: dto.isSpoiler ?? false,
      actualShipping: dto.actualShipping ? dto.actualShipping : undefined,
      boxPrice: dto.boxPrice ? dto.boxPrice : undefined,
      signatureType: dto.signatureType ?? null,
      cardArtistId: dto.cardArtistId ?? null,
    };

    const created = await this.prisma.subscriptionMonth.create({
      data: { subscriptionId: subscription.id, ...monthData },
    });

    void this.invalidateMonthsCache(subscriptionSlug);
    return this.mapMonthAssets({
      ...created,
      coverImageAsset: coverImageAsset
        ? { id: coverImageAsset.id, publicId: coverImageAsset.publicId }
        : null,
      spoilerImageAsset: spoilerImageAsset
        ? { id: spoilerImageAsset.id, publicId: spoilerImageAsset.publicId }
        : null,
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

    // Capture old publicIds before update (needed for cleanup after DB write)
    const oldCoverImage = dto.coverImage !== undefined && dto.coverImage !== existing.coverImage
      ? (existing.coverImage as string | null)
      : null;
    const oldSpoilerImage = dto.spoilerImage !== undefined && dto.spoilerImage !== existing.spoilerImage
      ? (existing.spoilerImage as string | null)
      : null;

    const data: Record<string, unknown> = {
      ...dto,
      cardArtistId: dto.cardArtistId === null ? null : dto.cardArtistId,
    };
    if (dto.coverImage !== undefined) {
      const coverImageAsset = dto.coverImage ? await this.mediaAssetsService?.ensureForPublicId(dto.coverImage) : null;
      data.coverImageAssetId = coverImageAsset?.id ?? null;
    }
    if (dto.spoilerImage !== undefined) {
      const spoilerImageAsset = dto.spoilerImage ? await this.mediaAssetsService?.ensureForPublicId(dto.spoilerImage) : null;
      data.spoilerImageAssetId = spoilerImageAsset?.id ?? null;
    }

    const updated = await (this.prisma.subscriptionMonth as any).update({
      where: { id: existing.id },
      data,
    });

    // After DB update, old assets may be unused — delete from media library + Cloudinary if so
    if (oldCoverImage) {
      void this.mediaAssetsService?.deleteIfUnused(oldCoverImage, this.uploadService);
    }
    if (oldSpoilerImage) {
      void this.mediaAssetsService?.deleteIfUnused(oldSpoilerImage, this.uploadService);
    }

    void this.invalidateMonthsCache(subscriptionSlug);
    return this.mapMonthAssets(updated);
  }

  async deleteMonth(subscriptionSlug: string, year: number, month: number) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: { subscriptionId: subscription.id, year, month },
      },
    });
    if (!existing) throw new NotFoundException(`Month ${month}/${year} not found`);

    await this.uploadService.deleteImages([existing.coverImage, existing.spoilerImage]);

    const deleted = await this.prisma.subscriptionMonth.delete({ where: { id: existing.id } });

    // Clean up orphaned media assets after record is deleted
    for (const publicId of [existing.coverImage, existing.spoilerImage]) {
      if (publicId) void this.mediaAssetsService?.deleteIfUnused(publicId as string, this.uploadService);
    }

    void this.invalidateMonthsCache(subscriptionSlug);
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

    // If attaching an existing edition that has no subscriptionId yet, backfill it now
    if (dto.editionId) {
      await this.prisma.bookEdition.updateMany({
        where: { id: dto.editionId, subscriptionId: null },
        data: { subscriptionId: subscription.id },
      });
    }

    // Retroactively add this book to users whose renewal for this month already occurred
    if (dto.bookId && dto.editionId) {
      this.renewalCron.retroactivelyAddBookForSubscribers(
        subscription.id,
        { id: monthRecord.id, year, month, signatureType: monthRecord.signatureType ?? null },
        { bookId: dto.bookId, editionId: dto.editionId, signatureType: (dto.signatureType as $Enums.SignatureType | null) ?? null },
      ).catch(() => {});
    }

    void this.invalidateMonthsCache(subscriptionSlug);
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

    const result = await this.prisma.subscriptionMonthBook.delete({
      where: { monthId_bookId: { monthId: monthRecord.id, bookId } },
    });
    void this.invalidateMonthsCache(subscriptionSlug);
    return result;
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

    const result = await this.prisma.subscriptionMonthBook.update({
      where: { monthId_bookId: { monthId: monthRecord.id, bookId } },
      data: { signatureType: dto.signatureType ?? null },
    });
    void this.invalidateMonthsCache(subscriptionSlug);
    return result;
  }

  async getMySubscriptionHistory(userId: string, slug: string) {
    const sub = await this.findBySlug(slug);
    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: { userId, subscriptionId: sub.id },
      select: {
        id: true,
        active: true,
        startDate: true,
        cancellationDate: true,
        cancellationReason: true,
      },
      orderBy: { startDate: 'asc' },
    });
    return entries;
  }

  async getMySubscriptionEntry(userId: string, slug: string) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: sub.id, active: true },
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

    // Use stored nextRenewalDate (computed by refreshNextRenewalDate which handles monthly + prepaid).
    // Lazy-backfill if not yet set.
    let storedRenewalDate = (entry as any).nextRenewalDate as Date | null;
    if (!storedRenewalDate && entry.active) {
      await refreshNextRenewalDate(this.prisma, entry.id);
      const fresh = await this.prisma.userSubscriptionEntry.findUnique({
        where: { id: entry.id },
        select: { nextRenewalDate: true },
      });
      storedRenewalDate = fresh?.nextRenewalDate ?? null;
    }

    const { skipRecords: _sr, ...entryWithoutSkips } = entry;
    return { ...entryWithoutSkips, nextRenewalDate: storedRenewalDate ? storedRenewalDate.toISOString() : null };
  }

  async getNextBoxPreview(userId: string, slug: string, year: number, month: number) {
    const sub = await this.findBySlug(slug);
    const subId = (sub as any).parentSubscriptionId ?? sub.id;
    const boxMonth = await this.prisma.subscriptionMonth.findUnique({
      where: { subscriptionId_year_month: { subscriptionId: subId, year, month } },
      select: {
        year: true,
        month: true,
        theme: true,
        isSpoiler: true,
        books: {
          select: {
            isMainBook: true,
            book: {
              select: {
                title: true,
                authors: { select: { author: { select: { name: true } } } },
              },
            },
            edition: {
              select: { additionalImages: true },
            },
          },
          orderBy: [{ isMainBook: 'desc' }, { sortOrder: 'asc' }],
        },
      },
    });
    if (!boxMonth) return null;
    return {
      year: boxMonth.year,
      month: boxMonth.month,
      theme: boxMonth.theme,
      isSpoiler: boxMonth.isSpoiler,
      books: boxMonth.books.map((b) => ({
        title: b.book.title,
        authors: b.book.authors.map((a) => a.author.name).join(', '),
        coverImage: b.edition?.additionalImages?.[0] ?? null,
        isMainBook: b.isMainBook,
      })),
    };
  }

  private computeNextRenewalDate(
    renewalDay: number,
    intervalMonths: number,
    startingMonth: number | null,
    userStartDate: string | null,
    skippedMonths: { year: number; month: number }[] = [],
    paidUpFrontDate: Date | null = null,
    subscriptionEarliestDate: Date | null = null,
  ): Date | null {
    return computeNextRenewalDate(renewalDay, intervalMonths, startingMonth, userStartDate, skippedMonths, paidUpFrontDate, subscriptionEarliestDate);
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
        isForwarding: true,
        scheduledPrepayOptionId: true,
        scheduledPrepayOption: {
          select: { price: true, currency: true, months: true },
        },
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
            coverImageAsset: { select: { id: true, publicId: true } },
            logoAsset: { select: { id: true, publicId: true } },
            currency: true,
            priceChanges: { orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }] },
            isDiscontinued: true,
            paymentOnStartup: true,
            renewalDay: true,
            intervalMonths: true,
            startingMonth: true,
            renewalMonthOffset: true,
            company: {
              select: {
                name: true,
                slug: true,
                brandColors: true,
                logoUrl: true,
                logoAsset: { select: { id: true, publicId: true } },
              },
            },
          },
        },
        // First purchase group ordered by title (format: "Subscription – YYYY/MM") to determine
        // the user's first billing month in this subscription window (for grandfathered price logic).
        purchaseGroups: {
          where: { fromSubscription: true },
          orderBy: { title: 'asc' },
          take: 1,
          select: { title: true },
        },
      },
    });

    return Promise.all(entries.map(async (entry) => {
      const { priceChanges: subPriceChanges, ...subRest } = entry.subscription as any;
      const sub = {
        ...this.mapSubscriptionAssets(subRest),
        price: this.computeCurrentPrice(subPriceChanges ?? [], subRest.currency),
      };

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

      // For prepaid subscriptions, use the scheduled prepay option price as the renewal base
      const scheduledPrepayOption = (entry as any).scheduledPrepayOption as { price: { toString(): string }; currency: string; months: number } | null;
      if (scheduledPrepayOption) {
        // Use prepay option price directly — costCurrency is always set to the option's
        // currency at join time, so the price is already in the user's cost currency.
        nextBase = parseFloat(scheduledPrepayOption.price.toString());
      } else if (storedRenewalDate) {
        const renewalYear = storedRenewalDate.getUTCFullYear();
        const renewalMonth = storedRenewalDate.getUTCMonth() + 1;
        // Determine user's first billing month in this subscription window for grandfathered price check.
        const firstPurchaseGroup = ((entry as any).purchaseGroups as Array<{ title: string }> | undefined)?.[0];
        const userFirstBilledYearMonth = parseFirstBilledYearMonth(
          firstPurchaseGroup?.title,
          renewalYear,
          renewalMonth,
        );
        // Pass targetCurrency so multi-currency records are resolved correctly.
        // If no records exist for the user's currency, resolveEffectiveBasePrice
        // returns fromPriceChange: false and the user's custom price is preserved.
        const resolved = resolveEffectiveBasePrice(
          subPriceChanges ?? [],
          renewalYear,
          renewalMonth,
          fallbackBase,
          entry.costCurrency,
          userFirstBilledYearMonth,
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

      // Compute box month from renewal month by adding the renewalMonthOffset
      // e.g. renewal in Oct + offset=1 → box month = Nov
      let nextBoxMonth: { year: number; month: number } | null = null;
      if (storedRenewalDate) {
        const offset: number = (subRest as any).renewalMonthOffset ?? 0;
        let bm = storedRenewalDate.getUTCMonth() + 1 + offset; // 1-12 based
        let by = storedRenewalDate.getUTCFullYear();
        while (bm > 12) { bm -= 12; by += 1; }
        while (bm < 1)  { bm += 12; by -= 1; }
        nextBoxMonth = { year: by, month: bm };
      }

      const { skipRecords: _sr, feeTemplates: _ft, scheduledPrepayOption: _spo, purchaseGroups: _pg, ...entryWithoutExtras } = entry as typeof entry & { feeTemplates: unknown[]; scheduledPrepayOption: unknown; purchaseGroups: unknown[] };
      return {
        ...entryWithoutExtras,
        subscription: { ...sub },
        nextRenewalDate: storedRenewalDate ? storedRenewalDate.toISOString() : null,
        nextRenewalAmount: nextRenewalAmount !== null ? nextRenewalAmount.toFixed(2) : null,
        nextRenewalCurrency: cur,
        nextRenewalPriceChanged,
        nextRenewalNewPrice,
        nextBoxMonth,
      };
    }));
  }

  /** Lean endpoint for the calendar view — returns only the fields it actually renders. */
  async getMySubscriptionsForCalendar(userId: string) {
    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: { userId, active: true },
      select: {
        id: true,
        startDate: true,
        renewalDay: true,
        nextRenewalDate: true,
        costCurrency: true,
        basePrice: true,
        shippingCost: true,
        scheduledPrepayOption: {
          select: { price: true, currency: true, months: true },
        },
        feeTemplates: {
          select: {
            customAmount: true,
            customCurrency: true,
            feeTemplate: { select: { defaultAmount: true, defaultCurrency: true } },
          },
        },
        skipRecords: {
          where: { undoneAt: null },
          include: { month: { select: { year: true, month: true } } },
        },
        subscription: {
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            logoAsset: { select: { id: true, publicId: true } },
            coverImage: true,
            coverImageAsset: { select: { id: true, publicId: true } },
            currency: true,
            renewalDay: true,
            intervalMonths: true,
            startingMonth: true,
            renewalMonthOffset: true,
            startDate: true,
            priceChanges: { orderBy: [{ effectiveYear: 'asc' }, { effectiveMonth: 'asc' }] },
            company: {
              select: {
                name: true,
                slug: true,
                brandColors: true,
              },
            },
          },
        },
        purchaseGroups: {
          where: { fromSubscription: true },
          orderBy: { title: 'asc' },
          take: 1,
          select: { title: true },
        },
      },
    });

    return Promise.all(entries.map(async (entry) => {
      const { priceChanges: subPriceChanges, ...subRest } = entry.subscription as any;
      const sub = {
        ...this.mapSubscriptionAssets(subRest),
        price: this.computeCurrentPrice(subPriceChanges ?? [], subRest.currency),
      };

      let storedRenewalDate = (entry as any).nextRenewalDate as Date | null;
      if (!storedRenewalDate) {
        await refreshNextRenewalDate(this.prisma, entry.id);
        const fresh = await this.prisma.userSubscriptionEntry.findUnique({
          where: { id: entry.id },
          select: { nextRenewalDate: true },
        });
        storedRenewalDate = fresh?.nextRenewalDate ?? null;
      }

      const cur = entry.costCurrency ?? sub.currency ?? null;
      const fallbackBase = entry.basePrice ? parseFloat(entry.basePrice.toString()) : null;
      const shipping = entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null;
      const subCurrencyUp = cur?.toUpperCase() ?? '';
      const scheduledPrepayOption = (entry as any).scheduledPrepayOption as { price: { toString(): string }; currency: string; months: number } | null;

      let nextBase = fallbackBase;
      if (scheduledPrepayOption) {
        nextBase = parseFloat(scheduledPrepayOption.price.toString());
      } else if (storedRenewalDate) {
        const renewalYear = storedRenewalDate.getUTCFullYear();
        const renewalMonth = storedRenewalDate.getUTCMonth() + 1;
        const firstPurchaseGroup = ((entry as any).purchaseGroups as Array<{ title: string }> | undefined)?.[0];
        const userFirstBilledYearMonth = parseFirstBilledYearMonth(firstPurchaseGroup?.title, renewalYear, renewalMonth);
        const resolved = resolveEffectiveBasePrice(subPriceChanges ?? [], renewalYear, renewalMonth, fallbackBase, entry.costCurrency, userFirstBilledYearMonth);
        nextBase = resolved.price ?? fallbackBase;
      }

      const sameCurrencyFees = ((entry as any).feeTemplates as Array<{
        customAmount: { toString(): string } | null;
        customCurrency: string | null;
        feeTemplate: { defaultAmount: { toString(): string } | null; defaultCurrency: string };
      }>).reduce((sum, link) => {
        const feeCur = (link.customCurrency ?? link.feeTemplate.defaultCurrency).toUpperCase();
        if (feeCur !== subCurrencyUp) return sum;
        const amt = parseFloat((link.customAmount ?? link.feeTemplate.defaultAmount ?? 0).toString());
        return sum + (isNaN(amt) ? 0 : amt);
      }, 0);

      const nextRenewalAmount = nextBase !== null ? (nextBase + (shipping ?? 0) + sameCurrencyFees) : null;

      const { skipRecords, feeTemplates: _ft, scheduledPrepayOption: _spo, purchaseGroups: _pg, ...rest } = entry as typeof entry & { feeTemplates: unknown[]; scheduledPrepayOption: unknown; purchaseGroups: unknown[] };
      return {
        id: rest.id,
        active: true,
        startDate: rest.startDate,
        renewalDay: rest.renewalDay,
        nextRenewalAmount: nextRenewalAmount !== null ? nextRenewalAmount.toFixed(2) : null,
        nextRenewalCurrency: cur,
        skipRecords,
        subscription: {
          ...sub,
          startDate: entry.subscription.startDate,
        },
      };
    }));
  }

  async getOrphanedMembershipHistory(userId: string) {
    // Find all inactive entries for this user
    const inactiveEntries = await this.prisma.userSubscriptionEntry.findMany({
      where: { userId, active: false },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        startDate: true,
        cancellationDate: true,
        cancellationReason: true,
        subscriptionId: true,
        subscription: {
          select: {
            id: true,
            slug: true,
            name: true,
            coverImage: true,
            logoUrl: true,
            coverImageAsset: { select: { id: true, publicId: true } },
            logoAsset: { select: { id: true, publicId: true } },
            currency: true,
            isDiscontinued: true,
            company: {
              select: {
                name: true,
                slug: true,
                brandColors: true,
                logoUrl: true,
                logoAsset: { select: { id: true, publicId: true } },
              },
            },
          },
        },
      },
    });

    // Get subscriptionIds that have an active entry (user is still subscribed)
    const activeEntries = await this.prisma.userSubscriptionEntry.findMany({
      where: { userId, active: true },
      select: { subscriptionId: true },
    });
    const activeSubIds = new Set(activeEntries.map((e) => e.subscriptionId));

    // "Orphaned" in the new model = inactive entries for subs the user is no longer active in
    const orphaned = inactiveEntries.filter((e) => !activeSubIds.has(e.subscriptionId));

    // Group by subscription
    const grouped = new Map<string, { subscription: (typeof inactiveEntries)[0]['subscription']; records: Array<{ id: string; startDate: string | null; endDate: string | null; cancellationReason: string | null }> }>();
    for (const r of orphaned) {
      const key = r.subscriptionId;
      if (!grouped.has(key)) {
        grouped.set(key, { subscription: this.mapSubscriptionAssets(r.subscription), records: [] });
      }
      grouped.get(key)!.records.push({
        id: r.id,
        startDate: r.startDate,
        endDate: r.cancellationDate,
        cancellationReason: r.cancellationReason,
      });
    }
    return Array.from(grouped.values());
  }

  async removeOrphanedHistoryRecord(
    userId: string,
    entryId: string,
    opts: { removeBooks?: boolean; removeSpending?: boolean; removeSoldBooks?: boolean } = {},
  ) {
    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { id: entryId, userId, active: false },
      include: { billingPeriods: { select: { id: true, purchaseTransactionId: true } } },
    });
    if (!entry) throw new NotFoundException('Inactive subscription entry not found');

    if (opts.removeSpending) {
      const txIds = entry.billingPeriods
        .map((p) => p.purchaseTransactionId)
        .filter((id): id is string => id != null);
      if (txIds.length) {
        await this.prisma.purchaseTransaction.deleteMany({ where: { id: { in: txIds } } });
      }
    }

    if (opts.removeBooks) {
      // Try direct link first (new model: books linked to this entry via subscriptionEntryId)
      const linkedBooks = await this.prisma.userBookEntry.findMany({
        where: { userId, subscriptionEntryId: entry.id },
        select: {
          id: true,
          purchaseGroupId: true,
          ownershipStatus: true,
          editionId: true,
          saleEntries: {
            select: {
              allocatedAmount: true,
              saleGroup: { select: { currency: true, soldAt: true } },
            },
          },
        },
      });

      if (linkedBooks.length > 0) {
        const removeSoldBooks = opts.removeSoldBooks ?? true;
        const toDelete = removeSoldBooks ? linkedBooks : linkedBooks.filter(b => b.ownershipStatus !== 'SOLD');

        if (toDelete.length > 0) {
          const groupIds = Array.from(new Set(
            toDelete.filter(b => b.purchaseGroupId).map(b => b.purchaseGroupId as string),
          ));

          // Clean up community sale stats for sold books being removed (non-fatal)
          const soldEditionIds = [...new Set(
            toDelete
              .filter(b => b.ownershipStatus === 'SOLD' && b.editionId && (b as any).saleEntries?.length)
              .map(b => b.editionId as string)
          )];
          for (const editionId of soldEditionIds) {
            this.crowdStatsService.rebuildEditionSaleStats(editionId).catch(() => {});
          }

          await this.prisma.userBookEntry.deleteMany({ where: { id: { in: toDelete.map(b => b.id) } } });
          if (groupIds.length > 0) {
            await this.prisma.userPurchaseGroup.deleteMany({
              where: { id: { in: groupIds }, bookEntries: { none: {} } },
            });
          }
        }
      } else if (entry.startDate || entry.cancellationDate) {
        // Fallback: date-range match for migrated data (books may still link to old entry)
        const rangeStart = entry.startDate
          ? (() => { const p = entry.startDate!.split('-').map(Number); return { year: p[0], month: p[1] }; })()
          : null;
        const rangeEnd = entry.cancellationDate
          ? (() => { const p = entry.cancellationDate!.split('-').map(Number); return { year: p[0], month: p[1] }; })()
          : null;

        const monthsInRange = await this.prisma.subscriptionMonth.findMany({
          where: {
            subscriptionId: entry.subscriptionId,
            ...(rangeStart || rangeEnd ? {
              AND: [
                ...(rangeStart ? [{ OR: [{ year: { gt: rangeStart.year } }, { year: rangeStart.year, month: { gte: rangeStart.month } }] }] : []),
                ...(rangeEnd ? [{ OR: [{ year: { lt: rangeEnd.year } }, { year: rangeEnd.year, month: { lte: rangeEnd.month } }] }] : []),
              ],
            } : {}),
          },
          select: { id: true },
        });

        const monthIds = monthsInRange.map((m) => m.id);
        if (monthIds.length > 0) {
          const monthBooks = await this.prisma.subscriptionMonthBook.findMany({
            where: { monthId: { in: monthIds }, editionId: { not: null } },
            select: { editionId: true, bookId: true },
          });
          const editionIds = monthBooks.map((mb) => mb.editionId).filter((id): id is string => id != null);
          const bookIds = monthBooks.map((mb) => mb.bookId);

          if (editionIds.length > 0 || bookIds.length > 0) {
            const affectedEntries = await this.prisma.userBookEntry.findMany({
              where: {
                userId,
                subscriptionEntryId: null,
                OR: [
                  ...(editionIds.length ? [{ editionId: { in: editionIds } }] : []),
                  { bookId: { in: bookIds } },
                ],
                purchaseGroupId: { not: null },
              },
              select: { id: true, purchaseGroupId: true },
            });
            const groupIds = Array.from(new Set(affectedEntries.map((e) => e.purchaseGroupId as string)));

            await this.prisma.userBookEntry.deleteMany({
              where: {
                userId,
                subscriptionEntryId: null,
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
      }
    }

    await this.prisma.userSubscriptionEntry.delete({ where: { id: entry.id } });
  }

  async cancelMySubscription(userId: string, slug: string, dto: { cancellationDate?: string; cancellationReason?: string } = {}) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: sub.id, active: true },
    });
    if (!entry) throw new NotFoundException('You are not subscribed to this subscription');

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

    const updated = await this.prisma.userSubscriptionEntry.update({
      where: { id: entry.id },
      data: {
        active: false,
        nextRenewalDate: null,
        cancellationDate: dto.cancellationDate ?? new Date().toISOString().slice(0, 10),
        cancellationReason: dto.cancellationReason ?? null,
      },
    });
    this.crowdStatsService.decrementSubscriberCount(sub.id).catch(() => {});
    this.statsService.markStatsStale(userId);
    this.scheduledReminders?.cancelByEntry(entry.id).catch(() => {});
    return updated;
  }

  async removeMySubscription(
    userId: string,
    slug: string,
    opts: { removeBooks: boolean; removeSpending: boolean; removeSoldBooks?: boolean; historyId?: string; historyIds?: string[]; removeAllPeriods?: boolean; removeCurrentOnly?: boolean },
  ) {
    const sub = await this.findBySlug(slug);

    // ── CASE A: Delete specific inactive period(s) by entry ID ────────────────
    if ((opts.historyId || (opts.historyIds && opts.historyIds.length > 0)) && !opts.removeAllPeriods) {
      const entryIds = opts.historyIds ?? (opts.historyId ? [opts.historyId] : []);

      if (opts.removeSpending || opts.removeBooks) {
        const periodsToRemove = await this.prisma.userSubscriptionEntry.findMany({
          where: { id: { in: entryIds }, userId },
          include: { billingPeriods: { select: { id: true, purchaseTransactionId: true } } },
        });

        if (opts.removeSpending) {
          const txIds = periodsToRemove
            .flatMap((e) => e.billingPeriods)
            .map((p) => p.purchaseTransactionId)
            .filter((id): id is string => id != null);
          if (txIds.length) {
            await this.prisma.purchaseTransaction.deleteMany({ where: { id: { in: txIds } } });
          }
        }

        if (opts.removeBooks) {
          for (const period of periodsToRemove) {
            await this.removeBooksForPeriodEntry(userId, period, opts.removeSoldBooks ?? true);
          }
        }
      }

      await this.prisma.userSubscriptionEntry.deleteMany({
        where: { id: { in: entryIds }, userId },
      });
      for (const id of entryIds) { this.scheduledReminders?.cancelByEntry(id).catch(() => {}); }
      this.statsService.markStatsStale(userId);
      return { success: true };
    }

    // ── CASE B: Remove only the current active period (keep historical entries) ─
    if (opts.removeCurrentOnly) {
      const activeEntry = await this.prisma.userSubscriptionEntry.findFirst({
        where: { userId, subscriptionId: sub.id, active: true },
        include: { billingPeriods: { select: { id: true, purchaseTransactionId: true } } },
      });
      if (!activeEntry) throw new NotFoundException('No active subscription entry found');

      if (opts.removeSpending) {
        const txIds = activeEntry.billingPeriods
          .map((p) => p.purchaseTransactionId)
          .filter((id): id is string => id != null);
        if (txIds.length) {
          await this.prisma.purchaseTransaction.deleteMany({ where: { id: { in: txIds } } });
        }
      }

      if (opts.removeBooks) {
        await this.removeBooksForPeriodEntry(userId, activeEntry, opts.removeSoldBooks ?? true);
      }

      await this.prisma.userSubscriptionSkipState.deleteMany({ where: { userId, subscriptionId: sub.id } });
      await this.prisma.userSubscriptionEntry.delete({ where: { id: activeEntry.id } });
      this.scheduledReminders?.cancelByEntry(activeEntry.id).catch(() => {});
      this.crowdStatsService.decrementSubscriberCount(sub.id).catch(() => {});
      this.statsService.markStatsStale(userId);
      return { success: true };
    }

    // ── CASE C/D: Remove all periods (removeAllPeriods) or the primary entry ───
    const allEntries = await this.prisma.userSubscriptionEntry.findMany({
      where: { userId, subscriptionId: sub.id },
      include: { billingPeriods: { select: { id: true, purchaseTransactionId: true } } },
    });
    if (!allEntries.length) throw new NotFoundException('You are not subscribed to this subscription');

    const targetEntries = opts.removeAllPeriods
      ? allEntries
      : [allEntries.find((e) => e.active) ?? allEntries[0]];

    if (opts.removeSpending) {
      const txIds = targetEntries
        .flatMap((e) => e.billingPeriods)
        .map((p) => p.purchaseTransactionId)
        .filter((id): id is string => id != null);
      if (txIds.length) {
        await this.prisma.purchaseTransaction.deleteMany({ where: { id: { in: txIds } } });
      }
    }

    if (opts.removeBooks) {
      for (const entry of targetEntries) {
        await this.removeBooksForPeriodEntry(userId, entry, opts.removeSoldBooks ?? true);
      }
    }

    await this.prisma.userSubscriptionSkipState.deleteMany({ where: { userId, subscriptionId: sub.id } });

    if (opts.removeAllPeriods) {
      await this.prisma.userSubscriptionEntry.deleteMany({ where: { userId, subscriptionId: sub.id } });
    } else {
      const targetEntry = targetEntries[0];
      await this.prisma.userSubscriptionEntry.delete({ where: { id: targetEntry.id } });
    }

    const hadActive = targetEntries.some((e) => e.active);
    if (hadActive) {
      this.crowdStatsService.decrementSubscriberCount(sub.id).catch(() => {});
    }
    for (const e of targetEntries) { this.scheduledReminders?.cancelByEntry(e.id).catch(() => {}); }
    this.statsService.markStatsStale(userId);
    return { success: true };
  }

  /** Remove all books linked to a subscription period entry. */
  private async removeBooksForPeriodEntry(
    userId: string,
    entry: { id: string; subscriptionId?: string; startDate?: string | null; cancellationDate?: string | null },
    removeSoldBooks = true,
  ): Promise<void> {
    const linked = await this.prisma.userBookEntry.findMany({
      where: { userId, subscriptionEntryId: entry.id },
      select: {
        id: true,
        purchaseGroupId: true,
        ownershipStatus: true,
        editionId: true,
        saleEntries: {
          select: {
            allocatedAmount: true,
            saleGroup: { select: { currency: true, soldAt: true } },
          },
        },
      },
    });

    const toDelete = removeSoldBooks ? linked : linked.filter(b => b.ownershipStatus !== 'SOLD');
    if (toDelete.length === 0) return;

    const groupIds = Array.from(new Set(
      toDelete.filter(b => b.purchaseGroupId).map(b => b.purchaseGroupId as string),
    ));
    const deleteIds = toDelete.map(b => b.id);

    // Clean up community sale stats for sold books being removed (non-fatal)
    const soldEditionIds = [...new Set(
      toDelete
        .filter(b => b.ownershipStatus === 'SOLD' && b.editionId && (b as any).saleEntries?.length)
        .map(b => b.editionId as string)
    )];
    for (const editionId of soldEditionIds) {
      this.crowdStatsService.rebuildEditionSaleStats(editionId).catch(() => {});
    }

    await this.prisma.userBookEntry.deleteMany({ where: { id: { in: deleteIds } } });

    if (groupIds.length > 0) {
      await this.prisma.userPurchaseGroup.deleteMany({
        where: { id: { in: groupIds }, bookEntries: { none: {} } },
      });
    }
  }

  async updateMyEntryCosts(
    userId: string,
    slug: string,
    dto: {
      basePrice?: string;
      shippingCost?: string;
      costCurrency?: string;
      trackingNumber?: string | null;
      isForwarding?: boolean;
      linkedFeeTemplates?: Array<{ templateId: string; customAmount?: number; customCurrency?: string }>;
    },
  ) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: sub.id, active: true },
    });
    if (!entry) throw new NotFoundException('You are not subscribed to this subscription');

    await this.prisma.userSubscriptionEntry.update({
      where: { id: entry.id },
      data: {
        ...(dto.basePrice !== undefined && { basePrice: dto.basePrice }),
        ...(dto.shippingCost !== undefined && { shippingCost: dto.shippingCost }),
        ...(dto.costCurrency !== undefined && { costCurrency: dto.costCurrency }),
        ...('trackingNumber' in dto && { trackingNumber: dto.trackingNumber ?? null }),
        ...(dto.isForwarding !== undefined && { isForwarding: dto.isForwarding }),
      },
    });

    // isForwarding change affects country-fee snapshot — refresh fire-and-forget
    if (dto.isForwarding !== undefined && dto.isForwarding !== entry.isForwarding) {
      this.countryFeeSnapshotService.refreshSnapshotForEntry(entry.id).catch(() => {});
      // Bust L1 cache for this subscription (country unknown here, clear all keys for slug)
      for (const key of this.countryFeeCache.keys()) {
        if (key.startsWith(`${slug}:`)) this.countryFeeCache.delete(key);
      }
    }

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

    this.statsService.markStatsStale(userId);
    return this.getMySubscriptionEntry(userId, slug);
  }

  async joinSubscription(userId: string, slug: string, dto: JoinSubscriptionDto) {
    const sub = await this.findBySlug(slug);

    const existing = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: sub.id, active: true },
    });
    if (existing) {
      throw new ConflictException('You are already subscribed to this subscription');
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

    // Resolve signupIncludesCurrentMonth and renewalMonthOffset from settings history
    // so that historical backfill uses the settings that were in effect at the startDate month.
    const fallbackSettings: SubscriptionSettings = {
      renewalDay: (sub as any).renewalDay as number | null,
      renewalDayUserSet: ((sub as any).renewalDayUserSet as boolean) ?? false,
      paymentOnStartup: (sub as any).paymentOnStartup as boolean,
      signupIncludesCurrentMonth: (sub as any).signupIncludesCurrentMonth as boolean,
      renewalMonthOffset: ((sub as any).renewalMonthOffset as number | null) ?? 0,
    };
    let resolvedSignupSettings = { signupIncludesCurrentMonth: fallbackSettings.signupIncludesCurrentMonth, renewalMonthOffset: fallbackSettings.renewalMonthOffset, renewalDay: fallbackSettings.renewalDay };
    if (startDateObj) {
      const joinSettingsHistory = await this.prisma.subscriptionSettingsHistory.findMany({
        where: { subscriptionId: sub.id },
        orderBy: { effectiveFrom: 'desc' },
      });
      const resolved = resolveEffectiveSettings(joinSettingsHistory, startDateObj.getFullYear(), startDateObj.getMonth() + 1, fallbackSettings);
      resolvedSignupSettings = { signupIncludesCurrentMonth: resolved.signupIncludesCurrentMonth, renewalMonthOffset: resolved.renewalMonthOffset, renewalDay: resolved.renewalDay };
    }

    // ── DryRun: compute eligible months without persisting anything ──────────
    if (dto.dryRun) {
      const isCombo = (sub as any).isCombo as boolean;
      const componentIds = (sub as any).componentIds as string[];
      const { signupIncludesCurrentMonth, renewalMonthOffset, renewalDay: resolvedRenewalDay } = resolvedSignupSettings;
      const parentSubscriptionId = (sub as any).parentSubscriptionId as string | null;
      const variantDbStartDate = (sub as any).startDate as Date | null;
      let effectiveStartDateObj = startDateObj;
      let effectiveSignupIncludes = signupIncludesCurrentMonth;
      if (parentSubscriptionId && variantDbStartDate && (!effectiveStartDateObj || variantDbStartDate > effectiveStartDateObj)) {
        effectiveStartDateObj = variantDbStartDate;
        effectiveSignupIncludes = true;
      }
      const monthsSubscriptionId = parentSubscriptionId ?? sub.id;
      const eligibleMonths = isCombo
        ? await this.getComboEligibleMonths(componentIds, effectiveStartDateObj, cancellationDateObj, effectiveSignupIncludes, renewalMonthOffset, resolvedRenewalDay)
        : await this.getEligibleMonths(monthsSubscriptionId, effectiveStartDateObj, cancellationDateObj, effectiveSignupIncludes, renewalMonthOffset, resolvedRenewalDay);
      const mockEntry = {
        id: '__preview__',
        startDate: startDateStr,
        renewalDay,
        basePrice: dto.basePrice ?? null,
        costCurrency: dto.costCurrency ?? (sub as any).currency ?? 'EUR',
        shippingCost: dto.shippingCost ?? null,
        cancellationDate: dto.alreadyCancelled ? (dto.cancellationDate ?? null) : null,
        active: !dto.alreadyCancelled,
      };
      return { entry: mockEntry as any, eligibleMonths };
    }

    // Resolve prepay option (if provided) — sets prepaidMonths and scheduledPrepayOptionId atomically at join time
    let resolvedPrepayMonths: number | null = null;
    let resolvedPrepayOptionId: string | null = null;
    if (dto.selectedPrepayOptionId) {
      const option = await this.prisma.subscriptionPrepayOption.findFirst({
        where: { id: dto.selectedPrepayOptionId, subscriptionId: sub.id },
      });
      if (!option) throw new BadRequestException('Invalid prepay option');
      resolvedPrepayMonths = option.months;
      resolvedPrepayOptionId = option.id;
    }

    const entry = await this.prisma.userSubscriptionEntry.create({
      data: {
        userId,
        subscriptionId: sub.id,
        active: !dto.alreadyCancelled,
        startDate: startDateStr,
        basePrice: dto.basePrice ? parseFloat(dto.basePrice) : null,
        shippingCost: dto.shippingCost ? parseFloat(dto.shippingCost) : null,
        isForwarding: dto.isForwarding ?? false,
        costCurrency: dto.costCurrency ?? (sub as any).currency ?? 'EUR',
        renewalDay,
        ...(resolvedPrepayOptionId !== null && {
          scheduledPrepayOptionId: resolvedPrepayOptionId,
          prepaidMonths: resolvedPrepayMonths!,
        }),
        ...(dto.alreadyCancelled && {
          cancellationDate: dto.cancellationDate ?? new Date().toISOString().slice(0, 10),
          cancellationReason: dto.cancellationReason ?? null,
        }),
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
    const { signupIncludesCurrentMonth, renewalMonthOffset, renewalDay: resolvedRenewalDay } = resolvedSignupSettings;

    // If this sub is a variant of a content stream, months live on the parent.
    // Also clamp startDate to the subscription's own startDate (earliest it could have existed).
    // This applies only to variants — a user may join a standalone sub before its DB startDate for historical data entry.
    const parentSubscriptionId = (sub as any).parentSubscriptionId as string | null;
    const variantDbStartDate = (sub as any).startDate as Date | null;
    // Effective user start: max(user-provided startDate, subscription's own startDate) — only for variants
    let effectiveStartDateObj = startDateObj;
    let effectiveSignupIncludes = signupIncludesCurrentMonth;
    if (parentSubscriptionId && variantDbStartDate) {
      if (!effectiveStartDateObj || variantDbStartDate > effectiveStartDateObj) {
        effectiveStartDateObj = variantDbStartDate;
        effectiveSignupIncludes = true; // subscription's first month is always eligible for pre-launch joiners
      }
    }
    const monthsSubscriptionId = parentSubscriptionId ?? sub.id;

    const eligibleMonths = isCombo
      ? await this.getComboEligibleMonths(componentIds, effectiveStartDateObj, cancellationDateObj, effectiveSignupIncludes, renewalMonthOffset, resolvedRenewalDay)
      : await this.getEligibleMonths(monthsSubscriptionId, effectiveStartDateObj, cancellationDateObj, effectiveSignupIncludes, renewalMonthOffset, resolvedRenewalDay);

    // If paymentOnStartup and NOT already cancelled: register the first upcoming month's books as preorders
    // (only for non-combo subscriptions — combos have no own SubscriptionMonth records)
    const paymentOnStartup = (sub as any).paymentOnStartup as boolean;
    if (paymentOnStartup && startDateObj && !isCombo && !dto.alreadyCancelled) {
      await this.recordFirstMonthAsPreorder(entry.id, userId, sub.id, startDateObj, entry, signupIncludesCurrentMonth, renewalDay, renewalMonthOffset);
    }

    // Persist nextRenewalDate (will be null for cancelled entries)
    await refreshNextRenewalDate(this.prisma, entry.id);
    // Backfill past renewal history for calendar display (fire-and-forget)
    backfillRenewalHistory(this.prisma, entry.id).catch(() => {});
    // Update subscriber count snapshot (fire-and-forget, skip for already-cancelled historical entries)
    if (!dto.alreadyCancelled) {
      this.crowdStatsService.incrementSubscriberCount(sub.id).catch(() => {});
    }

    this.statsService.markStatsStale(userId);
    this.scheduledReminders?.scheduleRenewal(entry.id).catch(() => {});
    return { entry, eligibleMonths };
  }

  private async getEligibleMonths(subscriptionId: string, startDateObj: Date | null, endDateObj?: Date | null, signupIncludesCurrentMonth = false, renewalMonthOffset = 0, renewalDay: number | null = null) {
    if (!startDateObj) return [];

    const now = new Date();
    const effectiveRenewalDay = renewalDay ?? 1;

    const { year: limitYear, month: limitMonth } = endDateObj
      ? computeLastProcessedBoxMonth(endDateObj, effectiveRenewalDay, renewalMonthOffset)
      : computeLastProcessedBoxMonth(now, effectiveRenewalDay, renewalMonthOffset);

    const { year: startYear, month: startMonth } = computeFirstEligibleBoxMonth(
      startDateObj, effectiveRenewalDay, renewalMonthOffset, signupIncludesCurrentMonth,
    );

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

  private async getComboEligibleMonths(componentIds: string[], startDateObj: Date | null, endDateObj?: Date | null, signupIncludesCurrentMonth = false, renewalMonthOffset = 0, renewalDay: number | null = null) {
    if (!startDateObj || componentIds.length === 0) return [];

    const now = new Date();
    const effectiveRenewalDay = renewalDay ?? 1;

    const { year: limitYear, month: limitMonth } = endDateObj
      ? computeLastProcessedBoxMonth(endDateObj, effectiveRenewalDay, renewalMonthOffset)
      : computeLastProcessedBoxMonth(now, effectiveRenewalDay, renewalMonthOffset);

    const { year: startYear, month: startMonth } = computeFirstEligibleBoxMonth(
      startDateObj, effectiveRenewalDay, renewalMonthOffset, signupIncludesCurrentMonth,
    );

    if (startYear > limitYear || (startYear === limitYear && startMonth > limitMonth)) {
      return [];
    }

    const effectiveComponentIds = await this.resolveEffectiveComponentIds(componentIds);
    const componentMonths = await this.prisma.subscriptionMonth.findMany({
      where: {
        subscriptionId: { in: effectiveComponentIds },
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
    subRenewalDay: number | null = null,
    renewalMonthOffset = 0,
  ) {
    const startYear = startDateObj.getFullYear();
    const startMonth = startDateObj.getMonth() + 1;
    const joinDay = startDateObj.getDate();
    // Use the subscription-level renewalDay (passed from caller), falling back to entry or 1.
    const renewalDay = subRenewalDay ?? entry.renewalDay ?? 1;

    // Mirror getEligibleMonths logic: if renewal hasn't happened yet this month,
    // the last completed billing was the previous month.
    const renewalAlreadyHappened = joinDay >= renewalDay;
    let lastBillingMonth = startMonth;
    let lastBillingYear = startYear;
    if (!renewalAlreadyHappened) {
      lastBillingMonth -= 1;
      if (lastBillingMonth === 0) { lastBillingMonth = 12; lastBillingYear -= 1; }
    }

    // currentBoxMonth = lastBillingMonth + renewalMonthOffset
    let firstEligibleMonth = lastBillingMonth + renewalMonthOffset;
    let firstEligibleYear = lastBillingYear;
    while (firstEligibleMonth > 12) { firstEligibleMonth -= 12; firstEligibleYear += 1; }
    while (firstEligibleMonth < 1) { firstEligibleMonth += 12; firstEligibleYear -= 1; }

    // signupIncludesCurrentMonth=false → user's first box is the next cycle
    if (!signupIncludesCurrentMonth) {
      firstEligibleMonth += 1;
      if (firstEligibleMonth > 12) { firstEligibleMonth = 1; firstEligibleYear += 1; }
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
          ownershipStatus: 'PREORDER',
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
    ownershipStatus?: 'OWNED' | 'PREORDER';
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
    const status = opts.ownershipStatus ?? 'OWNED';
    await this.prisma.userBookEntry.create({
      data: {
        userId: opts.userId,
        bookId: opts.bookId,
        editionId: opts.editionId,
        ownershipStatus: status,
        readingStatus: 'UNREAD',
        subscriptionEntryId: opts.subscriptionEntryId,
        purchaseGroupId: opts.purchaseGroupId,
        signatureType: opts.signatureType,
      },
    }).then(created =>
      this.prisma.ownershipStatusHistory.create({
        data: { userBookEntryId: created.id, status, changedAt: opts.changedAt },
      }).catch(() => {}),
    );
  }

  async backfillSubscription(userId: string, slug: string, dto: BackfillSubscriptionDto) {
    const sub = await this.findBySlug(slug);
    const isCombo = (sub as any).isCombo as boolean;
    const componentIds = (sub as any).componentIds as string[];
    // For variant subs (parentSubscriptionId set), months live on the parent subscription.
    const monthsSubscriptionId: string = (sub as any).parentSubscriptionId ?? sub.id;

    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: sub.id },
      orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
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

      // Resolve effective IDs once — for content stream variants, months live on the parent.
      const effectiveComponentIds = await this.resolveEffectiveComponentIds(componentIds);

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
      let comboFirstBilledYearMonth: { year: number; month: number } | null = null;
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
      // Compute first billed year/month for combo window (grandfathered price logic).
      for (const comboId of validComboIds) {
        const parts = comboId.split('_');
        const y = parseInt(parts[1]); const m = parseInt(parts[2]);
        if (!comboFirstBilledYearMonth || y < comboFirstBilledYearMonth.year ||
            (y === comboFirstBilledYearMonth.year && m < comboFirstBilledYearMonth.month)) {
          comboFirstBilledYearMonth = { year: y, month: m };
        }
      }

      for (const comboId of validComboIds) {
        // Parse year/month from synthetic ID: COMBO_YEAR_MONTH
        const parts = comboId.split('_');
        const year = parseInt(parts[1]);
        const month = parseInt(parts[2]);

        // Fetch books from all component months for this year/month
        const componentMonths = await this.prisma.subscriptionMonth.findMany({
          where: { subscriptionId: { in: effectiveComponentIds }, year, month },
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
        const comboRenewalDay = comboSettings.renewalDayUserSet ? (entry.renewalDay ?? 1) : (comboSettings.renewalDay ?? 1);
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
        const resolved = resolveEffectiveBasePrice(subPriceChanges, year, month, fallbackBase, entry.costCurrency, comboFirstBilledYearMonth);
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
              ownershipStatus: dto.backfillOwnershipStatus ?? 'OWNED',
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
        include: { skipPolicies: true },
      });
      const comboIsPrepaid = (entry.prepaidMonths ?? 1) > 1;
      const comboTargetType = comboIsPrepaid ? 'PREPAID' : 'MONTHLY';
      const comboPolicies = subWithComboPolicy?.skipPolicies ?? [];
      const comboPolicy =
        comboPolicies.find((p) => p.billingType === comboTargetType) ??
        comboPolicies.find((p) => p.billingType === 'ALL') ??
        null;
      const selectedComboSet = new Set(dto.selectedMonthIds);
      const skippableComboMonths = eligibleComboMonths
        .filter(m => m.books.length > 0 && !selectedComboSet.has(m.id))
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

      let firstSkipDateInWindow: Date | null = null;
      let prevWindowKey: string | null = null;
      for (const m of skippableComboMonths) {
        // Resolve the real DB month ID from any component subscription (same as recordSkip)
        const compMonth = await this.prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: effectiveComponentIds }, year: m.year, month: m.month },
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

    // Compute first billed year/month for this subscription window (used for grandfathered price logic).
    // This is the minimum year/month across all selected months — represents when user started in this window.
    let backfillFirstBilledYearMonth: { year: number; month: number } | null = null;
    for (const m of monthRecords) {
      if (!backfillFirstBilledYearMonth || m.year < backfillFirstBilledYearMonth.year ||
          (m.year === backfillFirstBilledYearMonth.year && m.month < backfillFirstBilledYearMonth.month)) {
        backfillFirstBilledYearMonth = { year: m.year, month: m.month };
      }
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
      // Mirror backfillRenewalHistory logic: use entry's own day only in user-set mode,
      // otherwise use the subscription's historical fixed renewal day.
      const monthRenewalDay = monthSettings.renewalDayUserSet ? (entry.renewalDay ?? 1) : (monthSettings.renewalDay ?? 1);
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
      const resolvedBase = resolveEffectiveBasePrice(subPriceChanges, monthRecord.year, monthRecord.month, fallbackBase, entryCostCurrency, backfillFirstBilledYearMonth);
      const baseAmount = batch
        ? batch.baseAmount / batch.monthsCovered
        : (resolvedBase.price ?? fallbackBase);
      // For batch path: split shipping over batch.monthsCovered (one shipment per billing period).
      // For no-batch (monthly): each month is its own billing event — full shipping per month.
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
          currency: (batch ? batch.currency : null) ?? entry.costCurrency ?? 'USD',
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

        // Add batch-level fees to this purchase group (always divided by N months).
        // The fee amount entered represents the total for the whole billing period.
        if (batch.fees?.length) {
          for (const f of batch.fees) {
            feesToCreate.push({
              userId,
              name: f.name,
              amount: f.amount / batch.monthsCovered,
              currency: f.currency,
              date: purchasedAtDate,
              category: 'OTHER' as any,
              purchaseGroupId: group.id,
            });
          }
        }

        // Add batch-level discounts to this purchase group (always divided by N months)
        if (batch.discounts?.length) {
          for (const d of batch.discounts) {
            discountsToCreate.push({
              userId,
              name: d.name,
              amount: d.amount / batch.monthsCovered,
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
            ownershipStatus: dto.backfillOwnershipStatus ?? 'OWNED',
          });
          booksAdded++;
        } catch {
          // skip duplicates silently
        }
      }

      // Fee templates once per purchase group — only when no billing batch was specified.
      // When the user provided an explicit billing batch (even with no fees), respect their input.
      if (!batch) {
        for (const link of (entry as any).feeTemplates ?? []) {
          const template = link.feeTemplate;
          const amount = link.customAmount ?? template.defaultAmount;
          if (!amount) continue;
          feesToCreate.push({
            userId,
            feeTemplateId: template.id,
            name: template.name,
            // Full fee per month — monthly users pay fees once per billing event.
            amount: parseFloat(amount.toString()),
            currency: link.customCurrency ?? template.defaultCurrency,
            date: purchasedAtDate,
            category: template.category,
            purchaseGroupId: group.id,
          });
        }
      }
    } // end for monthId loop

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
      include: { skipPolicies: true },
    });
    const isPrepaidBackfill = (entry.prepaidMonths ?? 1) > 1;
    const targetBillingType = isPrepaidBackfill ? 'PREPAID' : 'MONTHLY';
    const backfillPolicies = subWithPolicy?.skipPolicies ?? [];
    const policy =
      backfillPolicies.find((p) => p.billingType === targetBillingType) ??
      backfillPolicies.find((p) => p.billingType === 'ALL') ??
      null;

    const cancellationDateObj = entry.cancellationDate
      ? (() => {
          const parts = entry.cancellationDate.split('-').map(Number);
          return new Date(parts[0], parts[1] - 1, parts[2] ?? 1);
        })()
      : null;

    if (startDateObj) {
      const eligibleMonths = await this.getEligibleMonths(
        monthsSubscriptionId,
        startDateObj,
        cancellationDateObj,
        fallbackSettings.signupIncludesCurrentMonth,
        fallbackSettings.renewalMonthOffset,
        fallbackSettings.renewalDay,
      );
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
    // Recompute next renewal date now that skips are saved
    await refreshNextRenewalDate(this.prisma, entry.id);
    // Backfill past renewal dates for calendar (fire-and-forget)
    backfillRenewalHistory(this.prisma, entry.id).catch(() => {});

    return { booksAdded, skipsRecorded };
  }

  async updateMyBillingMode(userId: string, slug: string, dto: UpdateBillingModeDto) {
    const sub = await this.findBySlug(slug);
    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: sub.id, active: true },
    });
    if (!entry) throw new NotFoundException('Subscription entry not found');

    let prepaidMonths = 1;
    if (dto.scheduledPrepayOptionId) {
      const option = await this.prisma.subscriptionPrepayOption.findFirst({
        where: { id: dto.scheduledPrepayOptionId, subscriptionId: sub.id },
      });
      if (!option) throw new BadRequestException('Invalid prepay option');
      prepaidMonths = option.months;
    }

    await this.prisma.userSubscriptionEntry.update({
      where: { id: entry.id },
      data: {
        scheduledPrepayOptionId: dto.scheduledPrepayOptionId,
        prepaidMonths,
      },
    });

    // NOTE: do NOT call refreshNextRenewalDate here.
    // If the user is in an open prepaid period, the current nextRenewalDate is the upcoming payment
    // date (already paid for / correctly scheduled). Changing the scheduled option only affects the
    // NEXT period — the cron will call refreshNextRenewalDate after the renewal triggers, at which
    // point it will use the new scheduledPrepayOptionId to compute the correct future date.

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

    const created = await this.prisma.subscriptionWaitlistEntry.create({
      data: {
        userId,
        subscriptionId: sub.id,
        ...(joinedAt ? { joinedAt: new Date(joinedAt) } : {}),
      },
      include: {
        subscription: {
          select: {
            id: true,
            slug: true,
            name: true,
            coverImage: true,
            coverImageAsset: { select: { id: true, publicId: true } },
          },
        },
      },
    });
    return {
      ...created,
      subscription: this.mapSubscriptionAssets(created.subscription),
    };
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
            coverImageAsset: { select: { id: true, publicId: true } },
            isDiscontinued: true,
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                logoAsset: { select: { id: true, publicId: true } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const now = new Date();
    return entries.map((e) => ({
      ...e,
      subscription: this.mapSubscriptionAssets(e.subscription),
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

    // Try DB snapshot first (written by cron or isForwarding change)
    const snapshot = await this.prisma.subscriptionCountryFeeSnapshot.findUnique({
      where: { subscriptionId_country: { subscriptionId: subscription.id, country: country.toUpperCase() } },
    });

    if (snapshot) {
      const data = snapshot.data as unknown as CountryFeeHint[];
      this.countryFeeCache.set(key, { data, expiresAt: Date.now() + 3_600_000 });
      return data;
    }

    // No snapshot yet — compute live (purchase groups → entry-settings fallback)
    const data = await this.countryFeeSnapshotService.computeForSubscriptionAndCountry(subscription.id, country);
    this.countryFeeCache.set(key, { data, expiresAt: Date.now() + 3_600_000 });
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

  async listPriceChangesAdmin(slug: string) {
    const sub = await this.findBySlug(slug);
    return this.prisma.subscriptionPriceChange.findMany({
      where: { subscriptionId: sub.id },
      orderBy: [{ currency: 'asc' }, { effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
    });
  }

  async listPriceChanges(slug: string) {
    const sub = await this.findBySlug(slug);
    return this.prisma.subscriptionPriceChange.findMany({
      where: { subscriptionId: sub.id, NOT: { effectiveYear: 1900 } },
      orderBy: [{ currency: 'asc' }, { effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
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
        grandfatheredPrice: dto.grandfatheredPrice ?? false,
      },
      update: {
        newBasePrice: dto.newBasePrice,
        currency: dto.currency,
        notes: dto.notes ?? null,
        grandfatheredPrice: dto.grandfatheredPrice ?? false,
      },
    });
    await this.cache.del(this.subSlugKey(slug));
    return result;
  }

  async updatePriceChange(slug: string, id: string, dto: { newBasePrice: number; notes?: string; grandfatheredPrice?: boolean }) {
    const sub = await this.findBySlug(slug);
    const change = await this.prisma.subscriptionPriceChange.findUnique({ where: { id } });
    if (!change) throw new NotFoundException('Price change not found');
    if (change.subscriptionId !== sub.id) throw new ForbiddenException();
    const result = await this.prisma.subscriptionPriceChange.update({
      where: { id },
      data: {
        newBasePrice: dto.newBasePrice,
        notes: dto.notes ?? null,
        ...(dto.grandfatheredPrice !== undefined && { grandfatheredPrice: dto.grandfatheredPrice }),
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
      select: { id: true, year: true, month: true },
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

    const sourceMonthIds = sourceMonths.map(m => m.id);

    const { count } = await this.prisma.subscriptionMonth.updateMany({
      where: { subscriptionId: source.id },
      data: { subscriptionId: target.id },
    });

    // Also reassign book_editions whose subscriptionId still points to source,
    // for editions that appear in the migrated months.
    if (sourceMonthIds.length > 0) {
      const monthBooks = await this.prisma.subscriptionMonthBook.findMany({
        where: { monthId: { in: sourceMonthIds } },
        select: { editionId: true },
      });
      const editionIds = [...new Set(monthBooks.map(mb => mb.editionId).filter((id): id is string => id !== null))];
      if (editionIds.length > 0) {
        await this.prisma.bookEdition.updateMany({
          where: { id: { in: editionIds }, subscriptionId: source.id },
          data: { subscriptionId: target.id },
        });
      }
    }

    return { migratedCount: count, sourceId: source.id, targetId: target.id };
  }

  // ── Manage Skips ────────────────────────────────────────────────────────────

  /**
   * Returns all subscription months from the user's join date up to (and including)
   * the last month whose renewal date has already passed.  Each month includes its
   * skip status and the books assigned to that month.
   */
  async getManagedMonths(userId: string, slug: string) {
    const sub = await this.findBySlug(slug);
    const isCombo = (sub as any).isCombo as boolean;
    const componentIds: string[] = (sub as any).componentIds ?? [];
    // For variant streams: months live on the parent subscription
    const subId = (sub as any).parentSubscriptionId ?? sub.id;
    // For combo subscriptions: months live on the component subscriptions
    const monthsSubscriptionIds: string[] = isCombo
      ? await this.resolveEffectiveComponentIds(componentIds)
      : [subId];

    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: sub.id, active: true },
      select: {
        id: true,
        startDate: true,
        renewalDay: true,
        skipRecords: {
          where: { undoneAt: null },
          select: { month: { select: { year: true, month: true } } },
        },
      },
    });
    if (!entry) throw new NotFoundException('Subscription entry not found');

    const renewalDay: number =
      entry.renewalDay ?? (sub as any).renewalDay ?? 1;
    const renewalMonthOffset: number = (sub as any).renewalMonthOffset ?? 0;
    const signupIncludesCurrentMonth: boolean = (sub as any).signupIncludesCurrentMonth ?? false;
    const now = new Date();

    // First eligible box month — same renewal-cycle logic as joinSubscription/getEligibleMonths
    const joinDate = entry.startDate ? new Date(entry.startDate) : now;
    const { year: startYear, month: startMonth } = computeFirstEligibleBoxMonth(
      joinDate, renewalDay, renewalMonthOffset, signupIncludesCurrentMonth,
    );

    // Last processed box month — upper limit
    const { year: limitYear, month: limitMonth } = computeLastProcessedBoxMonth(
      now, renewalDay, renewalMonthOffset,
    );

    // Build set of skipped months for O(1) lookup
    const skippedSet = new Set<string>(
      (entry.skipRecords as any[]).map(r => `${r.month.year}-${r.month.month}`),
    );

    // Fetch subscription months in the [start, limit] range
    const allMonths = await this.prisma.subscriptionMonth.findMany({
      where: {
        subscriptionId: { in: monthsSubscriptionIds },
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
      select: {
        year: true,
        month: true,
        books: {
          select: {
            editionId: true,
            book: {
              select: {
                title: true,
                authors: {
                  select: { author: { select: { name: true } } },
                  take: 2,
                },
              },
            },
          },
        },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    // Group by year/month, merging books from all component subscriptions (combo support)
    const grouped = new Map<string, {
      year: number; month: number;
      booksMap: Map<string, { title: string | null; author: string | null }>;
    }>();
    for (const m of allMonths) {
      const key = `${m.year}-${m.month}`;
      if (!grouped.has(key)) {
        grouped.set(key, { year: m.year, month: m.month, booksMap: new Map() });
      }
      for (const mb of (m.books as any[])) {
        const mapKey = mb.editionId ?? `noedition-${mb.book?.title ?? Math.random()}`;
        if (!grouped.get(key)!.booksMap.has(mapKey)) {
          grouped.get(key)!.booksMap.set(mapKey, {
            title: mb.book?.title ?? null,
            author: (mb.book?.authors as any[])?.map((a: any) => a.author?.name).filter(Boolean).join(', ') ?? null,
          });
        }
      }
    }

    const result = Array.from(grouped.values()).map(({ year, month, booksMap }) => {
      let ry = year, rm = month - renewalMonthOffset;
      while (rm <= 0) { rm += 12; ry--; }
      while (rm > 12) { rm -= 12; ry++; }
      const renewalDate = new Date(Date.UTC(ry, rm - 1, renewalDay));
      return {
        year,
        month,
        isSkipped: skippedSet.has(`${year}-${month}`),
        renewalDate: renewalDate.toISOString(),
        books: Array.from(booksMap.values()),
      };
    });

    return { entryId: entry.id, months: result };
  }

  /**
   * Bulk skip/unskip months for the user's active entry, optionally adding or removing
   * books from the collection for the affected months.
   */
  async manageSkips(
    userId: string,
    slug: string,
    dto: {
      toSkip: { year: number; month: number }[];
      toUnskip: { year: number; month: number }[];
      addBooksForUnskipped: boolean;
      removeBooksForSkipped: boolean;
      ownershipStatusForUnskipped?: 'OWNED' | 'PREORDER';
    },
  ) {
    const sub = await this.findBySlug(slug);
    const isCombo = (sub as any).isCombo as boolean;
    const componentIds: string[] = (sub as any).componentIds ?? [];
    const subId = (sub as any).parentSubscriptionId ?? sub.id;
    const monthsSubscriptionIds: string[] = isCombo
      ? await this.resolveEffectiveComponentIds(componentIds)
      : [subId];
    const now = new Date();

    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: sub.id, active: true },
      include: {
        feeTemplates: { include: { feeTemplate: true } },
      },
    });
    if (!entry) throw new NotFoundException('Subscription entry not found');

    const renewalDay: number =
      entry.renewalDay ?? (sub as any).renewalDay ?? 1;
    const renewalMonthOffset: number = (sub as any).renewalMonthOffset ?? 0;

    // ── Apply new skips ───────────────────────────────────────────────────────
    for (const { year, month } of dto.toSkip) {
      const subMonth = await this.prisma.subscriptionMonth.findFirst({
        where: { subscriptionId: { in: monthsSubscriptionIds }, year, month },
      });
      if (!subMonth) continue;
      await this.prisma.userSkipRecord.upsert({
        where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: subMonth.id } },
        create: {
          userId,
          userEntryId: entry.id,
          subscriptionMonthId: subMonth.id,
          windowKey: null,
          skippedAt: now,
        },
        update: { undoneAt: null, skippedAt: now },
      });
    }

    // ── Apply unskips ─────────────────────────────────────────────────────────
    for (const { year, month } of dto.toUnskip) {
      const subMonth = await this.prisma.subscriptionMonth.findFirst({
        where: { subscriptionId: { in: monthsSubscriptionIds }, year, month },
      });
      if (!subMonth) continue;
      await this.prisma.userSkipRecord.updateMany({
        where: { userEntryId: entry.id, subscriptionMonthId: subMonth.id, undoneAt: null },
        data: { undoneAt: now },
      });
    }

    // ── Add books for unskipped months ────────────────────────────────────────
    if (dto.addBooksForUnskipped && dto.toUnskip.length > 0) {
      for (const { year, month } of dto.toUnskip) {
        const subMonth = await this.prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: monthsSubscriptionIds }, year, month },
          select: {
            year: true,
            month: true,
            signatureType: true,
            books: { select: { editionId: true, bookId: true, signatureType: true } },
          },
        });
        if (!subMonth || subMonth.books.length === 0) continue;

        const ownershipStatus: 'OWNED' | 'PREORDER' =
          dto.ownershipStatusForUnskipped ?? 'OWNED';

        const feeTemplates = entry.feeTemplates as any[];
        const basePrice = entry.basePrice ? parseFloat((entry.basePrice as any).toString()) : 0;
        const shippingCost = entry.shippingCost ? parseFloat((entry.shippingCost as any).toString()) : null;
        const currency = entry.costCurrency ?? 'GBP';

        // Use renewal date for purchasedAt timestamp (box month → renewal month)
        let ry = year, rm = month - renewalMonthOffset;
        while (rm <= 0) { rm += 12; ry--; }
        while (rm > 12) { rm -= 12; ry++; }
        const renewalDate = new Date(Date.UTC(ry, rm - 1, renewalDay));

        const group = await this.prisma.userPurchaseGroup.create({
          data: {
            userId,
            fromSubscription: true,
            subscriptionEntryId: entry.id,
            title: `${sub.name} – ${String(year)}/${String(month).padStart(2, '0')}`,
            totalAmount: basePrice,
            shippingAmount: shippingCost ?? null,
            currency,
            purchasedAt: renewalDate,
          },
        });

        for (const mb of subMonth.books) {
          if (!mb.editionId || !mb.bookId) continue;
          await this.upsertSubscriptionBookEntry({
            userId,
            bookId: mb.bookId,
            editionId: mb.editionId,
            subscriptionEntryId: entry.id,
            purchaseGroupId: group.id,
            signatureType: mb.signatureType ?? null,
            changedAt: renewalDate,
            ownershipStatus,
          });
        }

        // Add fee template charges
        const feesToCreate: any[] = [];
        for (const link of feeTemplates) {
          const ft = link.feeTemplate;
          const feeCurrency = (link.customCurrency ?? ft.defaultCurrency ?? currency) as string;
          const feeAmount = link.customAmount
            ? parseFloat(link.customAmount.toString())
            : ft.defaultAmount
              ? parseFloat(ft.defaultAmount.toString())
              : null;
          if (feeAmount == null || isNaN(feeAmount)) continue;
          feesToCreate.push({
            userId,
            feeTemplateId: ft.id,
            name: ft.name,
            amount: feeAmount,
            currency: feeCurrency,
            date: renewalDate,
            category: ft.category ?? 'OTHER',
            purchaseGroupId: group.id,
          });
        }
        if (feesToCreate.length > 0) {
          await this.prisma.userPurchaseFee.createMany({ data: feesToCreate, skipDuplicates: true });
        }
      }
    }

    // ── Remove books for newly-skipped months ─────────────────────────────────
    if (dto.removeBooksForSkipped && dto.toSkip.length > 0) {
      for (const { year, month } of dto.toSkip) {
        const subMonth = await this.prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: monthsSubscriptionIds }, year, month },
          select: { books: { select: { editionId: true } } },
        });
        if (!subMonth) continue;

        const editionIds = subMonth.books
          .map(b => b.editionId)
          .filter((id): id is string => id !== null);
        if (editionIds.length === 0) continue;

        // Delete book entries that came from this subscription entry (not manually added)
        const toDelete = await this.prisma.userBookEntry.findMany({
          where: {
            userId,
            editionId: { in: editionIds },
            subscriptionEntryId: entry.id,
          },
          select: { id: true, purchaseGroupId: true },
        });

        if (toDelete.length === 0) continue;

        await this.prisma.userBookEntry.deleteMany({
          where: { id: { in: toDelete.map(b => b.id) } },
        });

        // Delete ownershipStatusHistory for deleted entries
        await this.prisma.ownershipStatusHistory.deleteMany({
          where: { userBookEntryId: { in: toDelete.map(b => b.id) } },
        }).catch(() => {});

        // Remove empty purchase groups
        const groupIds = [...new Set(toDelete.map(b => b.purchaseGroupId).filter((id): id is string => id !== null))];
        for (const groupId of groupIds) {
          const remaining = await this.prisma.userBookEntry.count({ where: { purchaseGroupId: groupId } });
          if (remaining === 0) {
            await this.prisma.userPurchaseFee.deleteMany({ where: { purchaseGroupId: groupId } });
            await this.prisma.userPurchaseGroup.delete({ where: { id: groupId } }).catch(() => {});
          }
        }
      }
    }

    // Recompute skip state + renewal date
    await this.skipPolicyEngine.recomputeSkipState(userId, sub.id);
    await refreshNextRenewalDate(this.prisma, entry.id);
    backfillRenewalHistory(this.prisma, entry.id).catch(() => {});
    this.statsService.markStatsStale(userId);

    return { ok: true };
  }
}
