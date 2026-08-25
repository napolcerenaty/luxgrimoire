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
  CreateChoiceGroupDto,
  SubmitMonthChoiceDto,
} from './subscriptions.dto';
import { generateSlugFromParts, generateSubscriptionSlug } from '../../common/utils/slug.util';
import { resolvePerBookPrices } from '../../common/utils/price-allocation.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { findBySlugOrThrow } from '../../common/prisma.utils';
import { computeNextRenewalDate, refreshNextRenewalDate, backfillRenewalHistory, computeFirstEligibleBoxMonth, computeLastProcessedBoxMonth, computeDateAnchoredFirstBoxMonth, computeJoinDateWindow, getPreviousBoxUnitStart, resolveFirstBoxMonth, getBundleBoxStart, enumerateBundleMonths, isSubscriptionDueInMonth, entryCoversMonth, computeGlobalRenewalDay, renewalMonthFromBoxMonth } from '../../common/utils/renewal-date.util';
import { SkipPolicyEngine } from '../skip-policy/skip-policy.engine';
import { RenewalCronService } from './renewal.cron';
import { CountryFeeSnapshotCronService } from './country-fee-snapshot.cron';
import { resolveEffectiveBasePrice, parseFirstBilledYearMonth } from './price-change.util';
import { resolveEffectivePrepayOption, getSelectablePrepayOptions } from './prepay-option.util';
import { ensurePrepayBillingPeriod, findReusableBillingPeriod } from './prepay-billing-period.util';
import { resolveEffectiveSettings, SubscriptionSettings } from './subscription-settings.util';
import { resolveMonthBooksForEntry, persistMonthChoice, computeChoiceDeadline, materializeChoiceGroupBooks } from './subscription-month-choice.util';
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

export interface CatalogMonthBookItem {
  subscriptionId: string;
  subscriptionSlug: string;
  subscriptionName: string;
  companyName: string;
  companySlug: string;
  companyBrandColors: string[];
  bookId: string | null;
  bookSlug: string | null;
  bookTitle: string | null;
  seriesName: string | null;
  volumeNumbers: number[];
  authors: string[];
  editionId: string | null;
  editionSlug: string | null;
  coverImage: string | null;
  isPlaceholder: boolean;
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

  // Catalog-wide scans (admin month-gaps, public books-by-month) — global caches, not per-slug,
  // since both endpoints scan across every subscription for a given (year, month).
  private readonly CATALOG_GAPS_TTL = 24 * 60 * 60 * 1000;
  private readonly catalogGapsBustKey = () => 'subscriptions:catalog-gaps-bust';
  private readonly catalogGapsKey = (version: number, year: number, month: number) =>
    `subscriptions:catalog-gaps:v${version}:${year}:${month}`;

  private readonly CATALOG_BOOKS_TTL = 24 * 60 * 60 * 1000;
  private readonly catalogBooksBustKey = () => 'subscriptions:catalog-books-bust';
  private readonly catalogBooksKey = (version: number, year: number, month: number) =>
    `subscriptions:catalog-books:v${version}:${year}:${month}`;

  // Global renewal calendar (public /sales-calendar) — renewals barely change (only when a
  // subscription is added/edited, or the rare company-wide month skip), so a long TTL with no
  // explicit invalidation is an acceptable tradeoff: worst case is a stale render for a few hours.
  private readonly CALENDAR_RENEWALS_TTL = 24 * 60 * 60 * 1000;
  private readonly calendarRenewalsKey = (year: number, month: number) =>
    `subscriptions:calendar-renewals:${year}:${month}`;

  private async getCatalogGapsCacheVersion(): Promise<number> {
    return (await this.cache.get<number>(this.catalogGapsBustKey())) ?? 0;
  }

  private async getCatalogBooksCacheVersion(): Promise<number> {
    return (await this.cache.get<number>(this.catalogBooksBustKey())) ?? 0;
  }

  // Earliest year+month floor for the month pickers on the admin gaps / books-by-month pages —
  // derived from data instead of a guessed constant, since a subscription could predate (or
  // postdate) any fixed year we hardcode, and truncating to year-only would still let the picker
  // offer months before the earliest subscription actually started within its first year (e.g.
  // startDate 2015-03 would wrongly allow Jan/Feb 2015). Changes rarely (only on subscription
  // create/edit), so a long TTL is safe — same bust trigger as the catalog caches below.
  private readonly CATALOG_EARLIEST_MONTH_TTL = 7 * 24 * 60 * 60 * 1000;
  private readonly catalogEarliestMonthBustKey = () => 'subscriptions:catalog-earliest-month-bust';
  private readonly catalogEarliestMonthKey = (version: number) => `subscriptions:catalog-earliest-month:v${version}`;

  private async getCatalogEarliestMonthCacheVersion(): Promise<number> {
    return (await this.cache.get<number>(this.catalogEarliestMonthBustKey())) ?? 0;
  }

  /** Bumps all catalog-wide caches — called whenever a month/book/subscription mutation
   *  could change gap status, the books-by-month catalog, or the earliest-month floor. */
  private async invalidateCatalogMonthCaches(): Promise<void> {
    const now = Date.now();
    await Promise.all([
      this.cache.set(this.catalogGapsBustKey(), now, this.CATALOG_GAPS_TTL),
      this.cache.set(this.catalogBooksBustKey(), now, this.CATALOG_BOOKS_TTL),
      this.cache.set(this.catalogEarliestMonthBustKey(), now, this.CATALOG_EARLIEST_MONTH_TTL),
    ]);
  }

