import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { CreateAuthorDto, UpdateAuthorDto, AuthorQueryDto } from './authors.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { MediaAssetsService } from '../media-assets/media-assets.service';

const AUTHOR_SLUG_TTL = 24 * 60 * 60 * 1000;
const AUTHOR_BOOKS_TTL = 60 * 60 * 1000;

const authorProfileKey = (slug: string) => `authors:slug:${slug}`;
const authorBooksKey = (slug: string) => `authors:slug:${slug}:books`;

@Injectable()
export class AuthorsService {
  private readonly logger = new Logger(AuthorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly mediaAssetsService: MediaAssetsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async create(dto: CreateAuthorDto) {
    const slug = generateSlug(dto.name);
    const photoAsset = dto.photoUrl ? await this.mediaAssetsService.ensureForPublicId(dto.photoUrl) : null;
    const author = await (this.prisma.author as any).create({
      data: {
        slug,
        name: dto.name,
        bio: dto.bio,
        photoUrl: dto.photoUrl,
        photoAssetId: photoAsset?.id ?? null,
        nationality: dto.nationality,
        website: dto.website,
        instagram: dto.instagram,
        twitter: dto.twitter,
        facebook: dto.facebook,
        tiktok: dto.tiktok,
      },
    });
    await this.indexAuthor(author);
    return {
      ...author,
      photoAsset: photoAsset ? { id: photoAsset.id, publicId: photoAsset.publicId } : null,
      photoUrl: photoAsset?.publicId ?? author.photoUrl,
    };
  }

  async findAll(query: AuthorQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      (this.prisma.author as any).findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          photoUrl: true,
          photoAsset: { select: { id: true, publicId: true } },
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

    return {
      data: data.map((author: any) => ({
        ...author,
        photoUrl: author.photoAsset?.publicId ?? author.photoUrl,
      })),
      ...buildPageMeta(total, page, pageSize),
    };
  }

  async findBySlug(slug: string) {
    const cached = await this.cache.get(authorProfileKey(slug));
    if (cached) return cached as Awaited<ReturnType<typeof this._fetchAuthorProfile>>;
    const author = await this._fetchAuthorProfile(slug);
    await this.cache.set(authorProfileKey(slug), author, AUTHOR_SLUG_TTL);
    return author;
  }

  private async _fetchAuthorProfile(slug: string) {
    const author = await (this.prisma.author as any).findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        bio: true,
        photoUrl: true,
        photoAsset: { select: { id: true, publicId: true } },
        nationality: true,
        website: true,
        instagram: true,
        twitter: true,
        facebook: true,
        tiktok: true,
      },
    });
    if (!author) throw new NotFoundException(`Author '${slug}' not found`);
    return {
      ...author,
      photoUrl: author.photoAsset?.publicId ?? author.photoUrl,
    };
  }

  async findBooks(slug: string) {
    const cached = await this.cache.get(authorBooksKey(slug));
    if (cached) return cached as Awaited<ReturnType<typeof this._fetchAuthorBooks>>;
    await this.findBySlug(slug); // ensure author exists
    const books = await this._fetchAuthorBooks(slug);
    await this.cache.set(authorBooksKey(slug), books, AUTHOR_BOOKS_TTL);
    return books;
  }

  private async _fetchAuthorBooks(slug: string) {
    const author = await this.prisma.author.findUnique({
      where: { slug },
      select: {
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
                    bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
                    communityImages: {
                      where: { status: 'APPROVED' },
                      orderBy: { sortOrder: 'asc' },
                      take: 1,
                      select: { url: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!author) throw new NotFoundException(`Author '${slug}' not found`);
    return author.books.map((ba) => ({
      ...ba.book,
      editions: ba.book.editions.map((e) => {
        const { communityImages, ...rest } = e as typeof e & { communityImages: Array<{ url: string }> };
        return {
          ...rest,
          communityPhotoCover: (e.additionalImages as string[]).length === 0
            ? (communityImages?.[0]?.url ?? null)
            : null,
        };
      }),
    }));
  }

  async update(slug: string, dto: UpdateAuthorDto) {
    await this.findBySlug(slug);
    const data: Record<string, unknown> = { ...dto };
    if (dto.photoUrl !== undefined) {
      const photoAsset = dto.photoUrl ? await this.mediaAssetsService.ensureForPublicId(dto.photoUrl) : null;
      data.photoAssetId = photoAsset?.id ?? null;
    }
    const author = await (this.prisma.author as any).update({ where: { slug }, data });
    await this.indexAuthor(author);
    await this.reindexAuthorBooks(author.id);
    await Promise.all([
      this.cache.del(authorProfileKey(slug)),
      this.cache.del(authorBooksKey(slug)),
    ]);
    const photoAsset = dto.photoUrl !== undefined && dto.photoUrl
      ? await this.mediaAssetsService.ensureForPublicId(dto.photoUrl)
      : null;
    return {
      ...author,
      photoAsset: photoAsset ? { id: photoAsset.id, publicId: photoAsset.publicId } : null,
      photoUrl: photoAsset?.publicId ?? author.photoUrl,
    };
  }

  async delete(slug: string) {
    const author = await this.findBySlug(slug);
    await this.typesense.deleteDocument('authors', author.id);
    await Promise.all([
      this.cache.del(authorProfileKey(slug)),
      this.cache.del(authorBooksKey(slug)),
    ]);
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
