import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { CreateArtistDto, UpdateArtistDto, ArtistQueryDto } from './artists.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';

const ARTIST_SLUG_TTL = 24 * 60 * 60 * 1000;
const ARTIST_CONTRIBUTIONS_TTL = 60 * 60 * 1000;

const artistProfileKey = (slug: string) => `artists:slug:${slug}`;
const artistContributionsKey = (slug: string) => `artists:slug:${slug}:contributions`;

@Injectable()
export class ArtistsService {
  private readonly logger = new Logger(ArtistsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly uploadService: UploadService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
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
    const cached = await this.cache.get(artistProfileKey(slug));
    if (cached) return cached as Awaited<ReturnType<typeof this._fetchArtistProfile>>;
    const artist = await this._fetchArtistProfile(slug);
    await this.cache.set(artistProfileKey(slug), artist, ARTIST_SLUG_TTL);
    return artist;
  }

  private async _fetchArtistProfile(slug: string) {
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
      },
    });
    if (!artist) throw new NotFoundException(`Artist '${slug}' not found`);
    return artist;
  }

  async findContributions(slug: string) {
    const cached = await this.cache.get(artistContributionsKey(slug));
    if (cached) return cached as Awaited<ReturnType<typeof this._fetchArtistContributions>>;
    await this.findBySlug(slug); // ensure artist exists
    const contributions = await this._fetchArtistContributions(slug);
    await this.cache.set(artistContributionsKey(slug), contributions, ARTIST_CONTRIBUTIONS_TTL);
    return contributions;
  }

  private async _fetchArtistContributions(slug: string) {
    const artist = await this.prisma.artist.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!artist) throw new NotFoundException(`Artist '${slug}' not found`);

    const contributions = await this.prisma.artistContribution.findMany({
      where: { artistId: artist.id },
      select: {
        role: true,
        edition: {
          select: {
            id: true,
            slug: true,
            additionalImages: true,
            bookBoxCompany: { select: { name: true, brandColors: true } },
            communityImages: {
              where: { status: 'APPROVED' },
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    });

    return contributions.map((contrib) => {
      const { communityImages, ...editionRest } = contrib.edition as typeof contrib.edition & { communityImages: Array<{ url: string }> };
      return {
        role: contrib.role,
        edition: {
          ...editionRest,
          communityPhotoCover: (contrib.edition.additionalImages as string[]).length === 0
            ? (communityImages?.[0]?.url ?? null)
            : null,
        },
      };
    });
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
    const existing = await this.findBySlug(slug);
    if (dto.photoUrl !== undefined && dto.photoUrl !== existing.photoUrl) {
      await this.uploadService.deleteImages([existing.photoUrl]);
    }
    const artist = await this.prisma.artist.update({ where: { slug }, data: dto });
    await this.indexArtist(artist);
    await Promise.all([
      this.cache.del(artistProfileKey(slug)),
      this.cache.del(artistContributionsKey(slug)),
    ]);
    return artist;
  }

  async delete(slug: string) {
    const artist = await this.findBySlug(slug);
    await this.uploadService.deleteImages([artist.photoUrl]);
    await this.typesense.deleteDocument('artists', artist.id);
    await Promise.all([
      this.cache.del(artistProfileKey(slug)),
      this.cache.del(artistContributionsKey(slug)),
    ]);
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
