import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateBookBoxCollectionDto,
  UpdateBookBoxCollectionDto,
  BookBoxCollectionQueryDto,
} from './book-box-collections.dto';
import { generateSlug } from '../../common/utils/slug.util';

const COLLECTION_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  coverImage: true,
  photoCredit: true,
  isActive: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, slug: true, name: true, logoUrl: true } },
  _count: { select: { editions: true } },
};

@Injectable()
export class BookBoxCollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: BookBoxCollectionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const skip = (page - 1) * pageSize;

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

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
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
    return this.prisma.bookBoxCollection.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        slug,
        description: dto.description,
        coverImage: dto.coverImage,
        photoCredit: dto.photoCredit,
        isActive: dto.isActive ?? true,
      },
      select: COLLECTION_SELECT,
    });
  }

  async update(slug: string, dto: UpdateBookBoxCollectionDto) {
    await this.findBySlug(slug);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.coverImage !== undefined) data.coverImage = dto.coverImage;
    if (dto.photoCredit !== undefined) data.photoCredit = dto.photoCredit;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.bookBoxCollection.update({ where: { slug }, data, select: COLLECTION_SELECT });
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.bookBoxCollection.delete({ where: { slug }, select: COLLECTION_SELECT });
  }
}
