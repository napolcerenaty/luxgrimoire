import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateEditionDto,
  UpdateEditionDto,
  AddArtistDto,
  EditionQueryDto,
} from './editions.dto';
import { generateSlugFromParts } from '../../common/utils/slug.util';

@Injectable()
export class EditionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEditionDto, opts?: { verifiedAt?: Date | null; submittedByUserId?: string }) {
    const book = await this.prisma.book.findUnique({ where: { id: dto.bookId } });
    if (!book) throw new NotFoundException(`Book '${dto.bookId}' not found`);

    const slug = generateSlugFromParts(
      book.title,
      dto.editionName ?? dto.publisher,
      dto.publishYear?.toString(),
    );

    return this.prisma.bookEdition.create({
      data: {
        slug,
        bookId: dto.bookId,
        editionName: dto.editionName,
        publisher: dto.publisher,
        language: dto.language,
        alternativeTitle: dto.alternativeTitle,
        publishYear: dto.publishYear,
        format: dto.format,
        coverImage: dto.coverImage,
        additionalImages: dto.additionalImages ?? [],
        isSpecial: dto.isSpecial ?? false,
        basePrice: dto.basePrice ? dto.basePrice : undefined,
        currency: dto.currency,
        firstAccessDate: dto.firstAccessDate,
        earlyAccessDate: dto.earlyAccessDate,
        generalSaleDate: dto.generalSaleDate,
        bookBoxCompanyId: dto.bookBoxCompanyId,
        bookBoxCompanyCustomName: dto.bookBoxCompanyCustomName,
        subscriptionId: dto.subscriptionId,
        subscriptionMonthId: dto.subscriptionMonthId,
        collectionId: dto.collectionId,
        features: dto.features ?? [],
        verifiedAt: opts?.verifiedAt !== undefined ? opts.verifiedAt : new Date(),
        submittedByUserId: opts?.submittedByUserId,
      },
    });
  }

  async findAll(query: EditionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.bookId) {
      where.bookId = query.bookId;
    } else if (query.bookSlug) {
      where.book = { slug: query.bookSlug };
    }
    if (query.companyId) where.bookBoxCompanyId = query.companyId;
    if (query.subscriptionId) where.subscriptionId = query.subscriptionId;
    if (query.language) where.language = query.language;
    if (query.format) where.format = query.format;
    if (query.needsVerification === true) where.verifiedAt = null;
    if (query.search) {
      const s = query.search;
      where.OR = [
        { book: { title: { contains: s, mode: 'insensitive' } } },
        { book: { authors: { some: { author: { name: { contains: s, mode: 'insensitive' } } } } } },
        { publisher: { contains: s, mode: 'insensitive' } },
        { editionName: { contains: s, mode: 'insensitive' } },
        { bookBoxCompany: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.bookEdition.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          book: { include: { authors: { include: { author: true } } } },
          artists: { include: { artist: true } },
          bookBoxCompany: { select: { name: true, slug: true } },
          collection: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bookEdition.count({ where }),
    ]);

    const flatData = data.map((e) => ({
      ...e,
      book: e.book
        ? { ...e.book, authors: e.book.authors.map((ba: { author: unknown }) => ba.author) }
        : e.book,
    }));

    return { data: flatData, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string) {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug },
      include: {
        book: { include: { authors: { include: { author: true } } } },
        artists: { include: { artist: true } },
      },
    });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    return edition;
  }

  async verify(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.bookEdition.update({
      where: { slug },
      data: { verifiedAt: new Date() },
    });
  }

  async update(slug: string, dto: UpdateEditionDto) {
    await this.findBySlug(slug);
    return this.prisma.bookEdition.update({ where: { slug }, data: dto });
  }

  async delete(slug: string, userRole?: string) {
    const edition = await this.findBySlug(slug);
    const collectionCount = await this.prisma.userBookEntry.count({ where: { editionId: edition.id } });
    if (userRole === 'COMPANY_MANAGER') {
      if (collectionCount > 0) {
        throw new ConflictException('Cannot delete edition that is already in users\' collections');
      }
    } else if (userRole && userRole !== 'ADMIN' && userRole !== 'MODERATOR') {
      throw new ForbiddenException('Only admins can delete editions');
    }
    return this.prisma.bookEdition.delete({ where: { slug } });
  }

  async addArtist(slug: string, dto: AddArtistDto) {
    const edition = await this.findBySlug(slug);
    return this.prisma.artistContribution.upsert({
      where: { editionId_artistId: { editionId: edition.id, artistId: dto.artistId } },
      create: {
        editionId: edition.id,
        artistId: dto.artistId,
        artistName: dto.artistName,
        role: dto.role ?? 'cover',
      },
      update: { role: dto.role ?? 'cover', artistName: dto.artistName },
    });
  }

  async removeArtist(slug: string, artistId: string) {
    const edition = await this.findBySlug(slug);
    return this.prisma.artistContribution.delete({
      where: { editionId_artistId: { editionId: edition.id, artistId } },
    });
  }
}
