import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { CreateAuthorDto, UpdateAuthorDto, AuthorQueryDto } from './authors.dto';
import { generateSlug } from '../../common/utils/slug.util';

@Injectable()
export class AuthorsService {
  private readonly logger = new Logger(AuthorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
  ) {}

  async create(dto: CreateAuthorDto) {
    const slug = generateSlug(dto.name);
    const author = await this.prisma.author.create({
      data: {
        slug,
        name: dto.name,
        bio: dto.bio,
        photoUrl: dto.photoUrl,
        nationality: dto.nationality,
        website: dto.website,
        instagram: dto.instagram,
        twitter: dto.twitter,
        facebook: dto.facebook,
        tiktok: dto.tiktok,
      },
    });
    await this.indexAuthor(author);
    return author;
  }

  async findAll(query: AuthorQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.author.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          photoUrl: true,
          nationality: true,
          website: true,
          instagram: true,
          twitter: true,
          facebook: true,
          tiktok: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.author.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string) {
    const author = await this.prisma.author.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        bio: true,
        photoUrl: true,
        nationality: true,
        website: true,
        instagram: true,
        twitter: true,
        facebook: true,
        tiktok: true,
        books: {
          select: {
            book: {
              select: {
                id: true,
                slug: true,
                title: true,
                seriesName: true,
                volumeNumber: true,
                editions: {
                  select: {
                    id: true,
                    slug: true,
                    additionalImages: true,
                    verifiedAt: true,
                    generalSaleDate: true,
                    bookBoxCompany: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!author) throw new NotFoundException(`Author '${slug}' not found`);
    return {
      ...author,
      books: author.books.map((ba) => ba.book),
    };
  }

  async update(slug: string, dto: UpdateAuthorDto) {
    await this.findBySlug(slug);
    const author = await this.prisma.author.update({ where: { slug }, data: dto });
    await this.indexAuthor(author);
    await this.reindexAuthorBooks(author.id);
    return author;
  }

  async delete(slug: string) {
    const author = await this.findBySlug(slug);
    await this.typesense.deleteDocument('authors', author.id);
    return this.prisma.author.delete({ where: { slug } });
  }

  private async indexAuthor(author: { id: string; name: string; slug: string; nationality?: string | null }): Promise<void> {
    try {
      await this.typesense.upsertDocument('authors', {
        id: author.id,
        name: author.name,
        slug: author.slug,
        nationality: author.nationality ?? '',
      });
    } catch (err) {
      this.logger.error(`Failed to index author ${author.id}`, err);
    }
  }

  private async reindexAuthorBooks(authorId: string): Promise<void> {
    try {
      const bookAuthors = await this.prisma.bookAuthor.findMany({
        where: { authorId },
        select: { bookId: true },
        take: 50,
      });
      for (const ba of bookAuthors) {
        const book = await this.prisma.book.findUnique({
          where: { id: ba.bookId },
          select: {
            id: true,
            title: true,
            seriesName: true,
            genres: true,
            createdAt: true,
            authors: { select: { author: { select: { name: true } } } },
          },
        });
        if (!book) continue;
        await this.typesense.upsertDocument('books', {
          id: book.id,
          title: book.title,
          seriesName: book.seriesName ?? '',
          authorNames: book.authors.map((a) => a.author.name),
          genres: book.genres,
          createdAt: Math.floor(new Date(book.createdAt).getTime() / 1000),
        });
      }
    } catch (err) {
      this.logger.error(`Failed to reindex books for author ${authorId}`, err);
    }
  }
}
