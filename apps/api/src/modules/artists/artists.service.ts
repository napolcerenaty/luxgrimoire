import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { CreateArtistDto, UpdateArtistDto, ArtistQueryDto } from './artists.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';

@Injectable()
export class ArtistsService {
  private readonly logger = new Logger(ArtistsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
  ) {}

  async create(dto: CreateArtistDto) {
    const slug = generateSlug(dto.name);
    const artist = await this.prisma.artist.create({
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
    await this.indexArtist(artist);
    return artist;
  }

  async findAll(query: ArtistQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

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
        select: {
          id: true,
          slug: true,
          name: true,
          photoUrl: true,
          specialty: true,
          website: true,
          instagram: true,
          twitter: true,
          facebook: true,
          tiktok: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.artist.count({ where }),
    ]);

    return { data, ...buildPageMeta(total, page, pageSize) };
  }

  async findBySlug(slug: string) {
    const artist = await this.prisma.artist.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        bio: true,
        photoUrl: true,
        specialty: true,
        website: true,
        instagram: true,
        twitter: true,
        facebook: true,
        tiktok: true,
        contributions: {
          select: {
            role: true,
            edition: {
              select: {
                id: true,
                slug: true,
                additionalImages: true,
                editionName: true,
                bookBoxCompany: { select: { name: true } },
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
    });
    if (!artist) throw new NotFoundException(`Artist '${slug}' not found`);
    return {
      ...artist,
      contributions: artist.contributions.map((c) => {
        const { communityImages, ...editionRest } = c.edition as typeof c.edition & { communityImages: Array<{ url: string }> };
        return {
          ...c,
          edition: {
            ...editionRest,
            communityPhotoCover: (c.edition.additionalImages as string[]).length === 0
              ? (communityImages?.[0]?.url ?? null)
              : null,
          },
        };
      }),
    };
  }

  async findCardMonths(slug: string) {
    const artist = await this.prisma.artist.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!artist) throw new NotFoundException(`Artist '${slug}' not found`);

    const months = await this.prisma.subscriptionMonth.findMany({
      where: { cardArtistId: artist.id },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: {
        id: true,
        year: true,
        month: true,
        theme: true,
        coverImage: true,
        isSpoiler: true,
        subscription: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
    return months;
  }

  async update(slug: string, dto: UpdateArtistDto) {
    await this.findBySlug(slug);
    const artist = await this.prisma.artist.update({ where: { slug }, data: dto });
    await this.indexArtist(artist);
    return artist;
  }

  async delete(slug: string) {
    const artist = await this.findBySlug(slug);
    await this.typesense.deleteDocument('artists', artist.id);
    return this.prisma.artist.delete({ where: { slug } });
  }

  private async indexArtist(artist: { id: string; name: string; slug: string; specialty?: string | null }): Promise<void> {
    try {
      await this.typesense.upsertDocument('artists', {
        id: artist.id,
        name: artist.name,
        slug: artist.slug,
        specialty: artist.specialty ?? '',
      });
    } catch (err) {
      this.logger.error(`Failed to index artist ${artist.id}`, err);
    }
  }
}
