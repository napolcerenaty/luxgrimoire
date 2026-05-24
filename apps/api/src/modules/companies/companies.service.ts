import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { CreateCompanyDto, UpdateCompanyDto, CompanyQueryDto } from './companies.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { deleteCloudinaryImages } from '../../common/cloudinary.helper';
import { findBySlugOrThrow } from '../../common/prisma.utils';

const COMPANY_SLUG_TTL = 24 * 60 * 60 * 1000; // 24 hours — explicit invalidation on all writes
const COMPANY_EDITIONS_TTL = 24 * 60 * 60 * 1000; // 24 hours — invalidated in EditionsService on create/delete
const COMPANY_EDITIONS_FILTERED_TTL = 2 * 60 * 60 * 1000; // 2 hours — per-group lazy-load cache
const companySlugKey = (slug: string) => `companies:slug:${slug}`;
const companyEditionsKey = (slug: string) => `companies:slug:${slug}:editions`;
const companyEditionsSubKey = (slug: string, subscriptionId: string) => `companies:slug:${slug}:editions:sub:${subscriptionId}`;
const companyEditionsColKey = (slug: string, collectionId: string) => `companies:slug:${slug}:editions:col:${collectionId}`;

function formatInterval(n: number): string {
  if (n === 1) return 'Monthly';
  if (n === 2) return 'Bimonthly';
  if (n === 3) return 'Quarterly';
  return `Every ${n} months`;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly uploadService: UploadService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private deleteCloudinaryImages(ids: (string | null | undefined)[]) {
    return deleteCloudinaryImages(ids, this.uploadService);
  }

  async create(dto: CreateCompanyDto) {
    const slug = generateSlug(dto.name);
    const company = await this.prisma.bookBoxCompany.create({
      data: {
        slug,
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        website: dto.website,
        country: dto.country,
        defaultCurrency: dto.defaultCurrency,
        instagram: dto.instagram,
        threads: dto.threads,
        tiktok: dto.tiktok,
        facebook: dto.facebook,
        x: dto.x,
        bluesky: dto.bluesky,
        iossImplemented: dto.iossImplemented ?? false,
        hasOfficialImagePermission: dto.hasOfficialImagePermission ?? false,
      },
    });
    await this.indexCompany(company);
    return company;
  }

  async findNames(): Promise<{ id: string; name: string }[]> {
    return this.prisma.bookBoxCompany.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findAllBrandColors(): Promise<{ slug: string; brandColors: string[] }[]> {
    return this.prisma.bookBoxCompany.findMany({
      select: { slug: true, brandColors: true },
      orderBy: { slug: 'asc' },
    });
  }

  async findAll(query: CompanyQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where: Record<string, unknown> = {};
    if (query.country) where.country = query.country;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.bookBoxCompany.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          subscriptions: {
            where: { isHidden: false, isContentStream: false },
          },
          _count: {
            select: {
              collections: true,
              editions: { where: { collectionId: null } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.bookBoxCompany.count({ where }),
    ]);

    return { data, ...buildPageMeta(total, page, pageSize) };
  }

  async findBySlug(slug: string) {
    const cached = await this.cache.get(companySlugKey(slug));
    if (cached) return cached as Awaited<ReturnType<typeof this._fetchCompanyBySlug>>;
    const result = await this._fetchCompanyBySlug(slug);
    await this.cache.set(companySlugKey(slug), result, COMPANY_SLUG_TTL);
    return result;
  }

  private async _fetchCompanyBySlug(slug: string) {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { slug },
      include: {
        subscriptions: {
          where: { isHidden: false },
          select: { id: true, slug: true, name: true, isDiscontinued: true, logoUrl: true, coverImage: true, genre: true, isCombo: true, isContentStream: true, parentSubscriptionId: true },
        },
        collections: {
          select: { id: true, slug: true, name: true },
        },
      },
    });
    if (!company) throw new NotFoundException(`Company '${slug}' not found`);
    return company;
  }

  async getEditions(slug: string, filter?: { subscriptionId?: string; collectionId?: string }) {
    // Extract cache return type once at method scope (typeof this.method fails inside nested if blocks in TS)
    type CachedEditions = Awaited<ReturnType<typeof this._fetchCompanyEditions>>;
    if (filter?.subscriptionId) {
      const key = companyEditionsSubKey(slug, filter.subscriptionId);
      const cached = await this.cache.get(key);
      if (cached) return cached as CachedEditions;
      const result = await this._fetchCompanyEditions(slug, filter);
      await this.cache.set(key, result, COMPANY_EDITIONS_FILTERED_TTL);
      return result;
    }
    if (filter?.collectionId) {
      const key = companyEditionsColKey(slug, filter.collectionId);
      const cached = await this.cache.get(key);
      if (cached) return cached as CachedEditions;
      const result = await this._fetchCompanyEditions(slug, filter);
      await this.cache.set(key, result, COMPANY_EDITIONS_FILTERED_TTL);
      return result;
    }
    const cached = await this.cache.get(companyEditionsKey(slug));
    if (cached) return cached as CachedEditions;
    const result = await this._fetchCompanyEditions(slug);
    await this.cache.set(companyEditionsKey(slug), result, COMPANY_EDITIONS_TTL);
    return result;
  }

  private async _fetchCompanyEditions(slug: string, filter?: { subscriptionId?: string; collectionId?: string }) {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!company) throw new NotFoundException(`Company '${slug}' not found`);

    const editions = await this.prisma.bookEdition.findMany({
      where: {
        bookBoxCompanyId: company.id,
        ...(filter?.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
        ...(filter?.collectionId ? { collectionId: filter.collectionId } : {}),
      },
      select: {
        id: true,
        slug: true,
        additionalImages: true,
        collectionId: true,
        subscriptionId: true,
        collection: { select: { id: true, name: true, slug: true } },
        communityImages: {
          where: { status: 'APPROVED' },
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { url: true },
        },
        book: {
          select: {
            id: true,
            slug: true,
            title: true,
            seriesName: true,
            volumeNumber: true,
            authors: {
              select: {
                author: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...((!filter?.subscriptionId && !filter?.collectionId) ? { take: 100 } : {}),
    });

    return editions.map((e) => {
      const { communityImages, ...rest } = e;
      return {
        ...rest,
        communityPhotoCover: (e.additionalImages as string[]).length === 0
          ? (communityImages?.[0]?.url ?? null)
          : null,
      };
    });
  }

  async update(slug: string, dto: UpdateCompanyDto) {
    const existing = await this.findBySlug(slug);
    const company = await this.prisma.bookBoxCompany.update({ where: { slug }, data: dto });
    // Delete old logo from Cloudinary if it was replaced or cleared
    if (dto.logoUrl !== undefined && dto.logoUrl !== existing.logoUrl) {
      await this.deleteCloudinaryImages([existing.logoUrl]);
    }
    await this.cache.del(companySlugKey(slug));
    await this.cache.del(companyEditionsKey(slug));
    await this.indexCompany(company);
    await this.reindexCompanyRelations(company.id);
    return company;
  }

  async delete(slug: string) {
    const company = await this.findBySlug(slug);
    await this.deleteCloudinaryImages([company.logoUrl]);
    await this.cache.del(companySlugKey(slug));
    await this.cache.del(companyEditionsKey(slug));
    await this.typesense.deleteDocument('companies', company.id);
    return this.prisma.bookBoxCompany.delete({ where: { slug } });
  }

  async setBrandColors(slug: string, colors: string[]): Promise<string[]> {
    await this.findBySlug(slug);
    const normalized = colors.map((c) => (c.startsWith('#') ? c : `#${c}`));
    await this.prisma.bookBoxCompany.update({ where: { slug }, data: { brandColors: normalized } });
    await this.cache.del(companySlugKey(slug));
    await this.cache.del(companyEditionsKey(slug));
    return normalized;
  }

  async purgeOfficialImages(slug: string): Promise<{
    deletedEditionImages: number;
    deletedMonthImages: number;
    deletedAnnouncementImages: number;
    errors: string[];
  }> {
    const company = await findBySlugOrThrow(this.prisma.bookBoxCompany, slug, 'Company');

    const BATCH = 50;
    const errors: string[] = [];
    let deletedEditionImages = 0;
    let deletedMonthImages = 0;
    let deletedAnnouncementImages = 0;

    // ── Step 1: Edition additionalImages ─────────────────────────────────
    let skip = 0;
    while (true) {
      const editions = await this.prisma.bookEdition.findMany({
        where: {
          bookBoxCompanyId: company.id,
          OR: [{ additionalImages: { isEmpty: false } }, { photoCredit: { not: null } }],
        },
        select: { id: true, additionalImages: true },
        take: BATCH,
        skip,
      });
      if (!editions.length) break;
      for (const edition of editions) {
        try {
          await Promise.allSettled(
            edition.additionalImages.map((img) => this.uploadService.deleteImage(img)),
          );
          await this.prisma.bookEdition.update({
            where: { id: edition.id },
            data: { additionalImages: [], photoCredit: null },
          });
          deletedEditionImages += edition.additionalImages.length;
        } catch (e) {
          errors.push(`Edition ${edition.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      skip += BATCH;
    }

    // ── Step 2: SubscriptionMonth coverImages ─────────────────────────────
    const subscriptions = await this.prisma.subscription.findMany({
      where: { companyId: company.id },
      select: { id: true },
    });
    const subIds = subscriptions.map((s) => s.id);
    if (subIds.length) {
      skip = 0;
      while (true) {
        const months = await this.prisma.subscriptionMonth.findMany({
          where: { subscriptionId: { in: subIds }, coverImage: { not: null } },
          select: { id: true, coverImage: true },
          take: BATCH,
          skip,
        });
        if (!months.length) break;
        for (const month of months) {
          try {
            if (month.coverImage) await this.uploadService.deleteImage(month.coverImage);
            await this.prisma.subscriptionMonth.update({
              where: { id: month.id },
              data: { coverImage: null },
            });
            deletedMonthImages++;
          } catch (e) {
            errors.push(`Month ${month.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        skip += BATCH;
      }
    }

    // ── Step 3: SaleAnnouncement imageUrl ────────────────────────────────
    skip = 0;
    while (true) {
      const announcements = await this.prisma.saleAnnouncement.findMany({
        where: {
          companyId: company.id,
          OR: [{ imageUrl: { not: null } }, { photoCredit: { not: null } }, { extraImagesJson: { not: Prisma.AnyNull } }],
        },
        select: { id: true, imageUrl: true, extraImagesJson: true },
        take: BATCH,
        skip,
      });
      if (!announcements.length) break;
      for (const ann of announcements) {
        try {
          if (ann.imageUrl) await this.uploadService.deleteImage(ann.imageUrl);
          if (ann.extraImagesJson) {
            const extras = ann.extraImagesJson as { url?: string }[];
            for (const extra of Array.isArray(extras) ? extras : []) {
              if (extra?.url) await this.uploadService.deleteImage(extra.url);
            }
          }
          await this.prisma.saleAnnouncement.update({
            where: { id: ann.id },
            data: { imageUrl: null, photoCredit: null, extraImagesJson: Prisma.JsonNull },
          });
          deletedAnnouncementImages++;
        } catch (e) {
          errors.push(`Announcement ${ann.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      skip += BATCH;
    }

    this.logger.log(
      `Purged official images for ${slug}: ` +
      `${deletedEditionImages} edition imgs, ${deletedMonthImages} month imgs, ` +
      `${deletedAnnouncementImages} announcement imgs, ${errors.length} errors`,
    );
    return { deletedEditionImages, deletedMonthImages, deletedAnnouncementImages, errors };
  }

  private async indexCompany(company: { id: string; slug: string; name: string; country?: string | null }): Promise<void> {
    try {
      await this.typesense.upsertDocument('companies', {
        id: company.id,
        slug: company.slug,
        name: company.name,
        country: company.country ?? '',
      });
    } catch (err) {
      this.logger.error(`Failed to index company ${company.id}`, err);
    }
  }

  private async reindexCompanyRelations(companyId: string): Promise<void> {
    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: { companyId },
        select: {
          id: true, slug: true, name: true, intervalMonths: true, isDiscontinued: true,
          company: { select: { name: true } },
        },
        take: 50,
      });
      for (const sub of subscriptions) {
        await this.typesense.upsertDocument('subscriptions', {
          id: sub.id,
          slug: sub.slug,
          name: sub.name,
          companyName: sub.company?.name ?? '',
          type: formatInterval(sub.intervalMonths ?? 1),
          isDiscontinued: sub.isDiscontinued,
        });
      }

      const editions = await this.prisma.bookEdition.findMany({
        where: { bookBoxCompanyId: companyId },
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
        take: 50,
      });
      for (const ed of editions) {
        await this.typesense.upsertDocument('editions', {
          id: ed.id,
          bookId: ed.book.id,
          bookTitle: ed.book.title,
          authorNames: ed.book.authors.map((a) => a.author.name),
          publisher: ed.publisher ?? '',
          companyName: ed.bookBoxCompany?.name ?? '',
          companySlug: ed.bookBoxCompany?.slug ?? '',
          createdAt: Math.floor(new Date(ed.createdAt).getTime() / 1000),
        });
      }
    } catch (err) {
      this.logger.error(`Failed to reindex company relations for ${companyId}`, err);
    }
  }
}
