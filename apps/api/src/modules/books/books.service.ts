import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBookDto, UpdateBookDto, BookQueryDto } from './books.dto';
import { generateSlug } from '../../common/utils/slug.util';

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBookDto) {
    const slug = generateSlug(dto.title);
    return this.prisma.book.create({
      data: {
        slug,
        title: dto.title,
        altTitle: dto.altTitle,
        description: dto.description,
        coverImage: dto.coverImage,
        language: dto.language ?? 'en',
        isbn: dto.isbn,
        seriesName: dto.seriesName,
        volumeNumber: dto.volumeNumber,
        genres: dto.genres ?? [],
        status: dto.status ?? 'approved',
      },
    });
  }

  async findAll(query: BookQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
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
        { altTitle: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        skip,
        take: pageSize,
        include: { authors: { include: { author: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.book.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findSeriesNames(search?: string): Promise<string[]> {
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
    return books.map(b => b.seriesName).filter(Boolean) as string[];
  }

  async findGenres(search?: string): Promise<string[]> {
    // Aggregate all genres arrays and return distinct values
    const books = await this.prisma.book.findMany({
      select: { genres: true },
      where: { genres: { isEmpty: false } },
    });
    const all = Array.from(new Set(books.flatMap(b => b.genres)));
    if (search) {
      const q = search.toLowerCase();
      return all.filter(g => g.toLowerCase().includes(q)).sort().slice(0, 30);
    }
    return all.sort().slice(0, 50);
  }

  async findBySlug(slug: string) {
    const book = await this.prisma.book.findUnique({
      where: { slug },
      include: {
        authors: { include: { author: true } },
        editions: { include: { artists: { include: { artist: true } }, bookBoxCompany: { select: { id: true, slug: true, name: true, logoUrl: true } } } },
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
