import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateArtistDto, UpdateArtistDto, ArtistQueryDto } from './artists.dto';
import { generateSlug } from '../../common/utils/slug.util';

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateArtistDto) {
    const slug = generateSlug(dto.name);
    return this.prisma.artist.create({
      data: {
        slug,
        name: dto.name,
        bio: dto.bio,
        photoUrl: dto.photoUrl,
        specialty: dto.specialty,
        website: dto.website,
        instagram: dto.instagram,
        twitter: dto.twitter,
        facebook: dto.facebook,
        tiktok: dto.tiktok,
      },
    });
  }

  async findAll(query: ArtistQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.artist.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.artist.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string) {
    const artist = await this.prisma.artist.findUnique({
      where: { slug },
      include: {
        contributions: {
          include: {
            edition: {
              include: {
                book: { include: { authors: { include: { author: true } } } },
                bookBoxCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
              },
            },
          },
        },
      },
    });
    if (!artist) throw new NotFoundException(`Artist '${slug}' not found`);

    // Flatten book.authors join-table rows → flat ApiAuthor[]
    const flatContributions = artist.contributions.map((c) => ({
      ...c,
      edition: {
        ...c.edition,
        book: c.edition.book
          ? {
              ...c.edition.book,
              authors: c.edition.book.authors.map(
                (ba: { author: unknown }) => ba.author,
              ),
            }
          : c.edition.book,
      },
    }));

    return { ...artist, contributions: flatContributions };
  }

  async update(slug: string, dto: UpdateArtistDto) {
    await this.findBySlug(slug);
    return this.prisma.artist.update({ where: { slug }, data: dto });
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.artist.delete({ where: { slug } });
  }
}
