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
  CreateComponentDto,
  UpdateComponentDto,
} from './editions.dto';
import { generateSlugFromParts } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { deleteCloudinaryImages } from '../../common/cloudinary.helper';
import { FeatureTaggerService } from '../feature-categories/feature-tagger.service';

const companyEditionsAllCountKey = (slug: string) => `companies:slug:${slug}:editions:count`;
const companyEditionsSubCountKey = (slug: string, subId: string) => `companies:slug:${slug}:editions:sub:${subId}:count`;
const companyEditionsColCountKey = (slug: string, colId: string) => `companies:slug:${slug}:editions:col:${colId}:count`;

@Injectable()
export class EditionsService {
  private readonly logger = new Logger(EditionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly uploadService: UploadService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly tagger: FeatureTaggerService,
  ) {}

  /** Re-runs feature tag detection for an edition (features[] + artist roles). */
  private async retagEditionById(editionId: string) {
    const data = await this.prisma.bookEdition.findUnique({
      where: { id: editionId },
      select: {
        features: true,
        artists: { select: { role: true } },
      },
    });
    if (!data) return;
    const features = (data.features as string[]) ?? [];
    const artistRoles = data.artists.map((a: { role: string }) => a.role);
    await this.tagger.retagEdition(editionId, features, artistRoles).catch((err) => {
      this.logger.error(`retagEdition failed for ${editionId}: ${err.message}`);
    });
  }

