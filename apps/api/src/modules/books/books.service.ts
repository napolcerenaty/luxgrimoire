import { Injectable, Logger, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { CreateBookDto, UpdateBookDto, BookQueryDto } from './books.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';

const GENRES_TTL = 24 * 60 * 60 * 1000;  // 24 hours — genres change rarely
const SERIES_TTL = 24 * 60 * 60 * 1000;  // 24 hours — series change rarely

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly typesense: TypesenseService,
  ) {}

  async create(dto: CreateBookDto) {
    const slug = generateSlug(dto.title);
    const book = await this.prisma.book.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description,
        language: dto.language ?? 'en',
        seriesName: dto.seriesName,
        volumeNumber: dto.volumeNumber,
        genres: dto.genres ?? [],
        status: dto.status ?? 'approved',
      },
    });
    await this.indexBook(book.id);
    return book;
  }

  async suggest(dto: CreateBookDto, _userId: string) {
    const slug = generateSlug(dto.title);
    return this.prisma.book.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description,
        language: dto.language ?? 'en',
        seriesName: dto.seriesName,
        volumeNumber: dto.volumeNumber,
        genres: dto.genres ?? [],
        status: 'pending',
      },
    });
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
    if (query.seriesName) where.seriesName = query.seriesName;
    if (query.authorId) {
      where.authors = { some: { authorId: query.authorId } };
    }
    if (query.genre) {
      where.genres = { has: query.genre };
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
      ];
    }

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
          description: true,
          language: true,
          volumeNumber: true,
          seriesName: true,
          createdAt: true,
          authors: {
            select: {
              author: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
          // Editions only needed for series browsing
          ...(query.seriesName
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
        volumeNumber: true,
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
        editions: {
          select: {
            id: true,
            slug: true,
            additionalImages: true,
            verifiedAt: true,
            generalSaleDate: true,
            bookBoxCompany: { select: { slug: true, name: true, brandColors: true } },
            communityImages: {
              where: { status: 'APPROVED' },
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
        editionComponents: {
          select: {
            id: true,
            volumeNumber: true,
            customTitle: true,
            edition: {
              select: {
                id: true,
                slug: true,
                editionName: true,
                additionalImages: true,
                isOmnibus: true,
                book: { select: { id: true, slug: true, title: true } },
                bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
              },
            },
          },
        },
      },
    });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    // Flatten authors so response matches ApiBook type
    return {
      ...book,
      authors: book.authors.map(ba => ba.author),
      editions: book.editions.map((e) => {
        const { communityImages, ...rest } = e as typeof e & { communityImages: Array<{ url: string }> };
        return {
          ...rest,
          communityPhotoCover: (e.additionalImages as string[]).length === 0
            ? (communityImages?.[0]?.url ?? null)
            : null,
        };
      }),
      appearsInOmnibus: book.editionComponents,
    };
  }

  async update(slug: string, dto: UpdateBookDto) {
    await this.findBySlug(slug);
    const book = await this.prisma.book.update({ where: { slug }, data: dto });
    await this.indexBook(book.id);
    return book;
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
