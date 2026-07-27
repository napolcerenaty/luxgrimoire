import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { CreateArtistDto, UpdateArtistDto, ArtistQueryDto } from './artists.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { MediaAssetsService } from '../media-assets/media-assets.service';

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
    private readonly mediaAssetsService: MediaAssetsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async create(dto: CreateArtistDto) {
    const slug = generateSlug(dto.name);
    const photoAsset = dto.photoUrl ? await this.mediaAssetsService.ensureForPublicId(dto.photoUrl) : null;
    const artist = await (this.prisma.artist as any).create({
      data: {
        slug,
        name: dto.name,
        bio: dto.bio,
        photoUrl: dto.photoUrl,
        photoAssetId: photoAsset?.id ?? null,
        specialty: dto.specialty,
        website: dto.website,
        instagram: dto.instagram,
        twitter: dto.twitter,
        facebook: dto.facebook,
        tiktok: dto.tiktok,
      },
    });
    await this.indexArtist(artist);
    return {
      ...artist,
      photoAsset: photoAsset ? { id: photoAsset.id, publicId: photoAsset.publicId } : null,
      photoUrl: photoAsset?.publicId ?? artist.photoUrl,
    };
  }

  async findAll(query: ArtistQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      (this.prisma.artist as any).findMany({
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

    return {
      data: data.map((artist: any) => ({
        ...artist,
        photoUrl: artist.photoAsset?.publicId ?? artist.photoUrl,
      })),
      ...buildPageMeta(total, page, pageSize),
    };
  }

  async findBySlug(slug: string) {
    const cached = await this.cache.get(artistProfileKey(slug));
    if (cached) return cached as Awaited<ReturnType<typeof this._fetchArtistProfile>>;
    const artist = await this._fetchArtistProfile(slug);
    await this.cache.set(artistProfileKey(slug), artist, ARTIST_SLUG_TTL);
    return artist;
  }

  private async _fetchArtistProfile(slug: string) {
    const artist = await (this.prisma.artist as any).findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        bio: true,
        photoUrl: true,
        photoAsset: { select: { id: true, publicId: true } },
        specialty: true,
        website: true,
        instagram: true,
        twitter: true,
        facebook: true,
        tiktok: true,
      },
    });
    if (!artist) throw new NotFoundException(`Artist '${slug}' not found`);
    return {
      ...artist,
      photoUrl: artist.photoAsset?.publicId ?? artist.photoUrl,
    };
  }

  async findContributions(slug: string, page = 1, pageSize = 24) {
    const { skip, take, page: p, pageSize: ps } = parsePagination({ page, pageSize });
    const cacheKey = `${artistContributionsKey(slug)}:${p}:${ps}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached as any;

    const artist = await this.prisma.artist.findUnique({ where: { slug }, select: { id: true } });
    if (!artist) throw new NotFoundException(`Artist '${slug}' not found`);

    // Count & fetch distinct editions (paginated)
    const [grouped, editionIdRows] = await Promise.all([
      this.prisma.artistContribution.groupBy({
        by: ['editionId'] as any,
        where: { artistId: artist.id },
      }),
      (this.prisma.artistContribution as any).findMany({
        where: { artistId: artist.id },
        select: { editionId: true },
        distinct: ['editionId'],
        skip,
        take,
      }),
    ]);
    const total = grouped.length;
    const editionIds: string[] = editionIdRows.map((r: any) => r.editionId);

    // Fetch all contributions for those editions (to collect roles)
    const contributions = await this.prisma.artistContribution.findMany({
      where: { artistId: artist.id, editionId: { in: editionIds } },
      select: {
        role: true,
        edition: {
          select: {
            id: true,
            slug: true,
            additionalImages: true,
            variantLabel: true,
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

    // Group roles per edition, preserving paginated order
    const editionMap = new Map<string, any>();
    for (const c of contributions) {
      const ed = c.edition as any;
      const existing = editionMap.get(ed.id);
      if (existing) {
        existing.roles.push(c.role);
      } else {
        const { communityImages, ...editionRest } = ed;
        editionMap.set(ed.id, {
          roles: [c.role],
          edition: {
            ...editionRest,
            communityPhotoCover:
              (ed.additionalImages as string[]).length === 0
                ? (communityImages?.[0]?.url ?? null)
                : null,
          },
        });
      }
    }
    const data = editionIds.map((id) => editionMap.get(id)).filter(Boolean);

    const result = { data, ...buildPageMeta(total, p, ps) };
    await this.cache.set(cacheKey, result, ARTIST_CONTRIBUTIONS_TTL);
    return result;
  }

  async findCardMonths(slug: string, page = 1, pageSize = 24) {
    const { skip, take, page: p, pageSize: ps } = parsePagination({ page, pageSize });

    const artist = await this.prisma.artist.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!artist) throw new NotFoundException(`Artist '${slug}' not found`);

    const [months, total] = await Promise.all([
      (this.prisma.subscriptionMonth as any).findMany({
        where: { cardArtistId: artist.id },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          year: true,
          month: true,
          theme: true,
          coverImage: true,
          coverImageAsset: { select: { id: true, publicId: true } },
          isSpoiler: true,
          subscription: {
            select: { id: true, name: true, slug: true },
          },
        },
      }),
      (this.prisma.subscriptionMonth as any).count({ where: { cardArtistId: artist.id } }),
    ]);

    return {
      data: months.map((month: any) => ({
        ...month,
        coverImage: month.coverImageAsset?.publicId ?? month.coverImage,
      })),
      ...buildPageMeta(total, p, ps),
    };
  }

  async update(slug: string, dto: UpdateArtistDto) {
    const existing = await this.findBySlug(slug);
    if (dto.photoUrl !== undefined && dto.photoUrl !== existing.photoUrl) {
      await this.uploadService.deleteImages([existing.photoUrl]);
    }
    const data: Record<string, unknown> = { ...dto };
    if (dto.photoUrl !== undefined) {
      const photoAsset = dto.photoUrl ? await this.mediaAssetsService.ensureForPublicId(dto.photoUrl) : null;
      data.photoAssetId = photoAsset?.id ?? null;
    }
    const artist = await (this.prisma.artist as any).update({ where: { slug }, data });
    await this.indexArtist(artist);
    await Promise.all([
      this.cache.del(artistProfileKey(slug)),
      this.cache.del(artistContributionsKey(slug)),
    ]);
    const photoAsset = dto.photoUrl !== undefined && dto.photoUrl
      ? await this.mediaAssetsService.ensureForPublicId(dto.photoUrl)
      : null;
    return {
      ...artist,
      photoAsset: photoAsset ? { id: photoAsset.id, publicId: photoAsset.publicId } : null,
      photoUrl: photoAsset?.publicId ?? artist.photoUrl,
    };
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
