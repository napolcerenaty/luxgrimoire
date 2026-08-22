import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { CreateArtistDto, UpdateArtistDto, ArtistQueryDto } from './artists.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { EditionsService } from '../editions/editions.service';

export type StudioSortDirection = 'newest' | 'oldest';

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
    private readonly editionsService: EditionsService,
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
        isCollective: dto.isCollective ?? false,
        studioId: dto.studioId || null,
      },
    });
    await this.indexArtist(artist);
    return {
      ...artist,
      photoAsset: photoAsset ? { id: photoAsset.id, publicId: photoAsset.publicId } : null,
      photoUrl: photoAsset?.publicId ?? artist.photoUrl,
    };
  }

  /**
   * Builds the OR clauses for an artist name search. Handles the common case where source text
   * (and the AI parser's faithful extraction of it) credits an artist alongside a handle in one
   * string, e.g. "Maggie @the.butterfly.bookclub" or "Jan Kowalski @jankowalskiart" — a plain
   * `name contains <raw query>` match finds nothing for that, since the stored artist record
   * doesn't contain the full compound string.
   *
   * Checked against the actual data (2026-08-22): 990 of 1016 artist rows have their handle
   * AS the `name` field itself (e.g. name = "@jankowalskiart") — a separate personal name is
   * essentially never stored. The `instagram` field is populated on only 2 rows, and `studioId`
   * on only 1. So the dominant, highest-value match by far is the simplest one: does an existing
   * artist's `name` contain the bare handle, full stop — independent of whether a name portion
   * was also present in the query. That's added unconditionally whenever an @handle is found.
   *
   * When the query ALSO has a name portion, two more (much rarer in today's data, but cheap and
   * harmless to keep) clauses are tried: (a) own name contains the name portion AND own
   * `instagram` contains the handle — the rare row where that field IS populated separately;
   * (b) own name contains the name portion AND the artist's STUDIO's name/instagram contains the
   * handle — a studio member credited alongside their studio's handle, where the member's own
   * `name` is a real display name distinct from the studio's.
   *
   * If nothing matches — the handle isn't on file anywhere — the search legitimately finds
   * nothing and the admin's "+ Create" path creates a new artist, same as before any of this.
   * This only widens matching for handles that already exist; it never invents a match, and it
   * never creates or links a studio.
   */
  private buildArtistSearchClauses(rawSearch: string): Record<string, unknown>[] {
    const raw = rawSearch.trim();
    const handleMatches = raw.match(/@[\w.]+/g) ?? [];
    const namePart = raw.replace(/@[\w.]+/g, '').trim();
    const [firstHandle] = handleMatches;

    const clauses: Record<string, unknown>[] = [{ name: { contains: raw, mode: 'insensitive' } }];
    if (!firstHandle) return clauses;

    const handle = firstHandle.replace(/^@/, '');
    clauses.push({ name: { contains: handle, mode: 'insensitive' } });

    if (namePart) {
      clauses.push({
        AND: [
          { name: { contains: namePart, mode: 'insensitive' } },
          { instagram: { contains: handle, mode: 'insensitive' } },
        ],
      });
      clauses.push({
        AND: [
          { name: { contains: namePart, mode: 'insensitive' } },
          {
            studio: {
              OR: [
                { name: { contains: handle, mode: 'insensitive' } },
                { instagram: { contains: handle, mode: 'insensitive' } },
              ],
            },
          },
        ],
      });
    }
    return clauses;
  }

  async findAll(query: ArtistQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.OR = this.buildArtistSearchClauses(query.search);
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
          isCollective: true,
          studioId: true,
          studio: { select: { id: true, name: true, slug: true, instagram: true } },
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
        isCollective: true,
        studioId: true,
        studio: { select: { id: true, name: true, slug: true, instagram: true, photoUrl: true } },
        studioMembers: { select: { id: true, name: true, slug: true, photoUrl: true } },
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

  /**
   * Resolves which artist ids a studio's unified view should query: the studio itself (it can
   * carry its own direct ArtistContribution/cardArtist credits, independent of any member) plus
   * every studioMember, optionally narrowed to a single one of those ids via `filterArtistId`.
   */
  private async resolveStudioScope(studioSlug: string, filterArtistId?: string): Promise<string[]> {
    const studio = await (this.prisma.artist as any).findUnique({
      where: { slug: studioSlug },
      select: { id: true, studioMembers: { select: { id: true } } },
    });
    if (!studio) throw new NotFoundException(`Artist '${studioSlug}' not found`);

    const allIds: string[] = [studio.id, ...studio.studioMembers.map((m: { id: string }) => m.id)];
    if (filterArtistId && !allIds.includes(filterArtistId)) {
      throw new BadRequestException(`'${filterArtistId}' is not part of studio '${studioSlug}'`);
    }
    return filterArtistId ? [filterArtistId] : allIds;
  }

  /**
   * Unified Book Editions feed across a studio and all its members (see resolveStudioScope).
   * Editions credited to more than one of those artists are merged into a single result with
   * one attribution entry per credit, instead of duplicated per artist.
   *
   * Sort is by resolved release date (EditionsService.resolveEditionSaleDates — live-computed,
   * never copied, so a later-linked sale announcement is reflected automatically), not
   * createdAt. Because that resolution isn't a plain DB column, the full ordered edition-id
   * list is computed once and cached (not just the current page), then sliced per page.
   */
  async findStudioContributions(
    studioSlug: string,
    filterArtistId: string | undefined,
    sort: StudioSortDirection,
    page = 1,
    pageSize = 24,
  ) {
    const { skip, take, page: p, pageSize: ps } = parsePagination({ page, pageSize });
    const scopedIds = await this.resolveStudioScope(studioSlug, filterArtistId);

    const cacheKey = `${artistContributionsKey(studioSlug)}:studio:${filterArtistId ?? 'all'}:${sort}`;
    let orderedEditionIds = await this.cache.get<string[]>(cacheKey);

    if (!orderedEditionIds) {
      const rows = await (this.prisma.artistContribution as any).findMany({
        where: { artistId: { in: scopedIds } },
        select: { editionId: true },
        distinct: ['editionId'],
      });
      const editionIds: string[] = rows.map((r: any) => r.editionId);

      const resolvedDates = await this.editionsService.resolveEditionSaleDates(editionIds);
      const missing = editionIds.filter((id) => !resolvedDates.get(id));
      const fallbackRows = missing.length
        ? await this.prisma.bookEdition.findMany({
            where: { id: { in: missing } },
            select: { id: true, createdAt: true },
          })
        : [];
      const fallbackByEdition = new Map(fallbackRows.map((r) => [r.id, r.createdAt]));
      const dateFor = (id: string): Date => resolvedDates.get(id)?.date ?? fallbackByEdition.get(id) ?? new Date(0);

      orderedEditionIds = [...editionIds].sort((a, b) => {
        const diff = dateFor(a).getTime() - dateFor(b).getTime();
        return sort === 'oldest' ? diff : -diff;
      });
      await this.cache.set(cacheKey, orderedEditionIds, ARTIST_CONTRIBUTIONS_TTL);
    }

    const total = orderedEditionIds.length;
    const pageIds = orderedEditionIds.slice(skip, skip + take);
    if (pageIds.length === 0) {
      return { data: [], ...buildPageMeta(total, p, ps) };
    }

    const contributions = await this.prisma.artistContribution.findMany({
      where: { artistId: { in: scopedIds }, editionId: { in: pageIds } },
      select: {
        role: true,
        artistId: true,
        artist: { select: { id: true, name: true, slug: true } },
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

    const editionMap = new Map<string, any>();
    for (const c of contributions) {
      const ed = c.edition as any;
      let existing = editionMap.get(ed.id);
      if (!existing) {
        const { communityImages, ...editionRest } = ed;
        existing = {
          attributions: [] as { artistId: string; artistName: string; artistSlug: string; role: string }[],
          edition: {
            ...editionRest,
            communityPhotoCover:
              (ed.additionalImages as string[]).length === 0 ? (communityImages?.[0]?.url ?? null) : null,
          },
        };
        editionMap.set(ed.id, existing);
      }
      existing.attributions.push({
        artistId: c.artistId,
        artistName: c.artist.name,
        artistSlug: c.artist.slug,
        role: c.role,
      });
    }
    const data = pageIds.map((id) => editionMap.get(id)).filter(Boolean);

    return { data, ...buildPageMeta(total, p, ps) };
  }

  /**
   * Unified Card Months feed across a studio and all its members. cardArtistId is a single FK
   * per month, so unlike findStudioContributions there's no cross-artist dedup to do — a month
   * can only ever be credited to one artist. No sort toggle: year/month desc is already the
   * meaningful chronological order.
   */
  async findStudioCardMonths(
    studioSlug: string,
    filterArtistId: string | undefined,
    page = 1,
    pageSize = 24,
  ) {
    const { skip, take, page: p, pageSize: ps } = parsePagination({ page, pageSize });
    const scopedIds = await this.resolveStudioScope(studioSlug, filterArtistId);

    const [months, total] = await Promise.all([
      (this.prisma.subscriptionMonth as any).findMany({
        where: { cardArtistId: { in: scopedIds } },
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
          subscription: { select: { id: true, name: true, slug: true } },
          cardArtist: { select: { id: true, name: true, slug: true } },
        },
      }),
      (this.prisma.subscriptionMonth as any).count({ where: { cardArtistId: { in: scopedIds } } }),
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
    if (dto.studioId && dto.studioId === existing.id) {
      throw new BadRequestException('An artist cannot be linked to themselves as a studio');
    }
    const data: Record<string, unknown> = { ...dto };
    if (dto.studioId !== undefined) {
      data.studioId = dto.studioId || null;
    }
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
