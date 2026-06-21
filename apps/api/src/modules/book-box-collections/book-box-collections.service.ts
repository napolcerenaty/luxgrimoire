import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateBookBoxCollectionDto,
  UpdateBookBoxCollectionDto,
  BookBoxCollectionQueryDto,
} from './book-box-collections.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';

const companySlugKey = (slug: string) => `companies:slug:${slug}`;

const COLLECTION_SELECT = {
  id: true,
  slug: true,
  name: true,
  isActive: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, slug: true, name: true, logoUrl: true, brandColors: true } },
  _count: { select: { editions: true } },
};

@Injectable()
export class BookBoxCollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findAll(query: BookBoxCollectionQueryDto) {
    const { skip, take: pageSize, page } = parsePagination({ page: query.page, pageSize: query.pageSize ?? 50 });

    const where: Record<string, unknown> = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.companySlug) where.company = { slug: query.companySlug };

    const [data, total] = await Promise.all([
      this.prisma.bookBoxCollection.findMany({
        where,
        select: COLLECTION_SELECT,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.bookBoxCollection.count({ where }),
    ]);

    return { data, ...buildPageMeta(total, page, pageSize) };
  }

  async findBySlug(slug: string) {
    const collection = await this.prisma.bookBoxCollection.findUnique({
      where: { slug },
      select: {
        ...COLLECTION_SELECT,
        editions: {
          include: {
            book: { include: { authors: { include: { author: true } } } },
            artists: { include: { artist: true } },
            bookBoxCompany: { select: { name: true, slug: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!collection) throw new NotFoundException(`Collection '${slug}' not found`);

    return {
      ...collection,
      editions: collection.editions.map((e) => ({
        ...e,
        book: e.book
          ? { ...e.book, authors: e.book.authors.map((ba) => ba.author) }
          : e.book,
      })),
    };
  }

  async create(dto: CreateBookBoxCollectionDto) {
    const slug = generateSlug(dto.name);
    const result = await this.prisma.bookBoxCollection.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        slug,
        isActive: dto.isActive ?? true,
      },
      select: { ...COLLECTION_SELECT, company: { select: { slug: true } } },
    });
    if (result.company?.slug) await this.cache.del(companySlugKey(result.company.slug));
    return result;
  }

  async update(slug: string, dto: UpdateBookBoxCollectionDto) {
    const existing = await this.findBySlug(slug);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const result = await this.prisma.bookBoxCollection.update({ where: { slug }, data, select: COLLECTION_SELECT });
    if (existing.company?.slug) await this.cache.del(companySlugKey(existing.company.slug));
    return result;
  }

  async delete(slug: string) {
    const existing = await this.findBySlug(slug);
    const result = await this.prisma.bookBoxCollection.delete({ where: { slug }, select: COLLECTION_SELECT });
    if (existing.company?.slug) await this.cache.del(companySlugKey(existing.company.slug));
    return result;
  }
}
