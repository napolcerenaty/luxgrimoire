import { Injectable, NotFoundException } from '@nestjs/common';
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

  async create(dto: CreateEditionDto) {
    const book = await this.prisma.book.findUnique({ where: { id: dto.bookId } });
    if (!book) throw new NotFoundException(`Book '${dto.bookId}' not found`);

    const slug = generateSlugFromParts(
      book.title,
      dto.publisher,
      dto.publishYear?.toString(),
    );

    return this.prisma.bookEdition.create({
      data: {
        slug,
        bookId: dto.bookId,
        publisher: dto.publisher,
        publishYear: dto.publishYear,
        format: dto.format,
        coverImage: dto.coverImage,
        additionalImages: dto.additionalImages ?? [],
        isSpecial: dto.isSpecial ?? false,
        notes: dto.notes,
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

    const [data, total] = await Promise.all([
      this.prisma.bookEdition.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          book: true,
          artists: { include: { artist: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bookEdition.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
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

  async update(slug: string, dto: UpdateEditionDto) {
    await this.findBySlug(slug);
    return this.prisma.bookEdition.update({ where: { slug }, data: dto });
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.bookEdition.delete({ where: { slug } });
  }

  async addArtist(slug: string, dto: AddArtistDto) {
    const edition = await this.findBySlug(slug);
    return this.prisma.artistContribution.upsert({
      where: { editionId_artistId: { editionId: edition.id, artistId: dto.artistId } },
      create: {
        editionId: edition.id,
        artistId: dto.artistId,
        role: dto.role ?? 'cover',
      },
      update: { role: dto.role ?? 'cover' },
    });
  }

  async removeArtist(slug: string, artistId: string) {
    const edition = await this.findBySlug(slug);
    return this.prisma.artistContribution.delete({
      where: { editionId_artistId: { editionId: edition.id, artistId } },
    });
  }
}
