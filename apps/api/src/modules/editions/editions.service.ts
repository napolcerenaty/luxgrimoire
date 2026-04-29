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
    );

    return this.prisma.bookEdition.create({
      data: {
        slug,
        bookId: dto.bookId,
        editionName: dto.editionName,
        publisher: dto.publisher,
        language: dto.language,
        alternativeTitle: dto.alternativeTitle,
        additionalImages:dto.additionalImages ?? [],
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
        photoCredit: dto.photoCredit,
        verifiedAt:opts?.verifiedAt !== undefined ? opts.verifiedAt : new Date(),
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
        select: {
          id: true,
          slug: true,
          publisher: true,
          editionName: true,
          bookBoxCompanyCustomName: true,
          additionalImages: true,
          isSpecial: true,
          verifiedAt: true,
          createdAt: true,
          book: {
            select: {
              id: true,
              slug: true,
              title: true,
              seriesName: true,
              volumeNumber: true,
              authors: { select: { author: { select: { id: true, name: true, slug: true } } } },
            },
          },
          artists: { select: { id: true, role: true, artistName: true, artist: { select: { id: true, name: true, slug: true } } } },
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
        book: {
          select: {
            id: true, slug: true, title: true, altTitle: true,
            seriesName: true, volumeNumber: true, coverImage: true, language: true,
            authors: {
              select: {
                author: { select: { id: true, name: true, slug: true, nationality: true } },
              },
            },
          },
        },
        artists: {
          select: {
            id: true, role: true, artistName: true,
            artist: { select: { id: true, name: true, slug: true } },
          },
        },
        bookBoxCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
        collection: { select: { id: true, slug: true, name: true } },
        monthBooks: {
          select: {
            month: {
              select: {
                id: true, year: true, month: true, theme: true,
                subscription: { select: { id: true, slug: true, name: true } },
                series: { select: { id: true, slug: true, name: true } },
              },
            },
          },
        },
        saleEditions: {
          select: {
            announcement: { select: { id: true, title: true, isBundle: true } },
          },
        },
      },
    });
    if (!edition) throw new NotFoundException(`Edition '${slug}' not found`);
    // Flatten authors on nested book
    return {
      ...edition,
      book: edition.book
        ? { ...edition.book, authors: edition.book.authors.map((ba: { author: unknown }) => ba.author) }
        : edition.book,
    };
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

    // Build a plain update object — never pass a class instance directly to Prisma
    const data: Record<string, unknown> = {};
    if (dto.editionName !== undefined) data.editionName = dto.editionName;
    if (dto.publisher !== undefined) data.publisher = dto.publisher;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.alternativeTitle !== undefined) data.alternativeTitle = dto.alternativeTitle;
    if (dto.additionalImages !== undefined) data.additionalImages = dto.additionalImages;
    if (dto.isSpecial !== undefined) data.isSpecial = dto.isSpecial;
    if (dto.basePrice !== undefined) {
      if (dto.basePrice) {
        // Normalize comma decimal separator (e.g. "12,99" → "12.99")
        data.basePrice = dto.basePrice.replace(',', '.');
      } else {
        data.basePrice = null;
      }
    }
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.firstAccessDate !== undefined) data.firstAccessDate = dto.firstAccessDate;
    if (dto.earlyAccessDate !== undefined) data.earlyAccessDate = dto.earlyAccessDate;
    if (dto.generalSaleDate !== undefined) data.generalSaleDate = dto.generalSaleDate;
    if (dto.bookBoxCompanyId !== undefined) data.bookBoxCompanyId = dto.bookBoxCompanyId;
    if (dto.bookBoxCompanyCustomName !== undefined) data.bookBoxCompanyCustomName = dto.bookBoxCompanyCustomName;
    if (dto.subscriptionId !== undefined) data.subscriptionId = dto.subscriptionId;
    if (dto.subscriptionMonthId !== undefined) data.subscriptionMonthId = dto.subscriptionMonthId;
    if (dto.collectionId !== undefined) data.collectionId = dto.collectionId;
    if (dto.features !== undefined) data.features = dto.features;
    if (dto.photoCredit !== undefined) data.photoCredit = dto.photoCredit;

    return this.prisma.bookEdition.update({ where: { slug }, data });
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
    const role = dto.role ?? 'cover';
    return this.prisma.artistContribution.upsert({
      where: { editionId_artistId_role: { editionId: edition.id, artistId: dto.artistId, role } },
      create: {
        editionId: edition.id,
        artistId: dto.artistId,
        artistName: dto.artistName,
        role,
      },
      update: { artistName: dto.artistName },
    });
  }

  async removeArtist(slug: string, artistId: string) {
    const edition = await this.findBySlug(slug);
    return this.prisma.artistContribution.deleteMany({
      where: { editionId: edition.id, artistId },
    });
  }
}