  /** Public method for manual retag via the API endpoint. */
  async retagBySlug(slug: string): Promise<{ tagsCount: number }> {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug },
      select: { id: true, features: true, artists: { select: { role: true } } },
    });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    const features = (edition.features as string[]) ?? [];
    const artistRoles = edition.artists.map((a: { role: string }) => a.role);
    await this.tagger.retagEdition(edition.id, features, artistRoles);
    const tagsCount = await this.prisma.editionFeatureTag.count({ where: { editionId: edition.id } });
    return { tagsCount };
  }

  /** Manually assign a category to a raw feature value (isManual=true, survives auto-retag). */
  async addFeatureTag(
    slug: string,
    body: { rawValue: string; source: string; categorySlug: string },
  ) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    const category = await this.prisma.featureCategory.findUnique({ where: { slug: body.categorySlug } });
    if (!category) throw new NotFoundException(`Category '${body.categorySlug}' not found`);
    return this.prisma.editionFeatureTag.upsert({
      where: {
        editionId_categoryId: {
          editionId: edition.id,
          categoryId: category.id,
        },
      },
      create: {
        editionId: edition.id,
        categoryId: category.id,
        rawValue: body.rawValue,
        source: body.source,
        isManual: true,
      },
      update: { isManual: true, rawValue: body.rawValue, source: body.source },
    });
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

  private deleteCloudinaryImages(ids: (string | null | undefined)[]) {
    return deleteCloudinaryImages(ids, this.uploadService);
  }

  private async invalidateEditionCountCaches(companySlug: string, subscriptionId?: string | null, collectionId?: string | null) {
    await this.cache.del(companyEditionsAllCountKey(companySlug));
    if (subscriptionId) await this.cache.del(companyEditionsSubCountKey(companySlug, subscriptionId));
    if (collectionId) await this.cache.del(companyEditionsColCountKey(companySlug, collectionId));
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
    if (query.language) where.language = query.language;
    if (query.needsVerification === true) where.verifiedAt = null;
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
          isSpecial: true,
          verifiedAt: true,
          createdAt: true,
          book: {
            select: {
              id: true,
              slug: true,
              title: true,
              seriesName: true,
              volumeNumber: true,
              authors: { select: { author: { select: { id: true, name: true, slug: true } } } },
            },
          },
          artists: { select: { id: true, role: true, artistName: true, artist: { select: { id: true, name: true, slug: true } } } },
          bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
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

    const flatData = data.map((e) => {
      const { communityImages, ...rest } = e as typeof e & { communityImages: Array<{ url: string }> };
      return {
        ...rest,
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
        publisher: true, isSpecial: true, isOmnibus: true,
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
            id: true, rawValue: true, source: true, isManual: true,
            category: { select: { id: true, slug: true, label: true, group: true, sortOrder: true } },
          },
          orderBy: [{ category: { group: 'asc' as const } }, { category: { sortOrder: 'asc' as const } }],
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
    return edition;
  }

  async findBySlug(slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug },
      select: {
        id: true, slug: true,
        bookBoxCompanyId: true, collectionId: true, subscriptionId: true, bookBoxCompanyCustomName: true,
        publisher: true, isSpecial: true, isOmnibus: true,
        additionalImages: true, language: true,
        basePrice: true, currency: true, features: true,
        firstAccessDate: true, earlyAccessDate: true, generalSaleDate: true,
        verifiedAt: true, submittedByUserId: true, photoCredit: true,
        book: {
          select: {
            id: true, slug: true, title: true, description: true,
            seriesName: true, volumeNumber: true, language: true,
            authors: {
              select: {
                author: { select: { id: true, name: true, slug: true, nationality: true } },
              },
            },
          },
        },
        artists: {
          select: {
            id: true, role: true, artistName: true,
            artist: { select: { id: true, name: true, slug: true, photoUrl: true } },
          },
        },
        featureTags: {
          select: {
            id: true, rawValue: true, source: true, isManual: true,
            category: { select: { id: true, slug: true, label: true, group: true, sortOrder: true } },
          },
          orderBy: [{ category: { group: 'asc' as const } }, { category: { sortOrder: 'asc' as const } }],
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
        components: {
          select: {
            id: true,
            bookId: true,
            customTitle: true,
            volumeNumber: true,
            order: true,
            book: { select: { id: true, slug: true, title: true } },
          },
          orderBy: { order: 'asc' },
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
    if (dto.isOmnibus !== undefined) data.isOmnibus = dto.isOmnibus;
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
    // Delete removed images from Cloudinary
    if (dto.additionalImages !== undefined) {
      const removed = (existing.additionalImages as string[]).filter(
        (img) => !(dto.additionalImages as string[]).includes(img),
      );
      await this.deleteCloudinaryImages(removed);
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

    await this.deleteCloudinaryImages(edition.additionalImages as string[]);
    await this.typesense.deleteDocument('editions', edition.id);
    const deleted = await this.prisma.bookEdition.delete({ where: { slug } });
    if (edition.bookBoxCompany?.slug) {
      await this.invalidateEditionCountCaches(edition.bookBoxCompany.slug, edition.subscriptionId, edition.collectionId);
    }
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
    void this.retagEditionById(edition.id);
    return result;
  }

  async removeArtist(slug: string, artistId: string) {
    const edition = await this.findBySlug(slug);
    const result = await this.prisma.artistContribution.deleteMany({
      where: { editionId: edition.id, artistId },
    });
    void this.retagEditionById(edition.id);
    return result;
  }

  async getComponents(slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug },
      select: {
        id: true,
        components: {
          select: {
            id: true, bookId: true, customTitle: true, volumeNumber: true, order: true,
            book: { select: { id: true, slug: true, title: true } },
          },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    return edition.components;
  }

  async addComponent(slug: string, dto: CreateComponentDto) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    const [component] = await this.prisma.$transaction([
      this.prisma.bookEditionComponent.create({
        data: {
          editionId: edition.id,
          bookId: dto.bookId ?? null,
          customTitle: dto.customTitle ?? null,
          volumeNumber: dto.volumeNumber ?? null,
          order: dto.order ?? 0,
        },
        select: {
          id: true, bookId: true, customTitle: true, volumeNumber: true, order: true,
          book: { select: { id: true, slug: true, title: true } },
        },
      }),
      this.prisma.bookEdition.update({
        where: { id: edition.id },
        data: { componentCount: { increment: 1 } },
      }),
    ]);
    return component;
  }

  async updateComponent(slug: string, componentId: string, dto: UpdateComponentDto) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    return this.prisma.bookEditionComponent.update({
      where: { id: componentId, editionId: edition.id },
      data: {
        customTitle: dto.customTitle,
        volumeNumber: dto.volumeNumber,
        order: dto.order,
      },
      select: {
        id: true, bookId: true, customTitle: true, volumeNumber: true, order: true,
        book: { select: { id: true, slug: true, title: true } },
      },
    });
  }

  async removeComponent(slug: string, componentId: string) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { slug }, select: { id: true } });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    const [deleted] = await this.prisma.$transaction([
      this.prisma.bookEditionComponent.delete({ where: { id: componentId, editionId: edition.id } }),
      this.prisma.bookEdition.update({
        where: { id: edition.id },
        data: { componentCount: { decrement: 1 } },
      }),
    ]);
    return deleted;
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
        select: { id: true, slug: true, bookId: true, generalSaleDate: true, createdAt: true, previousEditionId: true, nextEdition: { select: { id: true, slug: true, generalSaleDate: true, createdAt: true } } },
      }),
      this.prisma.bookEdition.findUnique({
        where: { slug: slugB },
        select: { id: true, slug: true, bookId: true, generalSaleDate: true, createdAt: true, previousEditionId: true, nextEdition: { select: { id: true, slug: true, generalSaleDate: true, createdAt: true } } },
      }),
    ]);
    if (!a) throw new NotFoundException(`Edition '${slugA}' not found`);
    if (!b) throw new NotFoundException(`Edition '${slugB}' not found`);
    if (a.bookId !== b.bookId) throw new BadRequestException('Editions must belong to the same book');

    const dateA = a.generalSaleDate ? new Date(a.generalSaleDate) : a.createdAt;
    const dateB = b.generalSaleDate ? new Date(b.generalSaleDate) : b.createdAt;

    // Determine older/newer
    const [older, newer] = dateA <= dateB ? [a, b] : [b, a];

    let wasRerouted = false;

    // Detect chain re-linking: older already has a nextEdition (C) that is newer than `newer`
    const existingNext = older.nextEdition;
    if (existingNext) {
      const dateExisting = existingNext.generalSaleDate ? new Date(existingNext.generalSaleDate) : null;
      const dateNewer = newer.generalSaleDate ? new Date(newer.generalSaleDate) : null;
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
            { slug: older.slug, date: older.generalSaleDate ? new Date(older.generalSaleDate) : null },
            { slug: newer.slug, date: newer.generalSaleDate ? new Date(newer.generalSaleDate) : null },
            { slug: existingNext.slug, date: existingNext.generalSaleDate ? new Date(existingNext.generalSaleDate) : null },
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
        { slug: older.slug, date: older.generalSaleDate ? new Date(older.generalSaleDate) : null },
        { slug: newer.slug, date: newer.generalSaleDate ? new Date(newer.generalSaleDate) : null },
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
