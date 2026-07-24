import { Injectable, Logger, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { BookSeriesService } from '../book-series/book-series.service';
import {
  CreateBookDto,
  UpdateBookDto,
  BookQueryDto,
  BookSeriesEntryInputDto,
  CreateBookComponentDto,
  UpdateBookComponentDto,
} from './books.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';

const GENRES_TTL = 24 * 60 * 60 * 1000;  // 24 hours — genres change rarely
const SERIES_TTL = 24 * 60 * 60 * 1000;  // 24 hours — series change rarely

const SERIES_SELECT = { id: true, slug: true, name: true } as const;

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly typesense: TypesenseService,
    private readonly bookSeriesService: BookSeriesService,
  ) {}

  async create(dto: CreateBookDto) {
    const book = await this.prisma.book.create({
      data: {
        slug: generateSlug(dto.title),
        title: dto.title,
        description: dto.description,
        language: dto.language ?? 'en',
        genres: dto.genres ?? [],
        status: dto.status ?? 'approved',
      },
    });
    if (dto.seriesEntries?.length) {
      await this.syncSeriesEntries(book.id, dto.seriesEntries);
    }
    await this.indexBook(book.id);
    return this.prisma.book.findUniqueOrThrow({ where: { id: book.id } });
  }

  async suggest(dto: CreateBookDto, _userId: string) {
    const book = await this.prisma.book.create({
      data: {
        slug: generateSlug(dto.title),
        title: dto.title,
        description: dto.description,
        language: dto.language ?? 'en',
        genres: dto.genres ?? [],
        status: 'pending',
      },
    });
    if (dto.seriesEntries?.length) {
      await this.syncSeriesEntries(book.id, dto.seriesEntries);
    }
    return this.prisma.book.findUniqueOrThrow({ where: { id: book.id } });
  }

  /** Replaces every series membership for a book with the given list — full replace,
   * not incremental add/remove. Exactly one entry ends up isPrimary (the first one
   * marked isPrimary, or the first entry if none was marked), and Book's denormalized
   * seriesId/seriesName/volumeNumbers cache (read by every list/card endpoint) is kept
   * in sync with whichever entry is primary. */
  private async syncSeriesEntries(bookId: string, entries: BookSeriesEntryInputDto[]) {
    const resolved = await Promise.all(
      entries.map(async (e) => {
        const series = await this.bookSeriesService.findOrCreate(e.seriesName);
        return {
          seriesId: series.id,
          seriesName: series.name,
          volumeNumbers: e.volumeNumbers ?? [],
          isPrimary: e.isPrimary ?? false,
        };
      }),
    );

    let primarySeen = false;
    for (const r of resolved) {
      if (r.isPrimary) {
        if (primarySeen) r.isPrimary = false;
        primarySeen = true;
      }
    }
    if (resolved.length > 0 && !primarySeen) resolved[0].isPrimary = true;

    const primary = resolved.find((r) => r.isPrimary) ?? null;

    await this.prisma.$transaction([
      this.prisma.bookSeriesEntry.deleteMany({ where: { bookId } }),
      ...(resolved.length > 0
        ? [
            this.prisma.bookSeriesEntry.createMany({
              data: resolved.map((r) => ({
                bookId,
                seriesId: r.seriesId,
                volumeNumbers: r.volumeNumbers,
                isPrimary: r.isPrimary,
              })),
            }),
          ]
        : []),
      this.prisma.book.update({
        where: { id: bookId },
        data: {
          seriesId: primary?.seriesId ?? null,
          seriesName: primary?.seriesName ?? null,
          volumeNumbers: primary?.volumeNumbers ?? [],
        },
      }),
    ]);
  }

  async findAll(query: BookQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where: Record<string, unknown> = {};
    // Default to only approved books for public access; allow admins to filter
    if (query.status === 'all') {
      // no status filter
    } else if (query.status === 'pending' || query.status === 'rejected') {
      where.status = query.status;
    } else {
      where.status = 'approved';
    }
    if (query.language) where.language = query.language;
    if (query.seriesSlug) {
      const series = await this.prisma.bookSeries.findUnique({ where: { slug: query.seriesSlug }, select: { id: true } });
      if (series) where.seriesId = series.id;
    } else if (query.seriesName) {
      // Backward-compat: partial, case-insensitive match by name — a series name can match
      // more than one BookSeries row (e.g. a duplicate), so filter by every match, not just
      // the first one found. No matches -> filter to nothing, rather than silently ignoring
      // the filter and returning every book.
      const series = await this.prisma.bookSeries.findMany({ where: { name: { contains: query.seriesName, mode: 'insensitive' } }, select: { id: true } });
      where.seriesId = { in: series.map((s) => s.id) };
    }
    if (query.authorId) {
      where.authors = { some: { authorId: query.authorId } };
    }
    if (query.genre) {
      where.genres = { has: query.genre };
    }
    if (query.isOmnibus !== undefined) {
      where.isOmnibus = query.isOmnibus;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { authors: { some: { author: { name: { contains: query.search, mode: 'insensitive' } } } } },
      ];
    }

    const isSeriesQuery = !!(query.seriesSlug || query.seriesName);

    const [data, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        skip,
        take: pageSize,
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          genres: true,
          language: true,
          volumeNumbers: true,
          isOmnibus: true,
          componentCount: true,
          seriesName: true,
          series: { select: SERIES_SELECT },
          createdAt: true,
          authors: {
            select: {
              author: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
          // Editions only needed for series browsing
          ...(isSeriesQuery
            ? {
                editions: {
                  select: {
                    id: true,
                    slug: true,
                    additionalImages: true,
                    verifiedAt: true,
                    generalSaleDate: true,
                    bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
                    communityImages: {
                      where: { status: 'APPROVED' },
                      orderBy: { sortOrder: 'asc' },
                      take: 1,
                      select: { url: true },
                    },
                  },
                  where: { verifiedAt: { not: null } },
                  orderBy: { createdAt: 'asc' },
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.book.count({ where }),
    ]);

    const mappedData = data.map((book) => {
      if (!('editions' in book) || !book.editions) return book;
      return {
        ...book,
        editions: (book.editions as Array<{ additionalImages: unknown; communityImages?: Array<{ url: string }>; [key: string]: unknown }>).map((e) => {
          const { communityImages, ...rest } = e;
          return {
            ...rest,
            communityPhotoCover: (e.additionalImages as string[]).length === 0
              ? (communityImages?.[0]?.url ?? null)
              : null,
          };
        }),
      };
    });

    return { data: mappedData, ...buildPageMeta(total, page, pageSize) };
  }

  async findSeriesNames(search?: string): Promise<string[]> {
    const key = search ? `books:series:${search}` : 'books:series';
    const cached = await this.cache.get<string[]>(key);
    if (cached) return cached;

    const books = await this.prisma.book.findMany({
      where: {
        seriesName: {
          not: null,
          ...(search ? { contains: search, mode: 'insensitive' as const } : {}),
        },
      },
      select: { seriesName: true },
      distinct: ['seriesName'],
      orderBy: { seriesName: 'asc' },
      take: 20,
    });
    const result = books.map(b => b.seriesName).filter(Boolean) as string[];
    await this.cache.set(key, result, SERIES_TTL);
    return result;
  }

  async findGenres(search?: string): Promise<string[]> {
    const key = search ? `books:genres:${search}` : 'books:genres';
    const cached = await this.cache.get<string[]>(key);
    if (cached) return cached;

    const rows = await this.prisma.$queryRaw<{ genre: string }[]>`
      SELECT DISTINCT unnest(genres) AS genre FROM books WHERE array_length(genres, 1) > 0 ORDER BY genre LIMIT 200
    `;
    const all = rows.map(r => r.genre);
    let result: string[];
    if (search) {
      const q = search.toLowerCase();
      result = all.filter(g => g.toLowerCase().includes(q)).slice(0, 30);
    } else {
      result = all.slice(0, 50);
    }
    await this.cache.set(key, result, GENRES_TTL);
    return result;
  }

  /** Lightweight fetch for admin edit form — only fields needed by the form, authors not flattened. */
  async findBySlugForAdmin(slug: string) {
    const book = await this.prisma.book.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        volumeNumbers: true,
        isOmnibus: true,
        componentCount: true,
        genres: true,
        status: true,
        seriesEntries: {
          select: { seriesId: true, volumeNumbers: true, isPrimary: true, series: { select: SERIES_SELECT } },
          orderBy: { isPrimary: 'desc' },
        },
        omnibusComponents: {
          select: {
            id: true, bookId: true, volumeNumber: true, order: true,
            book: { select: { id: true, slug: true, title: true } },
          },
          orderBy: { order: 'asc' },
        },
        authors: {
          select: {
            author: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    return book;
  }

  async findBySlug(slug: string) {
    const book = await this.prisma.book.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        language: true,
        seriesName: true,
        series: { select: SERIES_SELECT },
        volumeNumbers: true,
        isOmnibus: true,
        componentCount: true,
        genres: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        authors: {
          select: {
            author: {
              select: { id: true, name: true, slug: true, photoUrl: true, bio: true, nationality: true },
            },
          },
        },
        seriesEntries: {
          select: { seriesId: true, volumeNumbers: true, isPrimary: true, series: { select: SERIES_SELECT } },
          orderBy: { isPrimary: 'desc' },
        },
        omnibusComponents: {
          select: {
            id: true, volumeNumber: true, order: true,
            book: { select: { id: true, slug: true, title: true } },
          },
          orderBy: { order: 'asc' },
        },
        componentOf: {
          select: {
            id: true,
            volumeNumber: true,
            omnibusBook: {
              select: {
                id: true, slug: true, title: true,
                editions: {
                  select: {
                    additionalImages: true,
                    bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
                  },
                  orderBy: { createdAt: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    const { componentOf, ...rest } = book;
    return {
      ...rest,
      authors: book.authors.map(ba => ba.author),
      appearsInOmnibus: componentOf.map((c) => {
        const firstEdition = c.omnibusBook.editions[0];
        return {
          id: c.id,
          volumeNumber: c.volumeNumber,
          omnibusBookSlug: c.omnibusBook.slug,
          omnibusBookTitle: c.omnibusBook.title,
          coverImage: firstEdition?.additionalImages?.[0] ?? null,
          companyName: firstEdition?.bookBoxCompany?.name ?? null,
          companySlug: firstEdition?.bookBoxCompany?.slug ?? null,
          companyBrandColors: firstEdition?.bookBoxCompany?.brandColors ?? null,
        };
      }),
    };
  }

  async findEditionsBySlug(slug: string) {
    const book = await this.prisma.book.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);

    const editions = await this.prisma.bookEdition.findMany({
      where: { bookId: book.id },
      select: {
        id: true,
        slug: true,
        additionalImages: true,
        verifiedAt: true,
        generalSaleDate: true,
        variantLabel: true,
        bookBoxCompany: { select: { slug: true, name: true, brandColors: true } },
        communityImages: {
          where: { status: 'APPROVED' },
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { url: true },
        },
      },
    });

    return editions.map((e) => {
      const { communityImages, ...rest } = e as typeof e & { communityImages: Array<{ url: string }> };
      return {
        ...rest,
        communityPhotoCover: (e.additionalImages as string[]).length === 0
          ? (communityImages?.[0]?.url ?? null)
          : null,
      };
    });
  }

  async update(slug: string, dto: UpdateBookDto) {
    const existing = await this.prisma.book.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) throw new NotFoundException(`Book '${slug}' not found`);

    const { seriesEntries, ...rest } = dto;
    const book = await this.prisma.book.update({ where: { slug }, data: rest });
    if (seriesEntries !== undefined) {
      await this.syncSeriesEntries(book.id, seriesEntries);
    }
    await this.indexBook(book.id);
    return this.prisma.book.findUniqueOrThrow({ where: { id: book.id } });
  }

  async delete(slug: string) {
    const book = await this.findBySlug(slug);
    const editionCount = await this.prisma.bookEdition.count({ where: { bookId: book.id } });
    if (editionCount > 0) {
      throw new ConflictException(`Cannot delete book with ${editionCount} edition(s). Remove all editions first.`);
    }
    // Remove relations that don't have onDelete: Cascade on the Book side
    await this.prisma.subscriptionMonthBook.deleteMany({ where: { bookId: book.id } });
    await this.prisma.userBookEntry.deleteMany({ where: { bookId: book.id } });
    await this.typesense.deleteDocument('books', book.id);
    return this.prisma.book.delete({ where: { slug } });
  }

  async addAuthor(slug: string, authorId: string) {
    const book = await this.findBySlug(slug);
    try {
      const result = await this.prisma.bookAuthor.create({
        data: { bookId: book.id, authorId },
      });
      await this.indexBook(book.id);
      return result;
    } catch {
      throw new ConflictException('Author already linked to this book');
    }
  }

  async removeAuthor(slug: string, authorId: string) {
    const book = await this.findBySlug(slug);
    const result = await this.prisma.bookAuthor.delete({
      where: { bookId_authorId: { bookId: book.id, authorId } },
    });
    await this.indexBook(book.id);
    return result;
  }

  // ── Omnibus components (a Book's own bundled contents) ────────────────────────

  async getComponents(slug: string) {
    const book = await this.prisma.book.findUnique({ where: { slug }, select: { id: true } });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    return this.prisma.bookComponent.findMany({
      where: { omnibusBookId: book.id },
      select: {
        id: true, bookId: true, volumeNumber: true, order: true,
        book: { select: { id: true, slug: true, title: true } },
      },
      orderBy: { order: 'asc' },
    });
  }

  async addComponent(slug: string, dto: CreateBookComponentDto) {
    const book = await this.prisma.book.findUnique({ where: { slug }, select: { id: true } });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    if (dto.bookId === book.id) {
      throw new ConflictException('A book cannot be a component of itself');
    }
    const [component] = await this.prisma.$transaction([
      this.prisma.bookComponent.create({
        data: {
          omnibusBookId: book.id,
          bookId: dto.bookId,
          volumeNumber: dto.volumeNumber ?? null,
          order: dto.order ?? 0,
        },
        select: {
          id: true, bookId: true, volumeNumber: true, order: true,
          book: { select: { id: true, slug: true, title: true } },
        },
      }),
      this.prisma.book.update({
        where: { id: book.id },
        data: { isOmnibus: true, componentCount: { increment: 1 } },
      }),
    ]);
    return component;
  }

  async updateComponent(slug: string, componentId: string, dto: UpdateBookComponentDto) {
    const book = await this.prisma.book.findUnique({ where: { slug }, select: { id: true } });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    return this.prisma.bookComponent.update({
      where: { id: componentId, omnibusBookId: book.id },
      data: {
        volumeNumber: dto.volumeNumber,
        order: dto.order,
      },
      select: {
        id: true, bookId: true, volumeNumber: true, order: true,
        book: { select: { id: true, slug: true, title: true } },
      },
    });
  }

  async removeComponent(slug: string, componentId: string) {
    const book = await this.prisma.book.findUnique({ where: { slug }, select: { id: true } });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    const [deleted] = await this.prisma.$transaction([
      this.prisma.bookComponent.delete({ where: { id: componentId, omnibusBookId: book.id } }),
      this.prisma.book.update({
        where: { id: book.id },
        data: { componentCount: { decrement: 1 } },
      }),
    ]);
    const updated = await this.prisma.book.findUnique({ where: { id: book.id }, select: { componentCount: true } });
    if (updated && updated.componentCount <= 0) {
      await this.prisma.book.update({ where: { id: book.id }, data: { isOmnibus: false, componentCount: 0 } });
    }
    return deleted;
  }

  private async indexBook(bookId: string): Promise<void> {
    try {
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
        select: {
          id: true,
          title: true,
          seriesName: true,
          genres: true,
          createdAt: true,
          authors: { select: { author: { select: { name: true } } } },
        },
      });
      if (!book) return;
      await this.typesense.upsertDocument('books', {
        id: book.id,
        title: book.title,
        seriesName: book.seriesName ?? '',
        authorNames: book.authors.map((a) => a.author.name),
        genres: book.genres,
        createdAt: Math.floor(new Date(book.createdAt).getTime() / 1000),
      });
    } catch (err) {
      this.logger.error(`Failed to index book ${bookId}`, err);
    }
  }
}
