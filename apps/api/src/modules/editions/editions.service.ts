import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import {
  CreateEditionDto,
  UpdateEditionDto,
  AddArtistDto,
  EditionQueryDto,
  EditionSaleDateInputDto,
} from './editions.dto';
import { generateSlugFromParts } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { deleteCloudinaryImages } from '../../common/cloudinary.helper';
import { FeatureTaggerService } from '../feature-categories/feature-tagger.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';

const companyEditionsAllCountKey = (slug: string) => `companies:slug:${slug}:editions:count`;
const companyEditionsSubCountKey = (slug: string, subId: string) => `companies:slug:${slug}:editions:sub:${subId}:count`;
const companyEditionsColCountKey = (slug: string, colId: string) => `companies:slug:${slug}:editions:col:${colId}:count`;
const companyEditionsNoColCountKey = (slug: string) => `companies:slug:${slug}:editions:nocol:count`;
const TRENDING_TTL = 60 * 60 * 1000;

type TrendingEditionResult = {
  id: string;
  slug: string;
  additionalImages: string[];
  book: {
    title: string;
    seriesName: string | null;
    volumeNumbers: number[];
    authors: Array<{ id: string; name: string; slug: string }>;
  } | null;
  bookBoxCompany: { name: string; slug: string; brandColors: string[] } | null;
  wishlistCount: number;
};

@Injectable()
export class EditionsService {
  private readonly logger = new Logger(EditionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly uploadService: UploadService,
    private readonly mediaAssetsService: MediaAssetsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly tagger: FeatureTaggerService,
  ) {}

  private async syncEditionMediaAssets(editionId: string, additionalImages: string[]) {
    await (this.prisma as any).bookEditionMediaAsset.deleteMany({ where: { editionId } });
    if (!additionalImages.length) return;

    const rows = await Promise.all(additionalImages.map(async (publicId, sortOrder) => {
      const asset = await this.mediaAssetsService.ensureForPublicId(publicId);
      return asset ? { editionId, assetId: asset.id, sortOrder } : null;
    }));

    const data = rows.filter(Boolean);
    if (data.length > 0) {
      await (this.prisma as any).bookEditionMediaAsset.createMany({
        data,
        skipDuplicates: true,
      });
    }
  }

  /** Re-runs feature tag detection for an edition (features[] + artist roles). */
  private async retagEditionById(editionId: string) {
    const data = await this.prisma.bookEdition.findUnique({
      where: { id: editionId },
      select: { features: true },
    });
    if (!data) return;
    const features = (data.features as string[]) ?? [];
    await this.tagger.retagEdition(editionId, features).catch((err) => {
      this.logger.error(`retagEdition failed for ${editionId}: ${err.message}`);
    });
  }

  /** Public method for manual retag via the API endpoint. */
  async retagBySlug(slug: string): Promise<{ tagsCount: number }> {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    const existingTags = await this.prisma.editionFeatureTag.findMany({
      where: { editionId: edition.id },
      select: { rawValue: true },
      orderBy: { sortOrder: 'asc' },
    });
    const features = existingTags.map((t) => t.rawValue);
    await this.tagger.retagEdition(edition.id, features);
    const tagsCount = await this.prisma.editionFeatureTag.count({ where: { editionId: edition.id } });
    return { tagsCount };
  }

