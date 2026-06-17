import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { BookSeriesQueryDto, CreateBookSeriesDto, UpdateBookSeriesDto } from './book-series.dto';

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

  async findBySlug(slug: string) {
    const series = await this.prisma.bookSeries.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        books: {
          where: { status: 'approved' },
          select: {
            id: true,
            slug: true,
            title: true,
            volumeNumber: true,
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
          orderBy: [{ volumeNumber: 'asc' }, { title: 'asc' }],
        },
      },
    });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);

    return {
      ...series,
      books: series.books.map(book => ({
        ...book,
        editions: (book.editions as Array<{ id: string; slug: string; additionalImages: string[]; verifiedAt: Date | null; generalSaleDate: string | null; bookBoxCompany: { name: string; slug: string; brandColors?: string[] | null } | null; communityImages?: Array<{ url: string }> }>).map((e) => {
          const { communityImages, ...rest } = e;
          return {
            ...rest,
            communityPhotoCover: e.additionalImages.length === 0
              ? (communityImages?.[0]?.url ?? null)
              : null,
          };
        }),
      })),
    };
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
