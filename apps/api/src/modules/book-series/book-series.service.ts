import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { BookSeriesQueryDto, CreateBookSeriesDto, UpdateBookSeriesDto } from './book-series.dto';

/** Postgres compares Float[] columns element-by-element (lexicographic); Prisma can't
 * express `orderBy` on a scalar list field, so the same comparison is replicated here
 * for in-memory sorting. Series are small enough that this is cheap. */
function compareVolumeNumbers(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

@Injectable()
export class BookSeriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: BookSeriesQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.bookSeries.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          _count: { select: { books: true } },
          books: {
            take: 5,
            select: {
              authors: {
                select: { author: { select: { name: true } } },
              },
            },
          },
        },
      }),
      this.prisma.bookSeries.count({ where }),
    ]);

    return {
      data: data.map(s => {
        const authorNames = Array.from(
          new Set(s.books.flatMap(b => b.authors.map(a => a.author.name)))
        );
        return { id: s.id, slug: s.slug, name: s.name, bookCount: s._count.books, authors: authorNames };
      }),
      ...buildPageMeta(total, page, pageSize),
    };
  }

  /** A book can belong to many series; this lists every book with an entry in this
   * series (primary or not) — not just the ones where it's currently the primary. */
  async findBySlug(slug: string) {
    const series = await this.prisma.bookSeries.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);

    const entries = await this.prisma.bookSeriesEntry.findMany({
      where: { seriesId: series.id, book: { status: 'approved' } },
      select: {
        volumeNumbers: true,
        isPrimary: true,
        book: {
          select: {
            id: true,
            slug: true,
            title: true,
            authors: {
              select: {
                author: { select: { id: true, name: true, slug: true } },
              },
            },
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
                  orderBy: { sortOrder: 'asc' as const },
                  take: 1,
                  select: { url: true },
                },
              },
              where: { verifiedAt: { not: null } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    const books = entries
      .map(({ book, volumeNumbers, isPrimary }) => ({
        ...book,
        volumeNumbers,
        isPrimarySeries: isPrimary,
        editions: (book.editions as Array<{ id: string; slug: string; additionalImages: string[]; verifiedAt: Date | null; generalSaleDate: string | null; bookBoxCompany: { name: string; slug: string; brandColors?: string[] | null } | null; communityImages?: Array<{ url: string }> }>).map((e) => {
          const { communityImages, ...rest } = e;
          return {
            ...rest,
            communityPhotoCover: e.additionalImages.length === 0
              ? (communityImages?.[0]?.url ?? null)
              : null,
          };
        }),
      }))
      .sort((a, b) => compareVolumeNumbers(a.volumeNumbers, b.volumeNumbers) || a.title.localeCompare(b.title));

    return { id: series.id, slug: series.slug, name: series.name, books };
  }

  /** Bulk-reassign the primary series for every book whose primary series is
   * currently `fromSeriesSlug`, switching it to `toSeriesSlug`. The old series stays
   * attached to each affected book as a non-primary entry — nothing is removed. */
  async switchPrimarySeries(fromSeriesSlug: string, toSeriesSlug: string): Promise<{ switchedCount: number }> {
    const [fromSeries, toSeries] = await Promise.all([
      this.prisma.bookSeries.findUnique({ where: { slug: fromSeriesSlug }, select: { id: true } }),
      this.prisma.bookSeries.findUnique({ where: { slug: toSeriesSlug }, select: { id: true, name: true } }),
    ]);
    if (!fromSeries) throw new NotFoundException(`Series '${fromSeriesSlug}' not found`);
    if (!toSeries) throw new NotFoundException(`Series '${toSeriesSlug}' not found`);
    if (fromSeries.id === toSeries.id) throw new BadRequestException('Source and target series must differ');

    return this.prisma.$transaction(async (tx) => {
      const affected = await tx.bookSeriesEntry.findMany({
        where: { seriesId: fromSeries.id, isPrimary: true },
        select: { bookId: true },
      });
      if (affected.length === 0) return { switchedCount: 0 };
      const bookIds = affected.map((a) => a.bookId);

      await tx.bookSeriesEntry.updateMany({
        where: { seriesId: fromSeries.id, bookId: { in: bookIds } },
        data: { isPrimary: false },
      });

      for (const bookId of bookIds) {
        await tx.bookSeriesEntry.upsert({
          where: { bookId_seriesId: { bookId, seriesId: toSeries.id } },
          create: { bookId, seriesId: toSeries.id, isPrimary: true, volumeNumbers: [] },
          update: { isPrimary: true },
        });
      }

      const toEntries = await tx.bookSeriesEntry.findMany({
        where: { bookId: { in: bookIds }, seriesId: toSeries.id },
        select: { bookId: true, volumeNumbers: true },
      });
      for (const entry of toEntries) {
        await tx.book.update({
          where: { id: entry.bookId },
          data: { seriesId: toSeries.id, seriesName: toSeries.name, volumeNumbers: entry.volumeNumbers },
        });
      }

      return { switchedCount: bookIds.length };
    });
  }

  /** Find or create a series by name. Used by BooksService when creating/updating books. */
  async findOrCreate(name: string): Promise<{ id: string; slug: string; name: string }> {
    const existing = await this.prisma.bookSeries.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, slug: true, name: true },
    });
    if (existing) return existing;

    const baseSlug = generateSlug(name);
    const slug = await this.ensureUniqueSlug(baseSlug);
    return this.prisma.bookSeries.create({
      data: { slug, name },
      select: { id: true, slug: true, name: true },
    });
  }

  async create(dto: CreateBookSeriesDto) {
    const baseSlug = generateSlug(dto.name);
    const slug = await this.ensureUniqueSlug(baseSlug);
    try {
      return await this.prisma.bookSeries.create({
        data: { slug, name: dto.name },
        select: { id: true, slug: true, name: true },
      });
    } catch {
      throw new ConflictException(`Series '${dto.name}' already exists`);
    }
  }

  async update(slug: string, dto: UpdateBookSeriesDto) {
    const series = await this.prisma.bookSeries.findUnique({ where: { slug } });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);

    const data: { name?: string; slug?: string } = {};
    if (dto.name) {
      data.name = dto.name;
      const newSlug = generateSlug(dto.name);
      if (newSlug !== slug) {
        data.slug = await this.ensureUniqueSlug(newSlug, slug);
      }
    }

    return this.prisma.bookSeries.update({
      where: { slug },
      data,
      select: { id: true, slug: true, name: true },
    });
  }

  async delete(slug: string) {
    const series = await this.prisma.bookSeries.findUnique({
      where: { slug },
      include: { _count: { select: { books: true } } },
    });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);
    if (series._count.books > 0)
      throw new BadRequestException(`Cannot delete series '${slug}' — it still has ${series._count.books} book(s).`);
    return this.prisma.bookSeries.delete({ where: { slug } });
  }

  private async ensureUniqueSlug(base: string, excludeSlug?: string): Promise<string> {
    let candidate = base;
    let n = 1;
    while (true) {
      const existing = await this.prisma.bookSeries.findUnique({ where: { slug: candidate } });
      if (!existing || existing.slug === excludeSlug) return candidate;
      candidate = `${base}-${n++}`;
    }
  }
}