  /** Retag all editions. Meant to be called once after a schema/category migration on production. */
  async retagAll(): Promise<{ total: number; done: number; failed: number }> {
    const editions = await this.prisma.bookEdition.findMany({
      select: {
        id: true,
        featureTags: {
          select: { rawValue: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    let done = 0;
    let failed = 0;
    for (const edition of editions) {
      try {
        const features = edition.featureTags.map((t) => t.rawValue);
        await this.tagger.retagEdition(edition.id, features);
        done++;
      } catch (err) {
        this.logger.error(`retagAll: failed for edition ${edition.id}: ${(err as Error).message}`);
        failed++;
      }
    }
    this.logger.log(`retagAll complete: ${done}/${editions.length} succeeded, ${failed} failed`);
    return { total: editions.length, done, failed };
  }

  /** Fetch all feature tags for an edition. */
  async getFeatureTags(slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug },
      select: {
        id: true,
        featureTags: {
          select: {
            id: true,
            rawValue: true,
            isManual: true,
            categories: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    return this.enrichTagsWithCategories(edition.featureTags as any);
  }
  async addFeatureTag(
    slug: string,
    body: { rawValue: string; categorySlug?: string; categories?: string[] },
  ) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);

    // Merge single categorySlug + categories[] into one deduplicated list
    const requestedCategories = Array.from(new Set([
      ...(body.categories ?? []),
      ...(body.categorySlug ? [body.categorySlug] : []),
    ]));

    const newCategories: string[] = [];
    for (const catSlug of requestedCategories) {
      const category = await this.prisma.featureCategory.findUnique({ where: { slug: catSlug } });
      if (category) newCategories.push(catSlug);
    }

    const existing = await this.prisma.editionFeatureTag.findFirst({
      where: {
        editionId: edition.id,
        rawValue: { equals: body.rawValue, mode: 'insensitive' },
      },
    });

    if (existing) {
      const cats = Array.from(new Set([...(existing.categories as string[]), ...newCategories]));
      await this.prisma.editionFeatureTag.update({
        where: { id: existing.id },
        data: { categories: cats, isManual: true },
      });
    } else {
      const maxResult = await this.prisma.editionFeatureTag.aggregate({
        where: { editionId: edition.id },
        _max: { sortOrder: true },
      });
      const nextOrder = (maxResult._max.sortOrder ?? -1) + 1;
      await this.prisma.editionFeatureTag.create({
        data: {
          editionId: edition.id,
          rawValue: body.rawValue,
          categories: newCategories,
          isManual: true,
          sortOrder: nextOrder,
        },
      });
    }

    const tag = await this.prisma.editionFeatureTag.findUnique({
      where: { editionId_rawValue: { editionId: edition.id, rawValue: body.rawValue } },
      select: {
        id: true,
        rawValue: true,
        isManual: true,
        categories: true,
      },
    });

    return this.enrichTagWithCategories(tag);
  }

  /** Remove a specific feature tag by ID. */
  async removeFeatureTag(slug: string, tagId: string) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    const tag = await this.prisma.editionFeatureTag.findFirst({
      where: { id: tagId, editionId: edition.id },
    });
    if (!tag) throw new NotFoundException(`Tag '${tagId}' not found for this edition`);
    return this.prisma.editionFeatureTag.delete({ where: { id: tagId } });
  }

  /** Update rawValue and/or categories of a feature tag. */
  async updateFeatureTag(slug: string, tagId: string, dto: { rawValue?: string; categories?: string[] }) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    const tag = await this.prisma.editionFeatureTag.findFirst({ where: { id: tagId, editionId: edition.id } });
    if (!tag) throw new NotFoundException(`Tag '${tagId}' not found for this edition`);

    const updated = await this.prisma.editionFeatureTag.update({
      where: { id: tagId },
      data: {
        ...(dto.rawValue !== undefined && { rawValue: dto.rawValue }),
        ...(dto.categories !== undefined && { categories: dto.categories }),
        isManual: true,
      },
      select: {
        id: true, rawValue: true, isManual: true, categories: true,
      },
    });
    return this.enrichTagWithCategories(updated);
  }

  async removeCategoryFromTag(slug: string, tagId: string, categorySlug: string) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    const tag = await this.prisma.editionFeatureTag.findFirst({ where: { id: tagId, editionId: edition.id } });
    if (!tag) throw new NotFoundException(`Tag '${tagId}' not found for this edition`);

    const cats = (tag.categories as string[]).filter((c) => c !== categorySlug);
    if (cats.length === 0 && !tag.isManual) {
      await this.prisma.editionFeatureTag.delete({ where: { id: tagId } });
      return { deleted: true };
    }

    const updated = await this.prisma.editionFeatureTag.update({
      where: { id: tagId },
      data: { categories: cats, isManual: true },
      select: { id: true, rawValue: true, isManual: true, categories: true },
    });

    return this.enrichTagWithCategories(updated);
  }

  private async enrichTagsWithCategories(
    featureTags: Array<{
      id: string;
      rawValue: string;
      isManual: boolean;
      categories: string[];
    }>,
  ) {
    const allCategories = await this.prisma.featureCategory.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, label: true, group: true, sortOrder: true },
    });
    const catMap = new Map(allCategories.map((c) => [c.slug, c]));
    return featureTags.map((t) => ({
      ...t,
      categories: (t.categories as string[])
        .map((slug) => catMap.get(slug))
        .filter(Boolean)
        .sort((a, b) => (a!.sortOrder ?? 0) - (b!.sortOrder ?? 0)),
    }));
  }

  private async enrichTagWithCategories(
    tag: { id: string; rawValue: string; isManual: boolean; categories: string[] } | null,
  ) {
    if (!tag) throw new NotFoundException('Feature tag not found');
    const [enriched] = await this.enrichTagsWithCategories([tag]);
    return enriched;
  }

  private deleteCloudinaryImages(ids: (string | null | undefined)[]) {
    return deleteCloudinaryImages(ids, this.uploadService);
  }

  private async replaceEditionSaleDates(editionId: string, saleDates: EditionSaleDateInputDto[]) {
    await this.prisma.editionSaleDate.deleteMany({ where: { editionId } });
    if (saleDates.length === 0) return;
    await this.prisma.editionSaleDate.createMany({
      data: saleDates.map((d, i) => ({
        editionId,
        label: d.label,
        date: new Date(d.date),
        order: d.order ?? i,
      })),
    });
  }

  /**
   * Resolves the single representative sale date for an edition:
   * - if linked to a SaleAnnouncement, the earliest SaleTier for that announcement/region —
   *   read live, never copied, so it always reflects the announcement's current tiers
   * - else the earliest manually-entered EditionSaleDate row (standalone editions)
   * - else null (callers fall back to edition.createdAt, matching the previous
   *   generalSaleDate-null behavior)
   *
   * Single-edition scoped — every current call site (linkEditionHistory, edition detail
   * reads) resolves at most a handful of editions, not a list. A future list/grid view
   * showing many editions' dates at once should batch across edition IDs instead of
   * calling this in a loop, to avoid N+1 queries.
   */
  async resolveEditionSaleDate(editionId: string): Promise<{ label: string; date: Date } | null> {
    const link = await this.prisma.saleAnnouncementEdition.findFirst({
      where: { editionId },
      select: { saleId: true },
    });
    if (link) {
      const defaultRegion = await this.prisma.saleAnnouncementRegion.findFirst({
        where: { saleId: link.saleId, isDefault: true },
        select: { id: true },
      });
      const tier =
        (defaultRegion &&
          (await this.prisma.saleTier.findFirst({
            where: { saleId: link.saleId, regionId: defaultRegion.id },
            orderBy: { date: 'asc' },
          }))) ||
        (await this.prisma.saleTier.findFirst({
          where: { saleId: link.saleId, regionId: null },
          orderBy: { date: 'asc' },
        }));
      return tier ? { label: tier.name, date: tier.date } : null;
    }
    const manual = await this.prisma.editionSaleDate.findFirst({
      where: { editionId },
      orderBy: { date: 'asc' },
    });
    return manual ? { label: manual.label, date: manual.date } : null;
  }

  private async invalidateEditionCountCaches(companySlug: string, subscriptionId?: string | null, collectionId?: string | null) {
    await this.cache.del(companyEditionsAllCountKey(companySlug));
    if (subscriptionId) await this.cache.del(companyEditionsSubCountKey(companySlug, subscriptionId));
    if (collectionId) await this.cache.del(companyEditionsColCountKey(companySlug, collectionId));
    if (!subscriptionId && !collectionId) await this.cache.del(companyEditionsNoColCountKey(companySlug));
  }

  async create(dto: CreateEditionDto, opts?: { verifiedAt?: Date | null; submittedByUserId?: string }) {
    const book = await this.prisma.book.findUnique({ where: { id: dto.bookId } });
    if (!book) throw new NotFoundException(`Book '${dto.bookId}' not found`);

    let companySlug: string | undefined;
    const slugPart = dto.bookBoxCompanyId
      ? await this.prisma.bookBoxCompany.findUnique({ where: { id: dto.bookBoxCompanyId }, select: { name: true, slug: true } })
      : null;
    if (slugPart) companySlug = slugPart.slug;

    const slug = generateSlugFromParts(
      book.title,
      slugPart?.name ?? dto.bookBoxCompanyCustomName ?? dto.publisher,
    );

    const edition = await this.prisma.bookEdition.create({
      data: {
        slug,
        bookId: dto.bookId,
        publisher: dto.publisher,
        language: dto.language,
        additionalImages:dto.additionalImages ?? [],
        isSpecial: dto.isSpecial ?? false,
        basePrice: dto.basePrice ? dto.basePrice : undefined,
        currency: dto.currency,
        firstAccessDate: dto.firstAccessDate,
        earlyAccessDate: dto.earlyAccessDate,
        generalSaleDate: dto.generalSaleDate,
        bookBoxCompanyId: dto.bookBoxCompanyId,
        bookBoxCompanyCustomName: dto.bookBoxCompanyCustomName,
        subscriptionId: dto.subscriptionId,
        subscriptionMonthId: dto.subscriptionMonthId,
        collectionId: dto.collectionId,
        features: dto.features ?? [],
        photoCredit: dto.photoCredit,
        verifiedAt:opts?.verifiedAt !== undefined ? opts.verifiedAt : new Date(),
        submittedByUserId: opts?.submittedByUserId,
      },
    });
    await this.syncEditionMediaAssets(edition.id, dto.additionalImages ?? []);
    if (dto.saleDates !== undefined) await this.replaceEditionSaleDates(edition.id, dto.saleDates);
    await this.indexEdition(edition.id);
    if (companySlug) await this.invalidateEditionCountCaches(companySlug, dto.subscriptionId, dto.collectionId);
    // Tag features asynchronously (artist roles not yet available at create time)
    void this.retagEditionById(edition.id);
    return edition;
  }

  async findAll(query: EditionQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where: Record<string, unknown> = {};
    if (query.bookId) {
      where.bookId = query.bookId;
    } else if (query.bookSlug) {
      where.book = { slug: query.bookSlug };
    }
    if (query.companyId) where.bookBoxCompanyId = query.companyId;
    if (query.subscriptionId) where.subscriptionId = query.subscriptionId;
    if (query.collectionId) where.collectionId = query.collectionId;
    if (query.language) where.language = query.language;
    if (query.needsVerification === true) where.verifiedAt = null;
    if (query.exclusiveOnly === true) { where.collectionId = null; where.subscriptionId = null; }
    if (query.noSubscription === true) where.subscriptionId = null;
    if (query.hasOfficialPhoto === true) {
      where.additionalImages = { isEmpty: true };
    }
    if (query.search) {
      const s = query.search;
      where.OR = [
        { book: { title: { contains: s, mode: 'insensitive' } } },
        { book: { authors: { some: { author: { name: { contains: s, mode: 'insensitive' } } } } } },
        { publisher: { contains: s, mode: 'insensitive' } },
        { bookBoxCompany: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.bookEdition.findMany({
        where,
        skip,
        take: pageSize,
        select: {
          id: true,
          slug: true,
          publisher: true,
          bookBoxCompanyCustomName: true,
          additionalImages: true,
          subscriptionId: true,
          isSpecial: true,
          verifiedAt: true,
          createdAt: true,
          book: {
            select: {
              id: true,
              slug: true,
              title: true,
              seriesName: true,
              volumeNumbers: true,
              series: { select: { id: true, slug: true, name: true } },
              authors: { select: { author: { select: { id: true, name: true, slug: true } } } },
            },
          },
          artists: { select: { id: true, role: true, artistName: true, artist: { select: { id: true, name: true, slug: true } } } },
          bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
          collection: { select: { id: true, name: true, slug: true } },
          communityImages: {
            where: { status: 'APPROVED' },
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: { url: true },
          },
          ...(query.needsVerification
            ? { _count: { select: { userEntries: true } } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bookEdition.count({ where }),
    ]);

    // Resolve subscription names (subscriptionId is a bare FK with no Prisma relation)
    const subIds = [...new Set(data.map((e) => (e as any).subscriptionId).filter(Boolean))];
    const subNames: Record<string, string> = {};
    if (subIds.length > 0) {
      const subs = await this.prisma.subscription.findMany({
        where: { id: { in: subIds } },
        select: { id: true, name: true },
      });
      for (const s of subs) subNames[s.id] = s.name;
    }

    const flatData = data.map((e) => {
      const { communityImages, ...rest } = e as typeof e & { communityImages: Array<{ url: string }> };
      return {
        ...rest,
        subscriptionName: (e as any).subscriptionId ? (subNames[(e as any).subscriptionId] ?? null) : null,
        communityPhotoCover: (e.additionalImages as string[]).length === 0
          ? (communityImages?.[0]?.url ?? null)
          : null,
        book: e.book
          ? { ...e.book, authors: e.book.authors.map((ba: { author: unknown }) => ba.author) }
          : e.book,
      };
    });

    return { data: flatData, ...buildPageMeta(total, page, pageSize) };
  }

  async findTrending(limit = 8) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 24)) : 8;
    const cacheKey = `editions:trending:${safeLimit}`;
    const cached = await this.cache.get<TrendingEditionResult[]>(cacheKey);
    if (cached) return cached;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const grouped = await this.prisma.userBookEntry.groupBy({
      by: ['editionId'],
      where: {
        isWishlist: true,
        createdAt: { gte: sevenDaysAgo },
      },
      _count: { editionId: true },
      orderBy: { _count: { editionId: 'desc' } },
      take: safeLimit,
    });

    if (grouped.length === 0) {
      await this.cache.set(cacheKey, [], TRENDING_TTL);
      return [];
    }

    const ids = grouped.map((item) => item.editionId).filter((id): id is string => Boolean(id));

    if (ids.length === 0) {
      await this.cache.set(cacheKey, [], TRENDING_TTL);
      return [];
    }
    const editions = await this.prisma.bookEdition.findMany({
      where: {
        id: { in: ids },
        verifiedAt: { not: null },
      },
      select: {
        id: true,
        slug: true,
        additionalImages: true,
        book: {
          select: {
            title: true,
            seriesName: true,
            volumeNumbers: true,
            authors: {
              include: {
                author: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
        bookBoxCompany: {
          select: { name: true, slug: true, brandColors: true },
        },
      },
    });

    const countsById = new Map(grouped.map((item, index) => [
      item.editionId,
      { count: item._count.editionId, index },
    ]));

    const result = editions
      .map((edition) => {
        const meta = countsById.get(edition.id);
        if (!meta) return null;
        return {
          id: edition.id,
          slug: edition.slug,
          additionalImages: edition.additionalImages,
          book: edition.book
            ? {
                ...edition.book,
                authors: edition.book.authors.map(({ author }: { author: { id: string; name: string; slug: string } }) => author),
              }
            : null,
          bookBoxCompany: edition.bookBoxCompany,
          wishlistCount: meta.count,
        };
      })
      .filter((edition): edition is TrendingEditionResult => Boolean(edition))
      .sort((a, b) => countsById.get(a.id)!.index - countsById.get(b.id)!.index);

    await this.cache.set(cacheKey, result, TRENDING_TTL);
    return result;
  }

  async findPublishers(search?: string): Promise<string[]> {
    const rows = await this.prisma.bookEdition.findMany({
      where: {
        publisher: {
          not: null,
          ...(search ? { contains: search, mode: 'insensitive' as const } : {}),
        },
        verifiedAt: { not: null },
      },
      select: { publisher: true },
      distinct: ['publisher'],
      orderBy: { publisher: 'asc' },
      take: 25,
    });
    return rows.map(r => r.publisher).filter(Boolean) as string[];
  }

  /** Lean fetch for admin edit form — only fields needed by the form, without monthBooks/saleEditions/book authors. */
  async findBySlugForAdmin(slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug },
      select: {
        id: true, slug: true, bookId: true,
        bookBoxCompanyId: true, collectionId: true, bookBoxCompanyCustomName: true,
        publisher: true, isSpecial: true,
        additionalImages: true, language: true,
        basePrice: true, currency: true, features: true,
        firstAccessDate: true, earlyAccessDate: true, generalSaleDate: true,
        verifiedAt: true, submittedByUserId: true, photoCredit: true,
        book: { select: { id: true, title: true } },
        artists: {
          select: {
            id: true, role: true,
            artist: { select: { id: true, name: true } },
          },
        },
        featureTags: {
          select: {
            id: true, rawValue: true, isManual: true, categories: true,
          },
          orderBy: [{ sortOrder: 'asc' as const }],
        },
        previousEdition: {
          select: {
            slug: true, generalSaleDate: true,
            bookBoxCompany: { select: { name: true } },
          },
        },
        nextEdition: {
          select: {
            slug: true, generalSaleDate: true,
            bookBoxCompany: { select: { name: true } },
          },
        },
      },
    });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    return {
      ...edition,
      featureTags: await this.enrichTagsWithCategories(edition.featureTags as any),
    };
  }

  async findBySlug(slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug },
      select: {
        id: true, slug: true,
        bookBoxCompanyId: true, collectionId: true, subscriptionId: true, bookBoxCompanyCustomName: true,
        publisher: true, isSpecial: true,
        additionalImages: true, language: true,
        basePrice: true, currency: true, features: true,
        firstAccessDate: true, earlyAccessDate: true, generalSaleDate: true,
        verifiedAt: true, submittedByUserId: true, photoCredit: true,
        book: {
          select: {
            id: true, slug: true, title: true, description: true,
            seriesName: true, volumeNumbers: true, language: true,
            series: { select: { id: true, slug: true, name: true } },
            isOmnibus: true, componentCount: true,
            seriesEntries: {
              select: {
                seriesId: true, volumeNumbers: true, isPrimary: true,
                series: { select: { id: true, slug: true, name: true } },
              },
              orderBy: { isPrimary: 'desc' },
            },
            omnibusComponents: {
              select: {
                id: true, volumeNumber: true, order: true,
                book: { select: { id: true, slug: true, title: true } },
              },
              orderBy: { order: 'asc' },
            },
            authors: {
              select: {
                author: { select: { id: true, name: true, slug: true, nationality: true } },
              },
            },
          },
        },
        featureTags: {
          select: {
            id: true, rawValue: true, isManual: true, categories: true,
          },
          orderBy: [{ sortOrder: 'asc' as const }],
        },
        artists: {
          select: {
            role: true,
            artist: { select: { id: true, name: true, slug: true, photoUrl: true } },
          },
        },
        bookBoxCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
        collection: { select: { id: true, slug: true, name: true } },
        monthBooks: {
          select: {
            month: {
              select: {
                id: true, year: true, month: true, theme: true,
                subscription: {
                  select: {
                    id: true, slug: true, name: true, isContentStream: true,
                    variants: { select: { id: true, slug: true, name: true, startDate: true, endDate: true } },
                  },
                },
                series: { select: { id: true, slug: true, name: true } },
                books: {
                  select: {
                    sortOrder: true,
                    isMainBook: true,
                    book: { select: { id: true, title: true, slug: true } },
                    edition: { select: { id: true, slug: true } },
                  },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
        saleEditions: {
          orderBy: { announcement: { generalSaleDate: 'asc' as const } },
          select: {
            id: true,
            isReprint: true,
            announcement: {
              select: {
                id: true, title: true, isBundle: true,
                generalSaleDate: true, earlyAccessDate: true, firstAccessDate: true,
              },
            },
          },
        },
        previousEdition: {
          select: {
            id: true, slug: true, additionalImages: true,
            generalSaleDate: true, createdAt: true,
            bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
            collection: { select: { id: true, name: true, slug: true } },
          },
        },
        nextEdition: {
          select: {
            id: true, slug: true, additionalImages: true,
            generalSaleDate: true, createdAt: true,
            bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
            collection: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    // Flatten authors on nested book
    return {
      ...edition,
      featureTags: await this.enrichTagsWithCategories(edition.featureTags as any),
      book: edition.book
        ? { ...edition.book, authors: edition.book.authors.map((ba: { author: unknown }) => ba.author) }
        : edition.book,
    };
  }

  async verify(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.bookEdition.update({
      where: { slug },
      data: { verifiedAt: new Date() },
    });
  }

  async update(slug: string, dto: UpdateEditionDto) {
    const existing = await this.findBySlug(slug);

    // Build a plain update object — never pass a class instance directly to Prisma
    const data: Record<string, unknown> = {};
    if (dto.publisher !== undefined) data.publisher = dto.publisher;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.additionalImages !== undefined) data.additionalImages = dto.additionalImages;
    if (dto.isSpecial !== undefined) data.isSpecial = dto.isSpecial;
    if (dto.basePrice !== undefined) {
      if (dto.basePrice) {
        // Normalize comma decimal separator (e.g. "12,99" → "12.99")
        data.basePrice = dto.basePrice.replace(',', '.');
      } else {
        data.basePrice = null;
      }
    }
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.firstAccessDate !== undefined) data.firstAccessDate = dto.firstAccessDate;
    if (dto.earlyAccessDate !== undefined) data.earlyAccessDate = dto.earlyAccessDate;
    if (dto.generalSaleDate !== undefined) data.generalSaleDate = dto.generalSaleDate;
    if (dto.bookBoxCompanyId !== undefined) data.bookBoxCompanyId = dto.bookBoxCompanyId;
    if (dto.bookBoxCompanyCustomName !== undefined) data.bookBoxCompanyCustomName = dto.bookBoxCompanyCustomName;
    if (dto.subscriptionId !== undefined) data.subscriptionId = dto.subscriptionId;
    if (dto.subscriptionMonthId !== undefined) data.subscriptionMonthId = dto.subscriptionMonthId;
    if (dto.collectionId !== undefined) data.collectionId = dto.collectionId;
    if (dto.features !== undefined) data.features = dto.features;
    if (dto.photoCredit !== undefined) data.photoCredit = dto.photoCredit;

    const edition = await this.prisma.bookEdition.update({ where: { slug }, data });
    if (dto.saleDates !== undefined) await this.replaceEditionSaleDates(edition.id, dto.saleDates);
    if (dto.additionalImages !== undefined) {
      await this.syncEditionMediaAssets(edition.id, dto.additionalImages ?? []);
    }
    // Delete removed images from Cloudinary — only if no other model still references them
    if (dto.additionalImages !== undefined) {
      const removed = (existing.additionalImages as string[]).filter(
        (img) => !(dto.additionalImages as string[]).includes(img),
      );
      await Promise.allSettled(
        removed
          .filter(id => !!id && !id.startsWith('http'))
          .map(id => this.mediaAssetsService.deleteIfUnused(id, this.uploadService)),
      );
    }
    await this.indexEdition(edition.id);
    // Retag whenever features may have changed
    if (dto.features !== undefined) void this.retagEditionById(edition.id);
    return edition;
  }

  async delete(slug: string, userRole?: string) {
    const edition = await this.findBySlug(slug);
    const collectionCount = await this.prisma.userBookEntry.count({ where: { editionId: edition.id } });

    if (userRole === 'ADMIN') {
      // Admin can force-delete even if in collections
    } else if (collectionCount > 0) {
      throw new ConflictException(`Cannot delete edition that is in ${collectionCount} user collection(s)`);
    }

    const imagesToMaybeDelete = (edition.additionalImages as string[]).filter(id => !!id && !id.startsWith('http'));
    await this.typesense.deleteDocument('editions', edition.id);
    const deleted = await this.prisma.bookEdition.delete({ where: { slug } });
    if (edition.bookBoxCompany?.slug) {
      await this.invalidateEditionCountCaches(edition.bookBoxCompany.slug, edition.subscriptionId, edition.collectionId);
    }
    // Delete images after edition is removed so cascade clears join table first
    void Promise.allSettled(
      imagesToMaybeDelete.map(id => this.mediaAssetsService.deleteIfUnused(id, this.uploadService)),
    );
    return { ...deleted, collectionsAffected: collectionCount };
  }

  async addArtist(slug: string, dto: AddArtistDto) {
    const edition = await this.findBySlug(slug);
    const role = dto.role ?? 'cover';
    const result = await this.prisma.artistContribution.upsert({
      where: { editionId_artistId_role: { editionId: edition.id, artistId: dto.artistId, role } },
      create: {
        editionId: edition.id,
        artistId: dto.artistId,
        artistName: dto.artistName,
        role,
      },
      update: { artistName: dto.artistName },
    });
    return result;
  }

  async patchArtistContribution(slug: string, contributionId: string, newRole: string) {
    const edition = await this.findBySlug(slug);
    const contribution = await this.prisma.artistContribution.findFirst({
      where: { id: contributionId, editionId: edition.id },
    });
    if (!contribution) throw new NotFoundException(`Artist contribution '${contributionId}' not found`);
    const result = await this.prisma.artistContribution.update({
      where: { id: contributionId },
      data: { role: newRole },
    });
    return result;
  }

  async removeArtist(slug: string, artistId: string) {
    const edition = await this.findBySlug(slug);
    const result = await this.prisma.artistContribution.deleteMany({
      where: { editionId: edition.id, artistId },
    });
    return result;
  }

  /** Link two editions as previous→next. Auto-determines direction by date.
   * Returns the resulting chain and whether an intermediate re-linking happened. */
  async linkEditionHistory(slugA: string, slugB: string): Promise<{
    older: { id: string; slug: string };
    newer: { id: string; slug: string };
    wasRerouted: boolean;
    chain: Array<{ slug: string; date: Date | null }>;
  }> {
    const [a, b] = await Promise.all([
      this.prisma.bookEdition.findUnique({
        where: { slug: slugA },
        select: { id: true, slug: true, bookId: true, createdAt: true, previousEditionId: true, nextEdition: { select: { id: true, slug: true, createdAt: true } } },
      }),
      this.prisma.bookEdition.findUnique({
        where: { slug: slugB },
        select: { id: true, slug: true, bookId: true, createdAt: true, previousEditionId: true, nextEdition: { select: { id: true, slug: true, createdAt: true } } },
      }),
    ]);
    if (!a) throw new NotFoundException(`Edition '${slugA}' not found`);
    if (!b) throw new NotFoundException(`Edition '${slugB}' not found`);
    if (a.bookId !== b.bookId) throw new BadRequestException('Editions must belong to the same book');

    const resolvedA = await this.resolveEditionSaleDate(a.id);
    const resolvedB = await this.resolveEditionSaleDate(b.id);
    const dateA = resolvedA?.date ?? a.createdAt;
    const dateB = resolvedB?.date ?? b.createdAt;

    // Determine older/newer
    const [older, newer] = dateA <= dateB ? [a, b] : [b, a];
    const olderResolvedDate = older.id === a.id ? resolvedA?.date ?? null : resolvedB?.date ?? null;
    const newerResolvedDate = newer.id === a.id ? resolvedA?.date ?? null : resolvedB?.date ?? null;

    let wasRerouted = false;

    // Detect chain re-linking: older already has a nextEdition (C) that is newer than `newer`
    const existingNext = older.nextEdition;
    if (existingNext) {
      const dateExisting = (await this.resolveEditionSaleDate(existingNext.id))?.date ?? null;
      const dateNewer = newerResolvedDate;
      if (dateExisting && dateNewer && dateNewer < dateExisting) {
        // Insert newer between older and existingNext: older→newer→existingNext
        await this.prisma.$transaction([
          // newer points to older
          this.prisma.bookEdition.update({ where: { id: newer.id }, data: { previousEditionId: older.id } }),
          // existingNext points to newer
          this.prisma.bookEdition.update({ where: { id: existingNext.id }, data: { previousEditionId: newer.id } }),
        ]);
        wasRerouted = true;
        return {
          older: { id: older.id, slug: older.slug },
          newer: { id: newer.id, slug: newer.slug },
          wasRerouted,
          chain: [
            { slug: older.slug, date: olderResolvedDate },
            { slug: newer.slug, date: newerResolvedDate },
            { slug: existingNext.slug, date: dateExisting },
          ],
        };
      }
    }

    // Simple link: newer.previousEditionId = older.id
    await this.prisma.bookEdition.update({
      where: { id: newer.id },
      data: { previousEditionId: older.id },
    });

    return {
      older: { id: older.id, slug: older.slug },
      newer: { id: newer.id, slug: newer.slug },
      wasRerouted: false,
      chain: [
        { slug: older.slug, date: olderResolvedDate },
        { slug: newer.slug, date: newerResolvedDate },
      ],
    };
  }

  /** Remove the previousEdition link from an edition (unlink from history) */
  async unlinkEditionHistory(slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    return this.prisma.bookEdition.update({ where: { id: edition.id }, data: { previousEditionId: null } });
  }

  private async indexEdition(editionId: string): Promise<void> {
    try {
      const edition = await this.prisma.bookEdition.findUnique({
        where: { id: editionId },
        select: {
          id: true,
          publisher: true,
          createdAt: true,
          book: {
            select: {
              id: true,
              title: true,
              authors: { select: { author: { select: { name: true } } } },
            },
          },
          bookBoxCompany: { select: { name: true, slug: true } },
        },
      });
      if (!edition) return;
      await this.typesense.upsertDocument('editions', {
        id: edition.id,
        bookId: edition.book.id,
        bookTitle: edition.book.title,
        authorNames: edition.book.authors.map((a) => a.author.name),
        publisher: edition.publisher ?? '',
        companyName: edition.bookBoxCompany?.name ?? '',
        companySlug: edition.bookBoxCompany?.slug ?? '',
        createdAt: Math.floor(new Date(edition.createdAt).getTime() / 1000),
      });
    } catch (err) {
      this.logger.error(`Failed to index edition ${editionId}`, err);
    }
  }
}