  /** Earliest (year, month) any (non-hidden) subscription could plausibly need a month for —
   *  used as the month pickers' lower bound instead of a hardcoded guess. Subscriptions with no
   *  startDate at all can't contribute a floor (nothing to derive one from) — that's a
   *  data-completeness gap to close by backfilling startDate, not something this query can
   *  compensate for. */
  async getCatalogEarliestMonth(): Promise<{ year: number; month: number }> {
    const FALLBACK = { year: 2015, month: 1 };
    const version = await this.getCatalogEarliestMonthCacheVersion();
    const cacheKey = this.catalogEarliestMonthKey(version);
    const cached = await this.cache.get<{ year: number; month: number }>(cacheKey);
    if (cached) return cached;

    const earliest = await this.prisma.subscription.findFirst({
      where: { isHidden: false, startDate: { not: null } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    });
    const result = earliest?.startDate
      ? { year: earliest.startDate.getUTCFullYear(), month: earliest.startDate.getUTCMonth() + 1 }
      : FALLBACK;
    await this.cache.set(cacheKey, result, this.CATALOG_EARLIEST_MONTH_TTL);
    return result;
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
        hasBookChoiceMonths: dto.hasBookChoiceMonths ?? false,
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
    void this.invalidateCatalogMonthCaches();
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
              country: true,
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
                            variantLabel: true,
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
                    variantLabel: true,
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
                  variantLabel: true,
                },
              },
            },
          },
        },
      }) as typeof months;
    }

    const { comboComponents, months: _months, priceChanges, ...rest } = subscription;

    // For combo subscriptions: if any component is a content stream variant,
    // its months live on the parent subscription — replace the empty months array. Also
    // resolves each component's own company-wide skips (same date window as its months), same
    // as the top-level `skippedMonths` below — a combo's public page renders each component's
    // current/upcoming card from this same data, and without this, a skipped component month
    // would be invisible there even though it's already correctly reflected everywhere else.
    const processedComboComponents = await Promise.all(
      comboComponents.map(async (cc) => {
        const comp = cc.component as any;
        const compContentStreamId: string = comp.parentSubscriptionId ?? comp.id;

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

        const compSkippedMonths = await this.prisma.subscriptionMonthSkip.findMany({
          where: { subscriptionId: compContentStreamId, undoneAt: null, AND: andConds },
          select: { year: true, month: true, reason: true },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });

        if (!comp.parentSubscriptionId) {
          return { ...cc, component: { ...comp, skippedMonths: compSkippedMonths } };
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
                    variantLabel: true,
                  },
                },
              },
            },
          },
        });
        return { ...cc, component: { ...comp, months: parentMonths, skippedMonths: compSkippedMonths } };
      }),
    );

    const sentinelRecord = priceChanges.find((pc) => pc.effectiveYear === 1900 && pc.effectiveMonth === 1 && pc.currency === rest.currency);

    // Company-wide month skips, same date window as `months` above (current-month-onward, or
    // bundle-window-adjusted). A skipped month with no SubscriptionMonth row never appears in
    // `months` at all, so this is returned separately for the page to render an explicit
    // "Skipped" card in the right chronological slot rather than a silent gap. Variants resolve
    // to the content-stream (parent) id, same as `months` does above — skips are always written
    // at that level (see SubscriptionMonthSkip).
    const skipContentStreamId = subscription.parentSubscriptionId ?? subscription.id;
    const skippedMonths = await this.prisma.subscriptionMonthSkip.findMany({
      where: {
        subscriptionId: skipContentStreamId,
        undoneAt: null,
        OR: [
          { year: { gt: monthsFromYear } },
          { year: monthsFromYear, month: { gte: monthsFromMonth } },
        ],
      },
      select: { year: true, month: true, reason: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

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
      skippedMonths,
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
    void this.invalidateCatalogMonthCaches();
    return this.mapSubscriptionAssets(updated);
  }

  async delete(slug: string) {
    const sub = await this.findBySlug(slug);
    await this.uploadService.deleteImages([sub.coverImage, sub.logoUrl]);
    await this.typesense.deleteDocument('subscriptions', sub.id);
    void this.invalidateCatalogMonthCaches();
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
              id: true,
              bookId: true,
              editionId: true,
              isMainBook: true,
              signatureType: true,
              choiceGroupId: true,
              book: { select: { id: true, title: true, slug: true } },
              edition: {
                select: {
                  id: true,
                  slug: true,
                  additionalImages: true,
                  variantLabel: true,
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

  /** Filters isSubscriptionDueInMonth's result down to subscriptions that aren't company-wide
   *  skipped for (year, month) — see SubscriptionMonthSkip. One batched query, not per-candidate;
   *  callers here already restrict candidates to parentSubscriptionId: null (content-stream/parent
   *  subscriptions only), which is exactly the id level SubscriptionMonthSkip rows are written at
   *  (markMonthSkipped denormalizes one row per content-stream member), so no further parent/variant
   *  resolution is needed. */
  private async excludeCompanySkippedMonth<T extends {
    id: string;
    startDate: Date | null;
    endDate: Date | null;
    isDiscontinued: boolean;
    isHidden: boolean;
    isUpcoming?: boolean;
    intervalMonths?: number;
    startingMonth?: number | null;
    isBundleSubscription?: boolean;
  }>(
    candidates: T[],
    year: number,
    month: number,
  ): Promise<T[]> {
    const dueBase = candidates.filter((s) => isSubscriptionDueInMonth(s, year, month));
    if (dueBase.length === 0) return dueBase;
    const skipped = await this.prisma.subscriptionMonthSkip.findMany({
      where: { subscriptionId: { in: dueBase.map((s) => s.id) }, year, month, undoneAt: null },
      select: { subscriptionId: true },
    });
    const skippedIds = new Set(skipped.map((s) => s.subscriptionId));
    return dueBase.filter((s) => !skippedIds.has(s.id));
  }

  /** Admin catalog scan: for the given (year, month), find every non-combo, non-multi-month-bundle
   *  subscription due to ship that month and flag ones missing the month itself, missing books, or
   *  whose book(s) have no features yet (some companies announce the title before the edition's
   *  customization/features are finalized — this flags those so they get revisited later).
   *  Variants (parentSubscriptionId set) are never scanned directly — their months live on the
   *  parent, so checking the parent is sufficient. */
  async getMonthGaps(year: number, month: number) {
    const version = await this.getCatalogGapsCacheVersion();
    const cacheKey = this.catalogGapsKey(version, year, month);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const candidates = await this.prisma.subscription.findMany({
      where: {
        isCombo: false,
        parentSubscriptionId: null,
        OR: [{ isBundleSubscription: false }, { intervalMonths: { lte: 1 } }],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        startDate: true,
        endDate: true,
        isDiscontinued: true,
        isHidden: true,
        isUpcoming: true,
        isContentStream: true,
        intervalMonths: true,
        startingMonth: true,
        isBundleSubscription: true,
        company: { select: { name: true, slug: true } },
      },
    });

    const due = await this.excludeCompanySkippedMonth(candidates, year, month);

    type MonthGapItem = {
      subscriptionId: string;
      slug: string;
      name: string;
      companyName: string;
      companySlug: string;
      isContentStream: boolean;
      status: 'missing_month' | 'missing_book' | 'missing_features';
    };
    let gaps: MonthGapItem[] = [];

    if (due.length > 0) {
      const dueIds = due.map((s) => s.id);
      const months = await this.prisma.subscriptionMonth.findMany({
        where: { subscriptionId: { in: dueIds }, year, month },
        select: {
          subscriptionId: true,
          _count: { select: { books: true } },
          books: { select: { edition: { select: { featureTags: { select: { id: true }, take: 1 } } } } },
        },
      });
      const monthBySubId = new Map(months.map((m) => [m.subscriptionId, m]));

      gaps = due.flatMap((s): MonthGapItem[] => {
        const m = monthBySubId.get(s.id);
        const base = {
          subscriptionId: s.id,
          slug: s.slug,
          name: s.name,
          companyName: s.company.name,
          companySlug: s.company.slug,
          isContentStream: s.isContentStream,
        };
        if (!m) return [{ ...base, status: 'missing_month' }];
        if (m._count.books === 0) return [{ ...base, status: 'missing_book' }];
        const missingFeatures = m.books.some((b) => b.edition.featureTags.length === 0);
        if (missingFeatures) return [{ ...base, status: 'missing_features' }];
        return [];
      });
    }

    const result = { year, month, totalEligible: due.length, gaps };
    await this.cache.set(cacheKey, result, this.CATALOG_GAPS_TTL);
    return result;
  }

  /** Public catalog scan for the "Books by Month" page: every book across every eligible
   *  subscription (combo/bundle/content-stream all included — combos resolved to their
   *  component subscriptions, which already appear as their own candidates) for a given
   *  (year, month). Cached globally, identical for every viewer; `userId` (if logged in)
   *  only drives the cheap, uncached "mine"/"skipped" highlight overlay. */
  async getBooksByMonth(userId: string | null, year: number, month: number) {
    const now = new Date();
    const nowAbs = now.getFullYear() * 12 + now.getMonth();
    const reqAbs = year * 12 + (month - 1);
    if (reqAbs > nowAbs + 2) {
      throw new BadRequestException('Cannot view more than 2 months into the future');
    }

    const version = await this.getCatalogBooksCacheVersion();
    const catalogCacheKey = this.catalogBooksKey(version, year, month);
    let catalogItems = await this.cache.get<CatalogMonthBookItem[]>(catalogCacheKey);
    if (!catalogItems) {
      catalogItems = await this.buildCatalogMonthBooks(year, month);
      await this.cache.set(catalogCacheKey, catalogItems, this.CATALOG_BOOKS_TTL);
    }

    const highlightMap = userId ? await this.buildUserHighlightMap(userId, year, month) : new Map<string, 'mine' | 'skipped'>();

    return {
      year,
      month,
      items: catalogItems.map((item) => ({ ...item, highlight: highlightMap.get(item.subscriptionId) ?? null })),
    };
  }

  /** Builds the full, unpersonalized catalog of books for (year, month) — one item per
   *  subscription-month-book, or a placeholder item for subscriptions due that month with
   *  no month/books added yet. NEVER expands combos into their components here — combos own
   *  no SubscriptionMonth rows themselves and are excluded as candidates; their components
   *  already appear as their own independent candidates, so expanding combos too would
   *  duplicate every component's books. */
  private async buildCatalogMonthBooks(year: number, month: number): Promise<CatalogMonthBookItem[]> {
    const candidates = await this.prisma.subscription.findMany({
      where: { isCombo: false, parentSubscriptionId: null },
      select: {
        id: true,
        slug: true,
        name: true,
        startDate: true,
        endDate: true,
        isDiscontinued: true,
        isHidden: true,
        isUpcoming: true,
        intervalMonths: true,
        startingMonth: true,
        isBundleSubscription: true,
        company: { select: { name: true, slug: true, brandColors: true } },
      },
      orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
    });

    const due = await this.excludeCompanySkippedMonth(candidates, year, month);
    if (due.length === 0) return [];

    const dueIds = due.map((s) => s.id);
    const months = await this.prisma.subscriptionMonth.findMany({
      where: { subscriptionId: { in: dueIds }, year, month },
      select: {
        subscriptionId: true,
        books: {
          orderBy: [{ isMainBook: 'desc' }, { sortOrder: 'asc' }],
          select: {
            bookId: true,
            editionId: true,
            book: { select: { slug: true, title: true, seriesName: true, volumeNumbers: true, authors: { select: { author: { select: { name: true } } } } } },
            edition: {
              select: {
                slug: true,
                additionalImages: true,
                // Same official-cover-first, community-photo-fallback precedence used
                // everywhere else covers are shown (editions/books/collection/search/etc.) —
                // APPROVED only, never PENDING/REMOVED, in a public-facing catalog.
                communityImages: {
                  where: { status: 'APPROVED' },
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                  select: { url: true },
                },
              },
            },
          },
        },
      },
    });
    const monthBySubId = new Map(months.map((m) => [m.subscriptionId, m]));

    const items: CatalogMonthBookItem[] = [];
    for (const s of due) {
      const m = monthBySubId.get(s.id);
      const base = {
        subscriptionId: s.id,
        subscriptionSlug: s.slug,
        subscriptionName: s.name,
        companyName: s.company.name,
        companySlug: s.company.slug,
        companyBrandColors: s.company.brandColors,
      };
      if (!m || m.books.length === 0) {
        items.push({
          ...base,
          bookId: null,
          bookSlug: null,
          bookTitle: null,
          seriesName: null,
          volumeNumbers: [],
          authors: [],
          editionId: null,
          editionSlug: null,
          coverImage: null,
          isPlaceholder: true,
        });
        continue;
      }
      for (const mb of m.books) {
        items.push({
          ...base,
          bookId: mb.bookId,
          bookSlug: mb.book.slug,
          bookTitle: mb.book.title,
          seriesName: mb.book.seriesName,
          volumeNumbers: mb.book.volumeNumbers,
          authors: mb.book.authors.map((a: { author: { name: string } }) => a.author.name),
          editionId: mb.editionId,
          editionSlug: mb.edition?.slug ?? null,
          coverImage: mb.edition?.additionalImages?.[0] ?? mb.edition?.communityImages?.[0]?.url ?? null,
          isPlaceholder: false,
        });
      }
    }
    return items;
  }

  /** Resolves which subscriptionIds a user's active entries (direct or via combo) map to for
   *  (year, month), so the catalog list above can be overlaid with 'mine'/'skipped' highlights. */
  private async buildUserHighlightMap(userId: string, year: number, month: number): Promise<Map<string, 'mine' | 'skipped'>> {
    const allEntries = await this.prisma.userSubscriptionEntry.findMany({
      where: { userId },
      select: {
        id: true,
        active: true,
        startDate: true,
        cancellationDate: true,
        subscription: {
          select: {
            id: true,
            isCombo: true,
            parentSubscriptionId: true,
            comboComponents: { select: { componentId: true } },
          },
        },
      },
    });
    // Include cancelled entries that were still active (or skipped) during the viewed month —
    // "mine"/"skipped" should reflect what was true THEN, not the user's current subscription list.
    const entries = allEntries.filter((e) => entryCoversMonth(e, year, month));
    if (entries.length === 0) return new Map();

    const highlightMap = new Map<string, 'mine' | 'skipped'>();
    const entryToSubIds = new Map<string, string[]>();
    for (const entry of entries) {
      const ids = entry.subscription.isCombo
        ? await this.resolveEffectiveComponentIds(entry.subscription.comboComponents.map((c) => c.componentId))
        : [entry.subscription.parentSubscriptionId ?? entry.subscription.id];
      entryToSubIds.set(entry.id, ids);
      for (const id of ids) if (!highlightMap.has(id)) highlightMap.set(id, 'mine');
    }

    const allSubIds = [...new Set([...entryToSubIds.values()].flat())];
    const monthsForRange = await this.prisma.subscriptionMonth.findMany({
      where: { subscriptionId: { in: allSubIds }, year, month },
      select: { id: true, subscriptionId: true },
    });
    const monthIdBySubId = new Map(monthsForRange.map((m) => [m.subscriptionId, m.id]));

    const skipLookups: { entryId: string; monthId: string; subIds: string[] }[] = [];
    for (const entry of entries) {
      const ids = entryToSubIds.get(entry.id)!;
      const targetSubId = ids.find((id) => monthIdBySubId.has(id));
      if (targetSubId) skipLookups.push({ entryId: entry.id, monthId: monthIdBySubId.get(targetSubId)!, subIds: ids });
    }
    if (skipLookups.length > 0) {
      const skips = await this.prisma.userSkipRecord.findMany({
        where: {
          undoneAt: null,
          OR: skipLookups.map((l) => ({ userEntryId: l.entryId, subscriptionMonthId: l.monthId })),
        },
        select: { userEntryId: true, subscriptionMonthId: true },
      });
      const skippedSet = new Set(skips.map((s) => `${s.userEntryId}:${s.subscriptionMonthId}`));
      for (const l of skipLookups) {
        if (skippedSet.has(`${l.entryId}:${l.monthId}`)) {
          for (const id of l.subIds) highlightMap.set(id, 'skipped');
        }
      }
    }
    return highlightMap;
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
    void this.invalidateCatalogMonthCaches();
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

    const deleted = await this.deleteMonthRow(existing);

    void this.invalidateMonthsCache(subscriptionSlug);
    void this.invalidateCatalogMonthCaches();
    return deleted;
  }

  /** BookEdition.subscriptionId is a denormalized "which subscription is this from" flag —
   *  addBookToMonth backfills it, but nothing pointed at it undoes that on removal, so it kept
   *  reading as "part of a subscription" long after the last SubscriptionMonthBook linking it
   *  was gone. Clears it only when truly orphaned — an edition can be (or have been) linked from
   *  more than one month, so removing one link isn't enough on its own to unset the flag. */
  private async unsetEditionSubscriptionFlagIfOrphaned(editionId: string): Promise<void> {
    const stillLinked = await this.prisma.subscriptionMonthBook.findFirst({ where: { editionId } });
    if (!stillLinked) {
      await this.prisma.bookEdition.updateMany({ where: { id: editionId }, data: { subscriptionId: null } });
    }
  }

  /** Shared by deleteMonth and markMonthSkipped: deletes a SubscriptionMonth row, its cover/
   *  spoiler images, and (via the row's own cascade) any linked SubscriptionMonthBook rows —
   *  then clears BookEdition.subscriptionId for any edition left with no remaining link at all. */
  private async deleteMonthRow(existing: { id: string; coverImage: string | null; spoilerImage: string | null }) {
    await this.uploadService.deleteImages([existing.coverImage, existing.spoilerImage]);

    const linkedEditionIds = (await this.prisma.subscriptionMonthBook.findMany({
      where: { monthId: existing.id },
      select: { editionId: true },
    })).map((b) => b.editionId);

    const deleted = await this.prisma.subscriptionMonth.delete({ where: { id: existing.id } });

    // Awaited, not fire-and-forget: this is a data-integrity fix (a stale "from a subscription"
    // flag), not cosmetic cleanup like the image deletion below — it should be done by the time
    // this call returns, not "eventually".
    await Promise.all([...new Set(linkedEditionIds)].map((id) => this.unsetEditionSubscriptionFlagIfOrphaned(id)));

    // Clean up orphaned media assets after record is deleted
    for (const publicId of [existing.coverImage, existing.spoilerImage]) {
      if (publicId) void this.mediaAssetsService?.deleteIfUnused(publicId as string, this.uploadService);
    }

    return deleted;
  }

  /** Recomputes nextRenewalDate for every active entry across the given subscription ids.
   *  Mirrors renewal.cron.ts's per-entry try/catch loop — one entry's failure never blocks or
   *  rolls back another's, and the caller gets back a summary instead of a silent partial result. */
  private async recalculateRenewalDatesForSubscriptions(subscriptionIds: string[]): Promise<{
    succeeded: number;
    failed: { entryId: string; error: string }[];
  }> {
    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: { subscriptionId: { in: subscriptionIds }, active: true },
      select: { id: true },
    });
    const failed: { entryId: string; error: string }[] = [];
    let succeeded = 0;
    for (const entry of entries) {
      try {
        await refreshNextRenewalDate(this.prisma, entry.id);
        succeeded++;
      } catch (err: any) {
        this.logger.error(`[MonthSkip] recompute failed for entry ${entry.id}: ${err?.message}`);
        failed.push({ entryId: entry.id, error: err?.message ?? 'unknown error' });
      }
    }
    return { succeeded, failed };
  }

  /** Admin-declared "this month doesn't happen" for a subscription's whole content stream —
   *  company-wide, NOT the per-user UserSkipRecord/manageSkips flow. Cascades: resolves the
   *  content-stream (parent) id plus every variant pointing at it, and writes one
   *  SubscriptionMonthSkip row per member — so marking skip via any variant's slug applies to
   *  every sibling variant sharing that content, matching how SubscriptionMonth content itself
   *  is already shared at the parent level. Combos own no months of their own and are rejected;
   *  mark the underlying component subscription instead.
   *
   *  If a SubscriptionMonth row already exists for this month, it's deleted as part of marking
   *  the skip (requires deleteExistingContent: true — otherwise rejected with a clear error).
   *  This isn't just cleanup: several unrelated code paths (skip-policy.engine.ts's personal-skip
   *  candidate search, refreshNextRenewalDate's paymentOnStartup anchor, renewal.cron's
   *  prepaid-window-skip count) treat "a SubscriptionMonth row exists" as "real content exists" —
   *  leaving stale content behind a skip would silently feed those the wrong answer. Deleting it
   *  keeps that invariant true everywhere, not just in the places this feature explicitly audited. */
  async markMonthSkipped(slug: string, year: number, month: number, reason: string | undefined, adminUserId: string, deleteExistingContent = false) {
    const { contentStreamId, memberIds } = await this.resolveContentStreamMembers(slug, 'mark');

    const existingMonth = await this.prisma.subscriptionMonth.findUnique({
      where: { subscriptionId_year_month: { subscriptionId: contentStreamId, year, month } },
      include: { books: { select: { id: true } } },
    });
    if (existingMonth) {
      if (!deleteExistingContent) {
        throw new ConflictException(
          `This month already has content (theme/cover/${existingMonth.books.length} book(s) linked). ` +
          'Pass deleteExistingContent: true to confirm permanent deletion before skipping.',
        );
      }
      await this.deleteMonthRow(existingMonth);
    }

    await Promise.all(memberIds.map((id) =>
      this.prisma.subscriptionMonthSkip.upsert({
        where: { subscriptionId_year_month: { subscriptionId: id, year, month } },
        create: { subscriptionId: id, year, month, reason: reason ?? null, createdBy: adminUserId },
        update: { undoneAt: null, reason: reason ?? null, createdBy: adminUserId },
      }),
    ));

    const recompute = await this.recalculateRenewalDatesForSubscriptions(memberIds);

    void this.invalidateMonthsCache(slug);
    void this.invalidateCatalogMonthCaches();

    return { subscriptionId: contentStreamId, memberSubscriptionIds: memberIds, year, month, reason: reason ?? null, ...recompute };
  }

  /** Resolves a subscription slug to its content-stream (parent) id and every member id
   *  (the parent plus every variant pointing at it) — shared by mark/unmarkMonthSkipped so
   *  both cascade identically. Rejects combos, which own no months of their own. */
  private async resolveContentStreamMembers(slug: string, action: 'mark' | 'unmark'): Promise<{ contentStreamId: string; memberIds: string[] }> {
    const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    if ((sub as any).isCombo) {
      throw new BadRequestException(`Cannot ${action} a combo subscription as skipped — ${action} the underlying component subscription instead.`);
    }

    const contentStreamId: string = (sub as any).parentSubscriptionId ?? (sub as any).id;
    const members = await this.prisma.subscription.findMany({
      where: { OR: [{ id: contentStreamId }, { parentSubscriptionId: contentStreamId }] },
      select: { id: true },
    });
    return { contentStreamId, memberIds: members.map((m) => m.id) };
  }

  /** Unmarks a company-wide month skip — cascades to the whole content stream (parent + every
   *  variant), symmetric with markMonthSkipped. A skip is a property of the shipment, not the
   *  billing plan a variant represents, so there's no realistic scenario where one variant ships
   *  while a sibling variant of the same physical box doesn't; keeping mark/unmark symmetric is
   *  far less surprising than a "mark broadcasts, unmark narrowcasts" split ever was. */
  async unmarkMonthSkipped(slug: string, year: number, month: number) {
    const { contentStreamId, memberIds } = await this.resolveContentStreamMembers(slug, 'unmark');

    await this.prisma.subscriptionMonthSkip.updateMany({
      where: { subscriptionId: { in: memberIds }, year, month, undoneAt: null },
      data: { undoneAt: new Date() },
    });

    const recompute = await this.recalculateRenewalDatesForSubscriptions(memberIds);

    void this.invalidateMonthsCache(slug);
    void this.invalidateCatalogMonthCaches();

    return { subscriptionId: contentStreamId, memberSubscriptionIds: memberIds, year, month, ...recompute };
  }

  /** Lists currently-active company-wide month skips for a subscription — a reason is meant to
   *  be shown to subscribers (see the admin skip form's copy), so this is public, not admin-only.
   *  Feeds both the admin months editor (existing SubscriptionMonth rows shown as "Skipped", plus
   *  skip-only entries with no content row at all) and the public subscription page / past-months
   *  archive. A variant subscription's slug resolves transparently to its content-stream parent —
   *  same as getMonths/_fetchSubscriptionBySlug — rather than being rejected, since a variant's
   *  own public page needs this data too. Optional date bounds let a paginated caller (the
   *  past-months archive) match its own page window; omitted, every active skip is returned. */
  async listMonthSkips(slug: string, fromYear?: number, fromMonth?: number, untilYear?: number, untilMonth?: number) {
    const sub = await this.prisma.subscription.findUnique({
      where: { slug },
      select: { id: true, parentSubscriptionId: true },
    });
    if (!sub) throw new NotFoundException(`Subscription '${slug}' not found`);
    const effectiveId = sub.parentSubscriptionId ?? sub.id;

    const andConditions: Record<string, unknown>[] = [];
    if (fromYear != null) {
      const fy = fromYear;
      const fm = fromMonth ?? 1;
      andConditions.push({ OR: [{ year: { gt: fy } }, { year: fy, month: { gte: fm } }] });
    }
    if (untilYear != null) {
      const uy = untilYear;
      const um = untilMonth ?? 12;
      andConditions.push({ OR: [{ year: { lt: uy } }, { year: uy, month: { lte: um } }] });
    }

    return this.prisma.subscriptionMonthSkip.findMany({
      where: andConditions.length > 0
        ? { subscriptionId: effectiveId, undoneAt: null, AND: andConditions }
        : { subscriptionId: effectiveId, undoneAt: null },
      select: { year: true, month: true, reason: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
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

    const edition = await this.prisma.bookEdition.findUnique({
      where: { id: dto.editionId },
      select: { id: true, bookId: true },
    });
    if (!edition || edition.bookId !== dto.bookId) {
      throw new BadRequestException('Edition does not belong to the given book');
    }

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
      // Unique on [monthId, editionId] — this exact edition is already attached to this month.
      throw new ConflictException('This edition is already added to this month');
    }

    // If attaching an existing edition that has no subscriptionId yet, backfill it now
    await this.prisma.bookEdition.updateMany({
      where: { id: dto.editionId, subscriptionId: null },
      data: { subscriptionId: subscription.id },
    });

    // Retroactively add this book to users whose renewal for this month already occurred
    this.renewalCron.retroactivelyAddBookForSubscribers(
      subscription.id,
      { id: monthRecord.id, year, month, signatureType: monthRecord.signatureType ?? null },
      { bookId: dto.bookId, editionId: dto.editionId, signatureType: (dto.signatureType as $Enums.SignatureType | null) ?? null },
    ).catch(() => {});

    void this.invalidateMonthsCache(subscriptionSlug);
    void this.invalidateCatalogMonthCaches();
    return newBook;
  }

  async removeBookFromMonth(
    subscriptionSlug: string,
    year: number,
    month: number,
    monthBookId: string,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    const existing = await this.prisma.subscriptionMonthBook.findUnique({ where: { id: monthBookId } });
    if (!existing || existing.monthId !== monthRecord.id) {
      throw new NotFoundException('Book not found on this month');
    }

    const result = await this.prisma.subscriptionMonthBook.delete({ where: { id: monthBookId } });
    await this.unsetEditionSubscriptionFlagIfOrphaned(existing.editionId);
    void this.invalidateMonthsCache(subscriptionSlug);
    void this.invalidateCatalogMonthCaches();
    return result;
  }

  async updateMonthBook(
    subscriptionSlug: string,
    year: number,
    month: number,
    monthBookId: string,
    dto: UpdateMonthBookDto,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    const existing = await this.prisma.subscriptionMonthBook.findUnique({ where: { id: monthBookId } });
    if (!existing || existing.monthId !== monthRecord.id) {
      throw new NotFoundException('Book not found on this month');
    }

    const result = await this.prisma.subscriptionMonthBook.update({
      where: { id: monthBookId },
      data: { signatureType: dto.signatureType ?? null },
    });
    void this.invalidateMonthsCache(subscriptionSlug);
    return result;
  }

  /**
   * Groups 2+ already-attached SubscriptionMonthBook rows (distinct editions) as
   * mutually-selectable alternatives for a month. Schedules a book-choice reminder for
   * every currently active subscriber so they know a choice is open.
   */
  async createChoiceGroup(
    subscriptionSlug: string,
    year: number,
    month: number,
    dto: CreateChoiceGroupDto,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    const uniqueIds = [...new Set(dto.monthBookIds)];
    if (uniqueIds.length < 2) {
      throw new BadRequestException('A choice group needs at least 2 distinct options');
    }

    const options = await this.prisma.subscriptionMonthBook.findMany({
      where: { id: { in: uniqueIds } },
    });
    if (options.length !== uniqueIds.length || options.some((o) => o.monthId !== monthRecord.id)) {
      throw new BadRequestException('One or more books do not belong to this month');
    }
    if (options.some((o) => o.choiceGroupId)) {
      throw new ConflictException('One or more books already belong to a choice group');
    }

    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionMonthChoiceGroup.create({
        data: {
          monthId: monthRecord.id,
          label: dto.label ?? null,
          allowMultiple: dto.allowMultiple ?? true,
          choiceDeadlineDaysBefore: dto.choiceDeadlineDaysBefore ?? 1,
          choiceDeadlineType: dto.choiceDeadlineType ?? 'DAYS_BEFORE',
          choiceDeadlineDayOfMonth: dto.choiceDeadlineDayOfMonth ?? null,
        },
      });
      await tx.subscriptionMonthBook.updateMany({
        where: { id: { in: uniqueIds } },
        data: { choiceGroupId: created.id },
      });
      return created;
    });

    // Let every currently active subscriber know a choice is open for them.
    const activeEntries = await this.prisma.userSubscriptionEntry.findMany({
      where: { subscriptionId: subscription.id, active: true },
      select: { id: true },
    });
    for (const e of activeEntries) {
      this.scheduledReminders?.scheduleBookChoice(e.id, group.id).catch(() => {});
    }

    void this.invalidateMonthsCache(subscriptionSlug);
    return group;
  }

  async deleteChoiceGroup(subscriptionSlug: string, year: number, month: number, choiceGroupId: string) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    const group = await this.prisma.subscriptionMonthChoiceGroup.findUnique({ where: { id: choiceGroupId } });
    if (!group || group.monthId !== monthRecord.id) {
      throw new NotFoundException('Choice group not found on this month');
    }

    // Member books are kept (choiceGroupId set null via onDelete:SetNull) — they just go
    // back to being unconditionally-included books, same as any month without a choice group.
    await this.prisma.subscriptionMonthChoiceGroup.delete({ where: { id: choiceGroupId } });
    void this.invalidateMonthsCache(subscriptionSlug);
    return { success: true };
  }

  /** Choice groups for a month, with each option's book/edition info and (if userId given) the caller's own pick. */
  /**
   * Which "real" subscription(s) actually hold SubscriptionMonth rows for this subscription's
   * calendar slot — itself for a normal subscription, its parent for a content-stream variant,
   * or each component's effective (parent-resolved) subscription for a combo, since a combo
   * has no SubscriptionMonth rows of its own at all. User-facing choice-group lookups need
   * this (unlike admin month-management, which intentionally requires operating on the real
   * subscription directly — see getSubscriptionMonths's "variant" guard).
   */
  private async resolveMonthHoldingSubscriptionIds(subscription: { id: string; isCombo?: boolean; parentSubscriptionId?: string | null }): Promise<string[]> {
    if ((subscription as any).isCombo) {
      const components = await this.prisma.subscriptionComboComponent.findMany({
        where: { comboId: subscription.id },
        select: { componentId: true },
      });
      return this.resolveEffectiveComponentIds(components.map((c) => c.componentId));
    }
    return [(subscription as any).parentSubscriptionId ?? subscription.id];
  }

  async getMonthChoiceGroups(subscriptionSlug: string, year: number, month: number, userId?: string) {
    const subscription = await this.findBySlug(subscriptionSlug);
    const holdingIds = await this.resolveMonthHoldingSubscriptionIds(subscription as any);
    const monthRecords = await this.prisma.subscriptionMonth.findMany({
      where: { subscriptionId: { in: holdingIds }, year, month },
      select: { id: true },
    });
    if (monthRecords.length === 0) return [];
    const monthIds = monthRecords.map((m) => m.id);

    const groups = await this.prisma.subscriptionMonthChoiceGroup.findMany({
      where: { monthId: { in: monthIds } },
      include: {
        options: {
          select: {
            id: true,
            bookId: true,
            editionId: true,
            signatureType: true,
            book: { select: { id: true, title: true, slug: true } },
            edition: {
              select: {
                id: true,
                slug: true,
                additionalImages: true,
                bookBoxCompanyCustomName: true,
                variantLabel: true,
                bookBoxCompany: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!userId || groups.length === 0) {
      return groups.map((g) => ({ ...g, myChoice: null }));
    }

    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: subscription.id },
      orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
      select: { id: true },
    });
    if (!entry) return groups.map((g) => ({ ...g, myChoice: null }));

    const myChoices = await this.prisma.userSubscriptionMonthChoice.findMany({
      where: { subscriptionEntryId: entry.id, choiceGroupId: { in: groups.map((g) => g.id) } },
      select: { choiceGroupId: true, source: true, selections: { select: { monthBookId: true } } },
    });
    const byGroup = new Map(myChoices.map((c) => [c.choiceGroupId, c]));

    return groups.map((g) => {
      const mine = byGroup.get(g.id);
      return {
        ...g,
        myChoice: mine ? { source: mine.source, monthBookIds: mine.selections.map((s) => s.monthBookId) } : null,
      };
    });
  }

  /** The current user picks their own option(s) for an open choice group. */
  async submitMonthChoice(
    subscriptionSlug: string,
    year: number,
    month: number,
    choiceGroupId: string,
    userId: string,
    dto: SubmitMonthChoiceDto,
  ) {
    const subscription = await this.findBySlug(subscriptionSlug);
    const holdingIds = await this.resolveMonthHoldingSubscriptionIds(subscription as any);
    const monthIds = (await this.prisma.subscriptionMonth.findMany({
      where: { subscriptionId: { in: holdingIds }, year, month },
      select: { id: true },
    })).map((m) => m.id);

    const group = await this.prisma.subscriptionMonthChoiceGroup.findUnique({
      where: { id: choiceGroupId },
      include: { options: { select: { id: true } } },
    });
    if (!group || !monthIds.includes(group.monthId)) {
      throw new NotFoundException('Choice group not found on this month');
    }

    // Not filtered to active:true — this also serves the join-modal backfill flow for
    // subscriptions the user has already cancelled (an "already cancelled" join records
    // historical months against an inactive entry, choice included). subscriptionId is the
    // combo/variant subscription the user actually joined, not the month-holding one.
    const entry = await this.prisma.userSubscriptionEntry.findFirst({
      where: { userId, subscriptionId: subscription.id },
      orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
      select: { id: true },
    });
    if (!entry) throw new NotFoundException('No subscription entry found');

    const choice = await persistMonthChoice(this.prisma, group, entry.id, dto.monthBookIds, 'user');
    // Resolved — no need to keep reminding this user about this specific choice group.
    this.scheduledReminders?.cancelBookChoice(entry.id, choiceGroupId).catch(() => {});
    // Actually create the book entry/entries now — nothing else is guaranteed to revisit
    // this exact month later (see materializeChoiceGroupBooks doc comment).
    const now = new Date();
    const isPastOrCurrentMonth = year < now.getUTCFullYear() || (year === now.getUTCFullYear() && month <= now.getUTCMonth() + 1);
    await materializeChoiceGroupBooks(this.prisma, userId, entry.id, dto.monthBookIds, now, isPastOrCurrentMonth ? 'OWNED' : 'PREORDER');
    return choice;
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
    const intervalMonths: number = (sub as any).intervalMonths ?? 1;
    const startingMonth: number = (sub as any).startingMonth ?? 1;
    const isBundleSubscription = ((sub as any).isBundleSubscription ?? false) && intervalMonths > 1;

    // For bundle subscriptions ALL months in the bundle ship together as one box —
    // preview must show every covered month's books, not just the one requested.
    const bundleStart = isBundleSubscription
      ? getBundleBoxStart(year, month, startingMonth, intervalMonths)
      : { year, month };
    const bundleMonths = isBundleSubscription
      ? enumerateBundleMonths(bundleStart, intervalMonths)
      : [bundleStart];

    const monthRecords = await this.prisma.subscriptionMonth.findMany({
      where: {
        subscriptionId: subId,
        OR: bundleMonths.map((m) => ({ year: m.year, month: m.month })),
      },
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
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (monthRecords.length === 0) return null;

    const bundleEnd = bundleMonths[bundleMonths.length - 1];
    return {
      year: bundleStart.year,
      month: bundleStart.month,
      endYear: bundleEnd.year,
      endMonth: bundleEnd.month,
      isBundleSubscription,
      intervalMonths,
      theme: monthRecords[0].theme,
      isSpoiler: monthRecords.some((m) => m.isSpoiler),
      books: monthRecords.flatMap((m) => m.books.map((b) => ({
        title: b.book.title,
        authors: b.book.authors.map((a) => a.author.name).join(', '),
        coverImage: b.edition?.additionalImages?.[0] ?? null,
        isMainBook: b.isMainBook,
      }))),
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
        prepaidMonths: true,
        scheduledPrepayOptionId: true,
        scheduledPrepayOption: {
          select: { price: true, currency: true, months: true },
        },
        // Most recent billing period's frozen baseAmount — the actual price this entry is
        // currently committed to for its live prepaid window. Comparing the resolved NEXT-renewal
        // price against this (not scheduledPrepayOption.price, which is just whichever option the
        // FK happens to reference and can be stale/mismatched) is what correctly answers "is the
        // price actually about to change" — see resolveEffectivePrepayOption usage below.
        billingPeriods: {
          orderBy: { billedAt: 'desc' },
          take: 1,
          select: { baseAmount: true },
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
            prepayOptions: true,
            isDiscontinued: true,
            paymentOnStartup: true,
            renewalDay: true,
            isBundleSubscription: true,
            hasBookChoiceMonths: true,
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
      const { priceChanges: subPriceChanges, prepayOptions: subPrepayOptions, ...subRest } = entry.subscription as any;
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

      // For prepaid subscriptions, resolve the currently-effective prepay option's price fresh
      // rather than trusting the stale scheduledPrepayOption FK — this is what makes a
      // non-grandfathered price change actually show up in the "next renewal" preview, and keeps
      // a grandfathered subscriber correctly seeing their old price (see prepay-option.util.ts).
      const scheduledPrepayOption = (entry as any).scheduledPrepayOption as { price: { toString(): string }; currency: string; months: number } | null;
      if (scheduledPrepayOption) {
        const referenceDate = storedRenewalDate ?? new Date();
        const resolvedPrepay = resolveEffectivePrepayOption(
          subPrepayOptions ?? [],
          scheduledPrepayOption.months,
          scheduledPrepayOption.currency,
          referenceDate,
          entry.startDate,
        );
        // The live billing period's own frozen baseAmount is what this entry is actually
        // committed to paying right now — scheduledPrepayOption.price is just whichever option
        // the FK happens to reference, which can be stale/mismatched (e.g. after a manual billing
        // mode change with no new period created yet). Comparing against the FK's price instead
        // of the real frozen amount is exactly backwards: it can flag "changing" for a
        // grandfathered subscriber whose price is actually staying put, and miss a genuine
        // increase for someone whose FK already points at the new option.
        const currentPeriodBaseAmount = ((entry as any).billingPeriods as Array<{ baseAmount: { toString(): string } | null }> | undefined)?.[0]?.baseAmount;
        const currentPrepayPrice = currentPeriodBaseAmount != null
          ? parseFloat(currentPeriodBaseAmount.toString())
          : parseFloat(scheduledPrepayOption.price.toString());
        // Fully discontinued with nothing to replace it — fall back to the last known price
        // rather than showing nothing; this mirrors the renewal cron's own fallback.
        if (resolvedPrepay) {
          nextBase = parseFloat(resolvedPrepay.price.toString());
          if (nextBase !== currentPrepayPrice) {
            nextRenewalPriceChanged = true;
            nextRenewalNewPrice = nextBase.toFixed(2);
          }
        } else {
          nextBase = currentPrepayPrice;
        }
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
        // "Is the price changing" must compare against what the user is EFFECTIVELY paying right
        // now — not the raw fallbackBase (entry.basePrice), which stays null for anyone who's
        // never had a custom override. Comparing a resolved number against null always reads as
        // "changed", even when resolveEffectiveBasePrice would resolve to the exact same
        // (correctly grandfathered) price for both "now" and the next renewal — real bug found in
        // production: a subscriber who joined before a grandfathered price change saw a "price
        // changing to £X" warning where £X was the price they were already paying.
        const now = new Date();
        const currentResolved = resolveEffectiveBasePrice(
          subPriceChanges ?? [],
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          fallbackBase,
          entry.costCurrency,
          userFirstBilledYearMonth,
        );
        const currentEffectiveBase = currentResolved.price ?? fallbackBase;
        if (resolved.fromPriceChange && resolved.price !== null && resolved.price !== currentEffectiveBase) {
          nextBase = resolved.price;
          nextRenewalPriceChanged = true;
          nextRenewalNewPrice = resolved.price.toFixed(2);
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
      const offset: number = (subRest as any).renewalMonthOffset ?? 0;
      const effectivePrepayMonths: number | null = scheduledPrepayOption?.months
        ?? ((entry as any).prepaidMonths > 1 ? (entry as any).prepaidMonths : null);
      if (effectivePrepayMonths && entry.startDate) {
        // For a prepaid entry, storedRenewalDate is the next BILLING date — it only fires once
        // per multi-month prepay period, so mid-period it can be months away from "now". Boxes
        // still ship every month within an already-paid period, so the next BOX must be found
        // via the plain monthly cadence, ignoring the prepay batching entirely (mirrors what
        // storedRenewalDate itself would be for a non-prepaid entry with the same cadence).
        const personalSkippedMonths = ((entry as any).skipRecords as Array<{ month: { year: number; month: number } }>).map((r) => {
          const [ry, rm] = renewalMonthFromBoxMonth(r.month.year, r.month.month, offset);
          return { year: ry, month: rm };
        });
        const renewalDay = entry.renewalDay ?? sub.renewalDay ?? 1;
        const nextBoxRenewalDate = computeNextRenewalDate(
          renewalDay,
          1,
          null,
          entry.startDate,
          personalSkippedMonths,
          null,
          null,
          offset,
        );
        if (nextBoxRenewalDate) {
          let bm = nextBoxRenewalDate.getUTCMonth() + 1 + offset;
          let by = nextBoxRenewalDate.getUTCFullYear();
          while (bm > 12) { bm -= 12; by += 1; }
          while (bm < 1)  { bm += 12; by -= 1; }
          nextBoxMonth = { year: by, month: bm };
        }
      } else if (storedRenewalDate) {
        let bm = storedRenewalDate.getUTCMonth() + 1 + offset; // 1-12 based
        let by = storedRenewalDate.getUTCFullYear();
        while (bm > 12) { bm -= 12; by += 1; }
        while (bm < 1)  { bm += 12; by -= 1; }
        nextBoxMonth = { year: by, month: bm };
      }

      const { skipRecords: _sr, feeTemplates: _ft, scheduledPrepayOption: _spo, purchaseGroups: _pg, billingPeriods: _bp, ...entryWithoutExtras } = entry as typeof entry & { feeTemplates: unknown[]; scheduledPrepayOption: unknown; purchaseGroups: unknown[]; billingPeriods: unknown[] };
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
        billingPeriods: {
          orderBy: { billedAt: 'desc' },
          take: 1,
          select: { baseAmount: true },
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
            prepayOptions: true,
            company: {
              select: {
                name: true,
                slug: true,
                brandColors: true,
              },
            },
            // Admin-declared "this month doesn't ship" — company-wide, distinct from the
            // per-user skipRecords above. Written per exact subscriptionId (see model comment),
            // so no parent/variant resolution needed here.
            monthSkips: {
              where: { undoneAt: null },
              select: { year: true, month: true },
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
      const { priceChanges: subPriceChanges, prepayOptions: subPrepayOptions, ...subRest } = entry.subscription as any;
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
        const referenceDate = storedRenewalDate ?? new Date();
        const resolvedPrepay = resolveEffectivePrepayOption(
          subPrepayOptions ?? [],
          scheduledPrepayOption.months,
          scheduledPrepayOption.currency,
          referenceDate,
          entry.startDate,
        );
        nextBase = resolvedPrepay ? parseFloat(resolvedPrepay.price.toString()) : parseFloat(scheduledPrepayOption.price.toString());
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

      const { skipRecords, feeTemplates: _ft, scheduledPrepayOption: _spo, purchaseGroups: _pg, billingPeriods: _bp, ...rest } = entry as typeof entry & { feeTemplates: unknown[]; scheduledPrepayOption: unknown; purchaseGroups: unknown[]; billingPeriods: unknown[] };
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

  /**
   * Every subscription's computed renewal day for (year, month) — global, not tied to any
   * user. Powers the public /sales-calendar page. Unlike getMySubscriptionsForCalendar, there's
   * no UserSubscriptionEntry to key off, so this uses the subscription's own default renewalDay
   * and only company-wide SubscriptionMonthSkip suppresses a renewal (per-user skips have no
   * meaning in a non-user-specific view).
   */
  async getGlobalCalendarRenewals(year: number, month: number) {
    const cacheKey = this.calendarRenewalsKey(year, month);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const subs = await this.prisma.subscription.findMany({
      where: {
        isHidden: false,
        isUpcoming: false,
        isContentStream: false,
        renewalDay: { not: null },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        logoAsset: { select: { publicId: true } },
        coverImage: true,
        coverImageAsset: { select: { publicId: true } },
        intervalMonths: true,
        startingMonth: true,
        renewalDay: true,
        renewalMonthOffset: true,
        startDate: true,
        isDiscontinued: true,
        company: { select: { id: true, name: true, slug: true, brandColors: true } },
        // Admin-declared "this month doesn't ship" — company-wide, applies globally.
        monthSkips: {
          where: { undoneAt: null },
          select: { year: true, month: true },
        },
      },
    });

    const month0 = month - 1;
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const viewedMonthStart = new Date(Date.UTC(year, month0, 1));

    const results: Array<{
      subscriptionId: string;
      slug: string;
      name: string;
      logoUrl: string | null;
      coverImage: string | null;
      day: number;
      company: { id: string; name: string; slug: string; brandColors: string[] | null };
    }> = [];

    for (const sub of subs) {
      // Discontinued subscriptions have no future renewals — only show for months they were live.
      if (sub.isDiscontinued && viewedMonthStart >= currentMonthStart) continue;

      const day = computeGlobalRenewalDay(
        {
          renewalDay: sub.renewalDay,
          startDate: sub.startDate,
          startingMonth: sub.startingMonth,
          intervalMonths: sub.intervalMonths,
          renewalMonthOffset: sub.renewalMonthOffset,
        },
        year,
        month0,
        sub.monthSkips,
      );
      if (day == null) continue;

      results.push({
        subscriptionId: sub.id,
        slug: sub.slug,
        name: sub.name,
        logoUrl: sub.logoAsset?.publicId ?? sub.logoUrl,
        coverImage: sub.coverImageAsset?.publicId ?? sub.coverImage,
        day,
        company: sub.company,
      });
    }

    await this.cache.set(cacheKey, results, this.CALENDAR_RENEWALS_TTL);
    return results;
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

        // entry.subscriptionId may be a combo or a content-stream variant — neither owns
        // SubscriptionMonth rows directly (see resolveMonthHoldingSubscriptionIds).
        const subscriptionForMonths = await this.prisma.subscription.findUnique({
          where: { id: entry.subscriptionId },
          select: { id: true, isCombo: true, parentSubscriptionId: true },
        });
        const holdingIds = subscriptionForMonths
          ? await this.resolveMonthHoldingSubscriptionIds(subscriptionForMonths as any)
          : [entry.subscriptionId];

        const monthsInRange = await this.prisma.subscriptionMonth.findMany({
          where: {
            subscriptionId: { in: holdingIds },
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
            where: { monthId: { in: monthIds } },
            select: { editionId: true, bookId: true },
          });
          const editionIds = monthBooks.map((mb) => mb.editionId);
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
      // Standalone subs may have an entry startDate before the sub's own startDate (historical data
      // entry) — computeFirstEligibleBoxMonth (the naive-guess part of computeDateAnchoredFirstBoxMonth)
      // handles that case directly via subscriptionStartDate.
      const eligibilitySubStartDate = parentSubscriptionId ? null : variantDbStartDate;
      const monthsSubscriptionId = parentSubscriptionId ?? sub.id;
      const intervalMonths = (sub as any).intervalMonths ?? 1;
      const startingMonth = (sub as any).startingMonth ?? 1;
      const searchIds = isCombo ? await this.resolveEffectiveComponentIds(componentIds) : [monthsSubscriptionId];

      // Two distinct anchors for the picker:
      //  - defaultFirstBox: the renewal-cycle-aware ELIGIBILITY suggestion (computeFirstEligibleBoxMonth
      //    + content-shift) — only used to mark which of the 3 displayed candidates is "Suggested".
      //  - joinDateWindow: the box unit containing the join date's own calendar position, no
      //    renewal-day math — this is what previous/current/next are actually built around, so
      //    "current" always means "the window presently in progress", not "the eligibility-adjusted
      //    one" (e.g. signupIncludesCurrentMonth=false shouldn't make "current" skip to next month —
      //    it should just make next month the Suggested one instead).
      const defaultFirstBox = effectiveStartDateObj
        ? await computeDateAnchoredFirstBoxMonth(this.prisma, searchIds, effectiveStartDateObj, resolvedRenewalDay ?? 1, renewalMonthOffset, effectiveSignupIncludes, intervalMonths, startingMonth, eligibilitySubStartDate)
        : null;
      const joinDateWindow = effectiveStartDateObj
        ? await computeJoinDateWindow(this.prisma, searchIds, effectiveStartDateObj, intervalMonths, startingMonth)
        : null;
      const previousBoxStart = joinDateWindow
        ? await getPreviousBoxUnitStart(this.prisma, searchIds, joinDateWindow.year, joinDateWindow.month, intervalMonths, startingMonth)
        : null;
      const previousBoxMonths = previousBoxStart
        ? await this.getBoxUnitMonths(searchIds, previousBoxStart.year, previousBoxStart.month, intervalMonths)
        : [];

      // eligibleMonths is anchored at joinDateWindow (its first unit IS "current", second IS
      // "next") — NOT at defaultFirstBox. If the user ends up picking "current" (overriding the
      // eligibility suggestion), Step2 should offer that window onward for backfill; if they pick
      // whichever slot matches defaultFirstBox instead, applyFirstBoxChoice already drops the
      // earlier unit(s) — see joinSubscription.utils.ts.
      const eligibleMonths = isCombo
        ? await this.getComboEligibleMonths(componentIds, effectiveStartDateObj, cancellationDateObj, effectiveSignupIncludes, renewalMonthOffset, resolvedRenewalDay, intervalMonths, startingMonth, null, joinDateWindow)
        : await this.getEligibleMonths(monthsSubscriptionId, effectiveStartDateObj, cancellationDateObj, effectiveSignupIncludes, renewalMonthOffset, resolvedRenewalDay, intervalMonths, startingMonth, null, joinDateWindow);
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
      return {
        entry: mockEntry as any,
        eligibleMonths,
        previousBoxMonths,
        // Renewal-cycle-aware eligibility suggestion — decides which picker slot is "Suggested".
        defaultFirstBoxYear: defaultFirstBox?.year ?? null,
        defaultFirstBoxMonth: defaultFirstBox?.month ?? null,
        // The box unit containing the join date's own calendar position — decides which slot the
        // picker labels "current" (see computeJoinDateWindow).
        joinWindowYear: joinDateWindow?.year ?? null,
        joinWindowMonth: joinDateWindow?.month ?? null,
      };
    }

    // Resolve prepay option (if provided) — sets prepaidMonths and scheduledPrepayOptionId atomically at join time.
    // New entries always start "now", so grandfathering never applies here — this lookup only
    // guards against a client requesting a stale/superseded/discontinued option id directly.
    let resolvedPrepayMonths: number | null = null;
    let resolvedPrepayOptionId: string | null = null;
    if (dto.selectedPrepayOptionId) {
      const allOptions = await this.prisma.subscriptionPrepayOption.findMany({ where: { subscriptionId: sub.id } });
      const option = allOptions.find(o => o.id === dto.selectedPrepayOptionId);
      if (!option) throw new BadRequestException('Invalid prepay option');
      const current = resolveEffectivePrepayOption(allOptions, option.months, option.currency, new Date());
      if (!current || current.id !== option.id) throw new BadRequestException('Invalid prepay option');
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
        ...(dto.firstBoxYear != null && dto.firstBoxMonth != null && {
          firstBoxYear: dto.firstBoxYear,
          firstBoxMonth: dto.firstBoxMonth,
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
    // Standalone subs may have an entry startDate before the sub's own startDate (historical data
    // entry) — computeDateAnchoredFirstBoxMonth handles that naturally (see dry-run branch above).
    const eligibilitySubStartDate = parentSubscriptionId ? null : variantDbStartDate;
    const monthsSubscriptionId = parentSubscriptionId ?? sub.id;
    const intervalMonths = (sub as any).intervalMonths ?? 1;
    const startingMonth = (sub as any).startingMonth ?? 1;

    // The join modal's mandatory first-box picker step always sends firstBoxYear/firstBoxMonth —
    // use it directly (already persisted on the entry above) so eligibleMonths, the preorder
    // month, and the stored value all agree. Resolved once and reused below (rather than letting
    // each callee fall back independently) so there's exactly one source of truth per request.
    const searchIds = isCombo ? await this.resolveEffectiveComponentIds(componentIds) : [monthsSubscriptionId];
    const resolvedFirstBox = (dto.firstBoxYear != null && dto.firstBoxMonth != null)
      ? { year: dto.firstBoxYear, month: dto.firstBoxMonth }
      : (effectiveStartDateObj ? await computeDateAnchoredFirstBoxMonth(this.prisma, searchIds, effectiveStartDateObj, resolvedRenewalDay ?? 1, renewalMonthOffset, effectiveSignupIncludes, intervalMonths, startingMonth, eligibilitySubStartDate) : undefined);

    const eligibleMonths = isCombo
      ? await this.getComboEligibleMonths(componentIds, effectiveStartDateObj, cancellationDateObj, effectiveSignupIncludes, renewalMonthOffset, resolvedRenewalDay, intervalMonths, startingMonth, eligibilitySubStartDate, resolvedFirstBox)
      : await this.getEligibleMonths(monthsSubscriptionId, effectiveStartDateObj, cancellationDateObj, effectiveSignupIncludes, renewalMonthOffset, resolvedRenewalDay, intervalMonths, startingMonth, eligibilitySubStartDate, resolvedFirstBox);

    // If paymentOnStartup and NOT already cancelled: register the first upcoming month's books as preorders
    // (only for non-combo subscriptions — combos have no own SubscriptionMonth records)
    const paymentOnStartup = (sub as any).paymentOnStartup as boolean;
    if (paymentOnStartup && startDateObj && !isCombo && !dto.alreadyCancelled) {
      await this.recordFirstMonthAsPreorder(entry.id, userId, monthsSubscriptionId, effectiveStartDateObj!, entry, effectiveSignupIncludes, renewalDay, renewalMonthOffset, intervalMonths, startingMonth, eligibilitySubStartDate, resolvedFirstBox);
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
    // If this subscription already has open book-choice groups, schedule reminders for the
    // new entry too — otherwise only entries active at group-creation time would ever get
    // one (see createChoiceGroup, which only loops over then-active entries).
    if (!isCombo && (sub as any).hasBookChoiceMonths) {
      this.scheduleBookChoiceForNewEntry(entry.id, monthsSubscriptionId, renewalDay ?? 1).catch(() => {});
    }
    return { entry, eligibleMonths };
  }

  private async scheduleBookChoiceForNewEntry(entryId: string, subscriptionId: string, renewalDay: number) {
    const groups = await this.prisma.subscriptionMonthChoiceGroup.findMany({
      where: { month: { subscriptionId } },
      select: {
        id: true,
        choiceDeadlineType: true,
        choiceDeadlineDaysBefore: true,
        choiceDeadlineDayOfMonth: true,
        month: { select: { year: true, month: true } },
      },
    });
    const now = new Date();
    for (const group of groups) {
      const deadline = computeChoiceDeadline(group.month.year, group.month.month, renewalDay, group);
      if (deadline <= now) continue;
      this.scheduledReminders?.scheduleBookChoice(entryId, group.id).catch(() => {});
    }
  }

  private async getEligibleMonths(subscriptionId: string, startDateObj: Date | null, endDateObj?: Date | null, signupIncludesCurrentMonth = false, renewalMonthOffset = 0, renewalDay: number | null = null, intervalMonths = 1, startingMonth = 1, subscriptionStartDate: Date | null = null, explicitFirstBox?: { year: number; month: number } | null) {
    if (!startDateObj) return [];

    const now = new Date();
    const effectiveRenewalDay = renewalDay ?? 1;

    const { year: limitYear, month: limitMonth } = endDateObj
      ? computeLastProcessedBoxMonth(endDateObj, effectiveRenewalDay, renewalMonthOffset, intervalMonths, startingMonth)
      : computeLastProcessedBoxMonth(now, effectiveRenewalDay, renewalMonthOffset, intervalMonths, startingMonth);

    // The first box month is the user's own confirmed choice from the join modal's mandatory
    // picker step (explicitFirstBox) whenever available. It only falls back to the date-anchored
    // default calculation for entries that predate this feature.
    const { year: startYear, month: startMonth } = explicitFirstBox
      ?? await computeDateAnchoredFirstBoxMonth(this.prisma, [subscriptionId], startDateObj, effectiveRenewalDay, renewalMonthOffset, signupIncludesCurrentMonth, intervalMonths, startingMonth, subscriptionStartDate);

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
   * Fetches the real SubscriptionMonth row(s) making up exactly one "box unit" starting at
   * (startYear, startMonth) — a single calendar month, or (for bundle subscriptions) the
   * `intervalMonths` consecutive calendar months of that bundle cycle. Used by the join dry-run
   * to build the "previous" candidate for the mandatory first-box picker step.
   */
  private async getBoxUnitMonths(subscriptionIds: string[], startYear: number, startMonth: number, intervalMonths = 1) {
    const unitMonths = intervalMonths > 1
      ? enumerateBundleMonths({ year: startYear, month: startMonth }, intervalMonths)
      : [{ year: startYear, month: startMonth }];
    const end = unitMonths[unitMonths.length - 1];
    return this.prisma.subscriptionMonth.findMany({
      where: {
        subscriptionId: { in: subscriptionIds },
        AND: [
          { OR: [{ year: { gt: startYear } }, { year: startYear, month: { gte: startMonth } }] },
          { OR: [{ year: { lt: end.year } }, { year: end.year, month: { lte: end.month } }] },
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

  private async getComboEligibleMonths(componentIds: string[], startDateObj: Date | null, endDateObj?: Date | null, signupIncludesCurrentMonth = false, renewalMonthOffset = 0, renewalDay: number | null = null, intervalMonths = 1, startingMonth = 1, subscriptionStartDate: Date | null = null, explicitFirstBox?: { year: number; month: number } | null) {
    if (!startDateObj || componentIds.length === 0) return [];

    const now = new Date();
    const effectiveRenewalDay = renewalDay ?? 1;

    const { year: limitYear, month: limitMonth } = endDateObj
      ? computeLastProcessedBoxMonth(endDateObj, effectiveRenewalDay, renewalMonthOffset, intervalMonths, startingMonth)
      : computeLastProcessedBoxMonth(now, effectiveRenewalDay, renewalMonthOffset, intervalMonths, startingMonth);

    // Combo content lives on component subscriptions, so date-anchoring must search those, not
    // the combo's own (contentless) subscription id.
    const effectiveComponentIds = await this.resolveEffectiveComponentIds(componentIds);

    const { year: startYear, month: startMonth } = explicitFirstBox
      ?? await computeDateAnchoredFirstBoxMonth(this.prisma, effectiveComponentIds, startDateObj, effectiveRenewalDay, renewalMonthOffset, signupIncludesCurrentMonth, intervalMonths, startingMonth, subscriptionStartDate);

    if (startYear > limitYear || (startYear === limitYear && startMonth > limitMonth)) {
      return [];
    }

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
    entry: {
      id: string; renewalDay: number | null; basePrice: unknown; shippingCost: unknown; costCurrency: string | null; feeTemplates?: unknown[];
      prepaidMonths?: number | null; scheduledPrepayOptionId?: string | null;
    },
    signupIncludesCurrentMonth = false,
    subRenewalDay: number | null = null,
    renewalMonthOffset = 0,
    intervalMonths = 1,
    startingMonth = 1,
    subscriptionStartDate: Date | null = null,
    explicitFirstBox?: { year: number; month: number } | null,
  ) {
    const renewalDay = subRenewalDay ?? entry.renewalDay ?? 1;
    // Same first box month as everywhere else — the user's own confirmed choice from the join
    // modal's mandatory picker (explicitFirstBox), or the date-anchored default as a fallback.
    const { year: firstEligibleYear, month: firstEligibleMonth } = explicitFirstBox ?? computeFirstEligibleBoxMonth(
      startDateObj,
      renewalDay,
      renewalMonthOffset,
      signupIncludesCurrentMonth,
      intervalMonths,
      startingMonth,
      subscriptionStartDate,
    );

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
        books: { select: { id: true, editionId: true, bookId: true, signatureType: true, choiceGroupId: true } },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    if (!firstMonth || firstMonth.books.length === 0) return;

    const purchaseDate = new Date(Date.UTC(firstMonth.year, firstMonth.month - 1, renewalDay));
    // Choice-grouped books are excluded outright here, not deadline-checked — this runs
    // synchronously inside the join call itself, before the entry even exists from the
    // frontend's point of view, so no choice could possibly have been submitted yet. A
    // deadline check doesn't help either: this "first eligible month" is also always
    // included in the same join-modal's backfill month list, whose deadline (anchored to
    // that same month) has typically already elapsed by the time of a real-time signup —
    // so the resolver would just default to "both" here regardless. Defer entirely to the
    // backfill/self-service choice flow, which runs afterward in the same session and
    // properly sequences the choice submission before creating entries.
    const monthBooks = firstMonth.books.filter(mb => mb.editionId && mb.bookId && !mb.choiceGroupId);

    // Fetch fee templates for this entry (they were just saved before calling this function)
    const feeTemplateLinks = await this.prisma.userSubscriptionEntryFeeTemplate.findMany({
      where: { subscriptionEntryId: entryId },
      include: { feeTemplate: true },
    });

    const feesToCreate: {
      userId: string; feeTemplateId?: string | null; name: string; amount: number;
      currency: string; date: Date; category: any; purchaseGroupId: string;
    }[] = [];

    // Prepaid entries pay for N months upfront in one lump sum — entry.basePrice/shippingCost
    // is the FULL N-month total, not this month's cost. Divide it and anchor a
    // UserSubBillingPeriod (monthsCovered=N) at this first box so the renewal cron can later
    // find and extend the SAME period for months 2..N instead of re-deriving N from whatever
    // subset of months it happens to know about — see prepay-billing-period.util.ts.
    const fullBase = entry.basePrice ? parseFloat((entry.basePrice as any).toString()) : 0;
    const fullShipping = entry.shippingCost ? parseFloat((entry.shippingCost as any).toString()) : null;
    const monthsCovered = entry.prepaidMonths ?? 1;
    const isPrepaid = monthsCovered > 1 && !!entry.scheduledPrepayOptionId;

    let billingPeriodId: string | null = null;
    let totalAmount = fullBase;
    let shippingAmount = fullShipping;
    if (isPrepaid) {
      const { periodId } = await ensurePrepayBillingPeriod(this.prisma, entryId, firstMonth.year, firstMonth.month, purchaseDate, {
        id: entry.scheduledPrepayOptionId!,
        months: monthsCovered,
        price: fullBase,
        currency: entry.costCurrency ?? 'USD',
      });
      billingPeriodId = periodId;
      totalAmount = Math.round((fullBase / monthsCovered) * 100) / 100;
      shippingAmount = fullShipping != null ? Math.round((fullShipping / monthsCovered) * 100) / 100 : null;
    }

    // Create ONE purchase group for this billing period
    const group = await this.prisma.userPurchaseGroup.create({
      data: {
        userId,
        fromSubscription: true,
        subscriptionEntryId: entryId,
        totalAmount,
        shippingAmount,
        currency: entry.costCurrency ?? 'USD',
        purchasedAt: purchaseDate,
        title: `Subscription – ${firstMonth.year}/${String(firstMonth.month).padStart(2, '0')}`,
        ...(billingPeriodId && { billingPeriodId }),
      },
    });

    // Per-book price allocation — mirrors backfillSubscription's own unit loop (resolvePerBookPrices
    // with allowGrowth) so a book's basePrice never silently falls back to the subscription's
    // current monthly price when displayed later.
    const editionIds = monthBooks.map(mb => mb.editionId!).filter(Boolean);
    const { prices: perBookPrices } = resolvePerBookPrices(editionIds, new Map(), totalAmount, { allowGrowth: true });

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
          basePrice: perBookPrices.get(mb.editionId!),
        });

      } catch {
        // skip if already exists
      }
    }

    // Fee templates once per purchase group — for a prepaid entry, the linked amount is the
    // FULL period total the user paid in one go (same lump sum as basePrice/shippingCost), so it
    // divides the same way; a non-prepaid entry keeps the full per-month amount.
    for (const link of feeTemplateLinks) {
      const template = link.feeTemplate;
      const amount = link.customAmount ?? template.defaultAmount;
      if (!amount) continue;
      const fullAmount = parseFloat(amount.toString());
      feesToCreate.push({
        userId,
        feeTemplateId: template.id,
        name: template.name,
        amount: isPrepaid ? Math.round((fullAmount / monthsCovered) * 100) / 100 : fullAmount,
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
    basePrice?: number | null;
  }): Promise<void> {
    const existing = await this.prisma.userBookEntry.findFirst({
      where: { userId: opts.userId, editionId: opts.editionId, subscriptionEntryId: opts.subscriptionEntryId },
      select: { id: true, ownershipStatus: true },
    });
    if (existing) {
      // PREORDER is a provisional placeholder (e.g. auto-created by recordFirstMonthAsPreorder
      // at join time, before the admin has picked a real status via backfill/unskip) — safe to
      // correct once a real status is chosen. Anything else already set (OWNED, SOLD, BORROWED,
      // ...) reflects a deliberate later action and must not be silently overwritten here.
      const shouldUpdateStatus = !!opts.ownershipStatus && existing.ownershipStatus === 'PREORDER' && opts.ownershipStatus !== existing.ownershipStatus;
      await this.prisma.userBookEntry.update({
        where: { id: existing.id },
        data: {
          purchaseGroupId: opts.purchaseGroupId,
          ...(opts.basePrice != null && { basePrice: opts.basePrice }),
          ...(shouldUpdateStatus && { ownershipStatus: opts.ownershipStatus }),
        },
      });
      if (shouldUpdateStatus) {
        await this.prisma.ownershipStatusHistory.create({
          data: { userBookEntryId: existing.id, status: opts.ownershipStatus!, changedAt: opts.changedAt },
        }).catch(() => {});
      }
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
        ...(opts.basePrice != null && { basePrice: opts.basePrice }),
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
      // Resolve effective IDs once — for content stream variants, months live on the parent.
      const effectiveComponentIds = await this.resolveEffectiveComponentIds(componentIds);
      const comboFirstBox = await resolveFirstBoxMonth(
        this.prisma,
        { firstBoxYear: (entry as any).firstBoxYear ?? null, firstBoxMonth: (entry as any).firstBoxMonth ?? null, startDate: entry.startDate },
        effectiveComponentIds,
        fallbackSettings.renewalDay ?? 1,
        fallbackSettings.renewalMonthOffset,
        fallbackSettings.signupIncludesCurrentMonth,
        (sub as any).intervalMonths ?? 1,
        (sub as any).startingMonth ?? 1,
        null,
      );
      const eligibleComboMonths = await this.getComboEligibleMonths(componentIds, startDateObj, cancellationDateObj, fallbackSettings.signupIncludesCurrentMonth, fallbackSettings.renewalMonthOffset, fallbackSettings.renewalDay, (sub as any).intervalMonths ?? 1, (sub as any).startingMonth ?? 1, null, comboFirstBox);
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
          select: { books: { select: { id: true, bookId: true, editionId: true, signatureType: true, choiceGroupId: true } } },
        });
        // Deduplicate books by editionId
        const bookMap = new Map<string, { id: string; bookId: string; editionId: string; signatureType: $Enums.SignatureType | null; choiceGroupId: string | null }>();
        for (const m of componentMonths) {
          for (const b of m.books) {
            if (b.editionId && b.bookId && !bookMap.has(b.editionId)) {
              bookMap.set(b.editionId, { id: b.id, bookId: b.bookId, editionId: b.editionId, signatureType: b.signatureType, choiceGroupId: b.choiceGroupId });
            }
          }
        }
        const monthBooks = await resolveMonthBooksForEntry(this.prisma, entry.id, Array.from(bookMap.values()));
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

        // Same per-book override/remainder allocation as the non-combo path — combo months
        // can carry choiceGroupId too (via their component subscriptions' months), so the
        // multi-book equal-split gap applies here as well. dto.bookPrices.monthId matches the
        // synthetic comboId here, mirroring how dto.selectedMonthIds is combo-aware above.
        // Resolved BEFORE creating the group so a validation error never leaves an orphaned,
        // book-less purchase group behind.
        const comboPriceOverrides = new Map<string, number>();
        for (const bp of dto.bookPrices ?? []) {
          if (bp.monthId === comboId && monthBooks.some(mb => mb.editionId === bp.editionId)) {
            comboPriceOverrides.set(bp.editionId, bp.price);
          }
        }
        const comboEditionIds = monthBooks.map(mb => mb.editionId).filter(Boolean);
        // allowGrowth: a paid additional book choice costs extra on top of the box price —
        // the resolved total can exceed basePrice instead of being capped at it.
        const { prices: comboPerBookPrices, distribution: comboDistribution, totalAmount: comboResolvedTotal } =
          resolvePerBookPrices(comboEditionIds, comboPriceOverrides, basePrice, { allowGrowth: true });

        const group = await this.prisma.userPurchaseGroup.create({
          data: {
            userId,
            fromSubscription: true,
            subscriptionEntryId: entry.id,
            totalAmount: comboResolvedTotal,
            shippingAmount: entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null,
            currency: entry.costCurrency ?? 'USD',
            purchasedAt: renewalDate,
            title: `Subscription – ${year}/${String(month).padStart(2, '0')}`,
            priceDistribution: comboDistribution,
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
              basePrice: comboPerBookPrices.get(mb.editionId),
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

        const windowKey = this.computeWindowKeyForBackfill(
          comboPolicy, firstSkipDateInWindow, entry.startDate, m.year, m.month,
          (entry as any).firstBoxYear ?? null, (entry as any).firstBoxMonth ?? null,
        );
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
          select: { id: true, editionId: true, bookId: true, signatureType: true, choiceGroupId: true },
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

    // ── Group selected months into purchase units ──────────────────────────────
    // Bundle subscriptions ship intervalMonths calendar months as ONE package — one
    // payment, one shipment — so backfilling them must create exactly ONE
    // UserPurchaseGroup per bundle period (covering every selected month's books in
    // it), not one per calendar month. Months already tied to an explicit prepay
    // billing batch are kept as individual units (batches aren't used for bundles).
    const isBundleSub = ((sub as any).isBundleSubscription ?? false) && ((sub as any).intervalMonths ?? 1) > 1;
    const backfillIntervalMonths: number = (sub as any).intervalMonths ?? 1;
    const backfillStartingMonth: number = (sub as any).startingMonth ?? 1;

    type PurchaseUnit = { primaryMonthId: string; monthIds: string[] };
    let units: PurchaseUnit[];
    if (isBundleSub) {
      const bundleGroups = new Map<string, string[]>();
      const soloUnits: PurchaseUnit[] = [];
      for (const monthId of dto.selectedMonthIds) {
        const rec = monthMap.get(monthId);
        if (!rec) continue;
        if (batchByMonthId.has(monthId)) {
          soloUnits.push({ primaryMonthId: monthId, monthIds: [monthId] });
          continue;
        }
        const start = getBundleBoxStart(rec.year, rec.month, backfillStartingMonth, backfillIntervalMonths);
        const key = `${start.year}-${start.month}`;
        if (!bundleGroups.has(key)) bundleGroups.set(key, []);
        bundleGroups.get(key)!.push(monthId);
      }
      const groupedUnits: PurchaseUnit[] = Array.from(bundleGroups.values()).map((monthIds) => {
        const sorted = [...monthIds].sort((a, b) => {
          const ra = monthMap.get(a)!, rb = monthMap.get(b)!;
          return ra.year !== rb.year ? ra.year - rb.year : ra.month - rb.month;
        });
        return { primaryMonthId: sorted[0], monthIds: sorted };
      });
      units = [...groupedUnits, ...soloUnits];
    } else {
      units = dto.selectedMonthIds.map((monthId) => ({ primaryMonthId: monthId, monthIds: [monthId] }));
    }

    for (const unit of units) {
      const monthId = unit.primaryMonthId;
      const monthRecord = monthMap.get(monthId);
      if (!monthRecord) continue;

      const monthSettings = resolveEffectiveSettings(settingsHistory, monthRecord.year, monthRecord.month, fallbackSettings);
      const nonComboOffset: number = monthSettings.renewalMonthOffset;
      // Mirror backfillRenewalHistory logic: use entry's own day only in user-set mode,
      // otherwise use the subscription's historical fixed renewal day.
      const monthRenewalDay = monthSettings.renewalDayUserSet ? (entry.renewalDay ?? 1) : (monthSettings.renewalDay ?? 1);
      const renewalDate = (earliestMonthId !== null && unit.monthIds.includes(earliestMonthId) && entry.startDate)
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

      // Aggregate books from every month in this unit, deduped by editionId.
      const unitBookMap = new Map<string, { id: string; editionId: string; bookId: string; signatureType: $Enums.SignatureType | null; choiceGroupId: string | null }>();
      for (const mid of unit.monthIds) {
        const rec = monthMap.get(mid);
        if (!rec) continue;
        for (const mb of rec.books) {
          if (mb.editionId && mb.bookId && !unitBookMap.has(mb.editionId)) {
            unitBookMap.set(mb.editionId, { id: mb.id, editionId: mb.editionId, bookId: mb.bookId, signatureType: mb.signatureType, choiceGroupId: mb.choiceGroupId });
          }
        }
      }
      const monthBooks = await resolveMonthBooksForEntry(this.prisma, entry.id, Array.from(unitBookMap.values()));

      const batchInfo = batchByMonthId.get(monthId);
      const batch = batchInfo?.batch;
      const batchIdx = batchInfo?.batchIndex;

      // Determine amounts — the resolved price represents ONE purchase (one bundle
      // shipment, or one calendar month for regular subs), never split further.
      const resolvedBase = resolveEffectiveBasePrice(subPriceChanges, monthRecord.year, monthRecord.month, fallbackBase, entryCostCurrency, backfillFirstBilledYearMonth);
      const baseAmount = batch
        ? batch.baseAmount / batch.monthsCovered
        : (resolvedBase.price ?? fallbackBase);
      // For batch path: split shipping over batch.monthsCovered (one shipment per billing period).
      // For no-batch (monthly or bundle): one purchase, one shipment — full shipping cost.
      const shippingAmt = batch
        ? (batch.shippingAmount != null ? batch.shippingAmount / batch.monthsCovered : null)
        : (entry.shippingCost ? parseFloat(entry.shippingCost.toString()) : null);
      const purchasedAtDate = batch ? new Date(batch.billedAt) : renewalDate;

      const groupTitle = unit.monthIds.length > 1
        ? `Subscription Bundle – ${monthRecord.year}/${String(monthRecord.month).padStart(2, '0')}`
        : `Subscription – ${monthRecord.year}/${String(monthRecord.month).padStart(2, '0')}`;

      // Overrides only apply to editions actually resolved into this unit (monthBooks already
      // reflects choice-group picks) — an override for an unselected choice-group alternative
      // is silently ignored rather than creating an orphaned allocation. Resolved BEFORE
      // creating the group so a validation error never leaves an orphaned, book-less group.
      const priceOverridesForUnit = new Map<string, number>();
      for (const bp of dto.bookPrices ?? []) {
        if (unit.monthIds.includes(bp.monthId) && monthBooks.some(mb => mb.editionId === bp.editionId)) {
          priceOverridesForUnit.set(bp.editionId, bp.price);
        }
      }
      const unitEditionIds = monthBooks.map(mb => mb.editionId!).filter(Boolean);
      // allowGrowth: a paid additional book choice costs extra on top of the box price — the
      // resolved total can exceed baseAmount instead of being capped at it.
      const { prices: perBookPrices, distribution, totalAmount: resolvedUnitTotal } =
        resolvePerBookPrices(unitEditionIds, priceOverridesForUnit, baseAmount, { allowGrowth: true });

      // Create ONE purchase group per unit (per bundle period, or per month for regular subs)
      const group = await this.prisma.userPurchaseGroup.create({
        data: {
          userId,
          fromSubscription: true,
          subscriptionEntryId: entry.id,
          totalAmount: resolvedUnitTotal,
          shippingAmount: shippingAmt,
          currency: (batch ? batch.currency : null) ?? entry.costCurrency ?? 'USD',
          purchasedAt: purchasedAtDate,
          title: groupTitle,
          priceDistribution: distribution,
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

          // This batch's months may already be covered by a period created elsewhere for the
          // same window (most commonly: the join-time first-box preorder, since the join
          // modal's own follow-up backfill step routinely re-submits that same first month as
          // part of a batch). Reuse it instead of creating a duplicate period covering the same
          // window twice — see prepay-billing-period.util.ts.
          const reusableId = await findReusableBillingPeriod(this.prisma, entry.id, firstMonthRec.year, firstMonthRec.month, n);

          if (reusableId) {
            periodId = reusableId;
          } else {
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
          }
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
            basePrice: perBookPrices.get(mb.editionId!),
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
    } // end for unit loop

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
      const backfillFirstBox = await resolveFirstBoxMonth(
        this.prisma,
        { firstBoxYear: (entry as any).firstBoxYear ?? null, firstBoxMonth: (entry as any).firstBoxMonth ?? null, startDate: entry.startDate },
        [monthsSubscriptionId],
        fallbackSettings.renewalDay ?? 1,
        fallbackSettings.renewalMonthOffset,
        fallbackSettings.signupIncludesCurrentMonth,
        (sub as any).intervalMonths ?? 1,
        (sub as any).startingMonth ?? 1,
        null,
      );
      const eligibleMonths = await this.getEligibleMonths(
        monthsSubscriptionId,
        startDateObj,
        cancellationDateObj,
        fallbackSettings.signupIncludesCurrentMonth,
        fallbackSettings.renewalMonthOffset,
        fallbackSettings.renewalDay,
        (sub as any).intervalMonths ?? 1,
        (sub as any).startingMonth ?? 1,
        null,
        backfillFirstBox,
      );
      const skippableMonths = eligibleMonths
        .filter(m => m.books.length > 0 && !selectedSet.has(m.id))
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

      let firstSkipDateInWindow: Date | null = null;
      let prevWindowKey: string | null = null;

      for (const m of skippableMonths) {
        const windowKey = this.computeWindowKeyForBackfill(
          policy, firstSkipDateInWindow, entry.startDate, m.year, m.month,
          (entry as any).firstBoxYear ?? null, (entry as any).firstBoxMonth ?? null,
        );
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
      const allOptions = await this.prisma.subscriptionPrepayOption.findMany({ where: { subscriptionId: sub.id } });
      const option = allOptions.find(o => o.id === dto.scheduledPrepayOptionId);
      if (!option) throw new BadRequestException('Invalid prepay option');
      // Grandfathering-aware: this is an existing active entry re-selecting, so its own
      // startDate decides whether it's still entitled to an older, closed option's price.
      const current = resolveEffectivePrepayOption(allOptions, option.months, option.currency, new Date(), entry.startDate);
      if (!current || current.id !== option.id) throw new BadRequestException('Invalid prepay option');
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
    entryFirstBoxYear: number | null = null,
    entryFirstBoxMonth: number | null = null,
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

      case 'FROM_FIRST_BOX': {
        // Mirrors FROM_SUB_START above — this backfill only walks the initial signup window,
        // so no rolling-window math is needed here (see rollingWindowKey for the live/recompute version).
        if (entryFirstBoxYear != null && entryFirstBoxMonth != null) {
          return `${entryFirstBoxYear}-${String(entryFirstBoxMonth).padStart(2, '0')}-01`;
        }
        return `${year}-${String(month).padStart(2, '0')}-01`;
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

  /** Raw, unfiltered list for the admin CRUD panel — every row, including closed/historical
   *  ones, so admins can see and edit everything. Never apply getSelectablePrepayOptions here:
   *  that collapses multiple rows per (months, currency) down to one resolved winner, which
   *  would hide the very rows an admin needs to manage (e.g. right after auto-close creates a
   *  second row for the same group). */
  async getPrepayOptionsAdmin(slug: string) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    return this.prisma.subscriptionPrepayOption.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { months: 'asc' },
    });
  }

  async getPrepayOptions(slug: string, userId?: string | null) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    const options = await this.prisma.subscriptionPrepayOption.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { months: 'asc' },
    });

    // Anonymous / no-entry callers (new-joiner browsing) get the plain "current" list, same as
    // before this method took a userId. Only an ACTIVE entry's startDate is used for
    // grandfathering eligibility — a cancelled historical entry must never be picked up here,
    // since cancel+rejoin is precisely how a subscriber is meant to lose grandfathering.
    let activeEntryStartDate: string | null = null;
    if (userId) {
      const activeEntry = await this.prisma.userSubscriptionEntry.findFirst({
        where: { userId, subscriptionId: sub.id, active: true },
        select: { startDate: true },
      });
      activeEntryStartDate = activeEntry?.startDate ?? null;
    }

    return getSelectablePrepayOptions(options, new Date(), activeEntryStartDate);
  }

  async createPrepayOption(slug: string, dto: CreatePrepayOptionDto) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription');
    const newValidFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();

    return this.prisma.$transaction(async (tx) => {
      // Auto-close: a new option for the same (subscriptionId, months, currency) supersedes
      // whichever sibling is still open as of this option's start — closing it (validUntil)
      // rather than leaving it open forever is what makes grandfathering meaningful (see
      // prepay-option.util.ts). Only siblings that have themselves already started are closed,
      // so a backdated insert never clobbers something scheduled further in the future.
      await tx.subscriptionPrepayOption.updateMany({
        where: {
          subscriptionId: sub.id,
          months: dto.months,
          currency: dto.currency,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: newValidFrom } }] }, // already started
            { OR: [{ validUntil: null }, { validUntil: { gt: newValidFrom } }] }, // still open
          ],
        },
        data: { validUntil: newValidFrom },
      });

      return tx.subscriptionPrepayOption.create({
        data: {
          subscriptionId: sub.id,
          months: dto.months,
          price: dto.price,
          currency: dto.currency,
          label: dto.label ?? null,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          grandfatheredPrice: dto.grandfatheredPrice ?? false,
        },
      });
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
        ...(dto.grandfatheredPrice !== undefined && { grandfatheredPrice: dto.grandfatheredPrice }),
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
        firstBoxYear: true,
        firstBoxMonth: true,
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
    const intervalMonths: number = (sub as any).intervalMonths ?? 1;
    const startingMonth: number = (sub as any).startingMonth ?? 1;
    const now = new Date();

    // First eligible box month — same value as the join modal's picker step (the user's saved
    // choice, or the date-anchored default for entries that predate this feature).
    const resolvedFirstBox = await resolveFirstBoxMonth(this.prisma, entry, monthsSubscriptionIds, renewalDay, renewalMonthOffset, signupIncludesCurrentMonth, intervalMonths, startingMonth);
    if (!resolvedFirstBox) throw new NotFoundException('Subscription entry has no start date');
    const { year: startYear, month: startMonth } = resolvedFirstBox;

    // Last processed box month — upper limit
    const { year: limitYear, month: limitMonth } = computeLastProcessedBoxMonth(
      now, renewalDay, renewalMonthOffset, intervalMonths, startingMonth,
    );

    // Build set of skipped months for O(1) lookup
    const skippedSet = new Set<string>(
      (entry.skipRecords as any[]).map(r => `${r.month.year}-${r.month.month}`),
    );

    // The upper bound is normally "last processed" (future boxes aren't manageable yet).
    // But a month the user has already skipped must always stay manageable, even if it's
    // in the future and even if the subscription's skip policy doesn't allow unskip via the
    // regular flow — otherwise an accidental future skip becomes permanently uncorrectable.
    // Extend the range to cover the furthest-out skipped month, for every subscription type.
    let effectiveLimitYear = limitYear;
    let effectiveLimitMonth = limitMonth;
    for (const r of entry.skipRecords as any[]) {
      const { year, month } = r.month;
      if (year > effectiveLimitYear || (year === effectiveLimitYear && month > effectiveLimitMonth)) {
        effectiveLimitYear = year;
        effectiveLimitMonth = month;
      }
    }

    // Fetch subscription months in the [start, effectiveLimit] range
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
              { year: { lt: effectiveLimitYear } },
              { year: effectiveLimitYear, month: { lte: effectiveLimitMonth } },
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

    const isBundleSubscription = ((sub as any).isBundleSubscription as boolean ?? false) && intervalMonths > 1;

    // A company-wide skip (SubscriptionMonthSkip) is never a personal choice to make/unmake here —
    // exclude it even if a SubscriptionMonth row happens to already exist for it (content authored
    // before the admin later decided to skip the month). Defense-in-depth: today this can't
    // actually happen since no row gets created for a company-skipped month in the first place,
    // but that's an emergent property, not a guarantee this method should rely on silently.
    const companySkips = await this.prisma.subscriptionMonthSkip.findMany({
      where: { subscriptionId: { in: monthsSubscriptionIds }, undoneAt: null },
      select: { year: true, month: true },
    });
    const companySkippedSet = new Set(companySkips.map((s) => `${s.year}-${s.month}`));

    const result = Array.from(grouped.values())
      .filter(({ year, month }) => !companySkippedSet.has(`${year}-${month}`))
      .map(({ year, month, booksMap }) => {
      // For bundle subscriptions ALL months in a bundle ship together at the bundle's own
      // renewal date, not each month's individual calendar date — resolve to the bundle's
      // start month first so every constituent month reports the same, correct renewal date.
      const { year: baseYear, month: baseMonth } = isBundleSubscription
        ? getBundleBoxStart(year, month, startingMonth, intervalMonths)
        : { year, month };
      let ry = baseYear, rm = baseMonth - renewalMonthOffset;
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

    return { entryId: entry.id, months: result, isBundleSubscription, intervalMonths, startingMonth };
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
    const manageSkipsIntervalMonths: number = (sub as any).intervalMonths ?? 1;
    const manageSkipsStartingMonth: number = (sub as any).startingMonth ?? 1;
    const manageSkipsIsBundle = ((sub as any).isBundleSubscription ?? false) && manageSkipsIntervalMonths > 1;

    /**
     * The renewal date that actually delivers a box month's content to the collection.
     * For bundle subscriptions ALL months in a bundle ship together at the bundle's own
     * renewal date, not each month's individual calendar date — so this resolves to the
     * bundle's start month before applying the renewal-day/offset math.
     */
    const renewalDateForBoxMonth = (year: number, month: number): Date => {
      const { year: baseYear, month: baseMonth } = manageSkipsIsBundle
        ? getBundleBoxStart(year, month, manageSkipsStartingMonth, manageSkipsIntervalMonths)
        : { year, month };
      let ry = baseYear, rm = baseMonth - renewalMonthOffset;
      while (rm <= 0) { rm += 12; ry--; }
      while (rm > 12) { rm -= 12; ry++; }
      return new Date(Date.UTC(ry, rm - 1, renewalDay));
    };

    // A company-wide skip isn't a personal choice — a stale/racing client request must not be
    // able to create an orphaned personal UserSkipRecord for a month that no longer conceptually
    // exists (e.g. an admin marked it skipped while this request was in flight).
    const manageSkipsCompanySkips = await this.prisma.subscriptionMonthSkip.findMany({
      where: { subscriptionId: { in: monthsSubscriptionIds }, undoneAt: null },
      select: { year: true, month: true },
    });
    const manageSkipsCompanySkippedSet = new Set(manageSkipsCompanySkips.map((s) => `${s.year}-${s.month}`));

    // ── Apply new skips ───────────────────────────────────────────────────────
    for (const { year, month } of dto.toSkip) {
      if (manageSkipsCompanySkippedSet.has(`${year}-${month}`)) continue;
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
        // Future (not-yet-renewed) months are handled by the renewal cron when their
        // renewal actually fires — adding books for them here would duplicate that,
        // add them too early, and bypass the cron's own purchase-group logic.
        if (renewalDateForBoxMonth(year, month) > now) continue;

        const subMonth = await this.prisma.subscriptionMonth.findFirst({
          where: { subscriptionId: { in: monthsSubscriptionIds }, year, month },
          select: {
            year: true,
            month: true,
            signatureType: true,
            books: { select: { id: true, editionId: true, bookId: true, signatureType: true, choiceGroupId: true } },
          },
        });
        if (!subMonth || subMonth.books.length === 0) continue;

        const ownershipStatus: 'OWNED' | 'PREORDER' =
          dto.ownershipStatusForUnskipped ?? 'OWNED';

        const feeTemplates = entry.feeTemplates as any[];
        const basePrice = entry.basePrice ? parseFloat((entry.basePrice as any).toString()) : 0;
        const shippingCost = entry.shippingCost ? parseFloat((entry.shippingCost as any).toString()) : null;
        const currency = entry.costCurrency ?? 'GBP';

        const renewalDate = renewalDateForBoxMonth(year, month);

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

        const unskippedMonthBooks = await resolveMonthBooksForEntry(this.prisma, 
          entry.id,
          subMonth.books.filter(mb => mb.editionId && mb.bookId),
        );
        for (const mb of unskippedMonthBooks) {
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
        // Future months haven't renewed yet, so nothing has been added to the
        // collection for them — the skip record alone is enough to stop the
        // renewal cron from adding them later. Nothing to remove here.
        if (renewalDateForBoxMonth(year, month) > now) continue;

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
