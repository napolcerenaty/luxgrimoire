import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBookDto, UpdateBookDto, BookQueryDto } from './books.dto';
import { generateSlug } from '../../common/utils/slug.util';

const GENRES_TTL = 24 * 60 * 60 * 1000;  // 24 hours — genres change rarely
const SERIES_TTL = 24 * 60 * 60 * 1000;  // 24 hours — series change rarely

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async create(dto: CreateBookDto) {
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
        status: dto.status ?? 'approved',
      },
    });
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
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

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
                select: { id: true, name: true, slug: true, photoUrl: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.book.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
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
            editionName: true,
            publisher: true,
            basePrice: true,
            currency: true,
            language: true,
            isSpecial: true,
            additionalImages: true,
            features: true,
            generalSaleDate: true,
            firstAccessDate: true,
            earlyAccessDate: true,
            createdAt: true,
            updatedAt: true,
            verifiedAt: true,
            bookBoxCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
            artists: {
              select: {
                role: true,
                artistName: true,
                artist: {
                  select: { id: true, name: true, slug: true, photoUrl: true, specialty: true },
                },
              },
            },
          },
        },
      },
    });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    // Flatten authors so response matches ApiBook type
    return { ...book, authors: book.authors.map(ba => ba.author) };
  }

  async update(slug: string, dto: UpdateBookDto) {
    await this.findBySlug(slug);
    return this.prisma.book.update({ where: { slug }, data: dto });
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.book.delete({ where: { slug } });
  }

  async addAuthor(slug: string, authorId: string) {
    const book = await this.findBySlug(slug);
    try {
      return await this.prisma.bookAuthor.create({
        data: { bookId: book.id, authorId },
      });
    } catch {
      throw new ConflictException('Author already linked to this book');
    }
  }

  async removeAuthor(slug: string, authorId: string) {
    const book = await this.findBySlug(slug);
    return this.prisma.bookAuthor.delete({
      where: { bookId_authorId: { bookId: book.id, authorId } },
    });
  }
}
