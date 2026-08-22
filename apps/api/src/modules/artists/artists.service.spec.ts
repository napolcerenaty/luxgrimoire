/**
 * Unit tests for ArtistsService, focused on the artist/studio-collective attribution feature:
 * an individual artist (e.g. "Maggie") can be linked via `studioId` to another Artist row
 * representing the studio/collective they publish under (e.g. "@TheStudio_artists"), instead
 * of the old behavior of discarding the person's name and saving only the studio handle.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { EditionsService } from '../editions/editions.service';
import { ArtistsService } from './artists.service';

describe('ArtistsService', () => {
  let service: ArtistsService;
  let prisma: DeepMockProxy<PrismaService>;
  let editionsService: DeepMockProxy<EditionsService>;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    editionsService = mockDeep<EditionsService>();
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    service = new ArtistsService(prisma, typesense, uploadService, mediaAssetsService, editionsService, cache as any);
  });

  describe('create', () => {
    it('defaults isCollective to false and studioId to null when not provided', async () => {
      (prisma.artist.create as jest.Mock).mockResolvedValue({
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', photoUrl: null,
      });

      await service.create({ name: 'Maggie' } as any);

      expect(prisma.artist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isCollective: false, studioId: null }),
      });
    });

    it('links to a studio when studioId is provided', async () => {
      (prisma.artist.create as jest.Mock).mockResolvedValue({
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', photoUrl: null,
      });

      await service.create({ name: 'Maggie', studioId: 'studio-1' } as any);

      expect(prisma.artist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ studioId: 'studio-1' }),
      });
    });

    it('creates a studio/collective row when isCollective is true', async () => {
      (prisma.artist.create as jest.Mock).mockResolvedValue({
        id: 'studio-1', slug: 'the-studio-artists-abcd1234', name: '@TheStudio_artists', photoUrl: null,
      });

      await service.create({ name: '@TheStudio_artists', isCollective: true } as any);

      expect(prisma.artist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isCollective: true }),
      });
    });

    it('treats an empty-string studioId the same as omitted (no link)', async () => {
      (prisma.artist.create as jest.Mock).mockResolvedValue({
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', photoUrl: null,
      });

      await service.create({ name: 'Maggie', studioId: '' } as any);

      expect(prisma.artist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ studioId: null }),
      });
    });
  });

  describe('update', () => {
    function mockExisting(overrides: Record<string, unknown> = {}) {
      const artist = {
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', bio: null, photoUrl: null,
        photoAsset: null, specialty: null, website: null, instagram: null, twitter: null,
        facebook: null, tiktok: null, isCollective: false, studioId: null, studio: null,
        studioMembers: [], ...overrides,
      };
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue(artist);
      return artist;
    }

    it('rejects linking an artist to itself as its own studio', async () => {
      mockExisting();

      await expect(
        service.update('maggie-abcd1234', { studioId: 'artist-1' } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.artist.update).not.toHaveBeenCalled();
    });

    it('links an existing artist to a different studio', async () => {
      mockExisting();
      (prisma.artist.update as jest.Mock).mockResolvedValue({
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', photoUrl: null,
      });

      await service.update('maggie-abcd1234', { studioId: 'studio-1' } as any);

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { slug: 'maggie-abcd1234' },
        data: expect.objectContaining({ studioId: 'studio-1' }),
      });
    });

    it('clears the studio link when studioId is set to an empty string', async () => {
      mockExisting({ studioId: 'studio-1', studio: { id: 'studio-1', name: '@TheStudio_artists', slug: 'the-studio-artists' } });
      (prisma.artist.update as jest.Mock).mockResolvedValue({
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', photoUrl: null,
      });

      await service.update('maggie-abcd1234', { studioId: '' } as any);

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { slug: 'maggie-abcd1234' },
        data: expect.objectContaining({ studioId: null }),
      });
    });

    it('leaves the studio link untouched when studioId is not part of the update', async () => {
      mockExisting({ studioId: 'studio-1' });
      (prisma.artist.update as jest.Mock).mockResolvedValue({
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie Renamed', photoUrl: null,
      });

      await service.update('maggie-abcd1234', { name: 'Maggie Renamed' } as any);

      const data = (prisma.artist.update as jest.Mock).mock.calls[0][0].data;
      expect(data).not.toHaveProperty('studioId');
    });

    it('invalidates the cached profile and contributions for the artist', async () => {
      mockExisting();
      (prisma.artist.update as jest.Mock).mockResolvedValue({
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', photoUrl: null,
      });

      await service.update('maggie-abcd1234', { isCollective: true } as any);

      expect(cache.del).toHaveBeenCalledWith('artists:slug:maggie-abcd1234');
      expect(cache.del).toHaveBeenCalledWith('artists:slug:maggie-abcd1234:contributions');
    });
  });

  describe('findBySlug', () => {
    it('throws NotFoundException when the artist does not exist', async () => {
      cache.get.mockResolvedValue(undefined);
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findBySlug('missing-artist')).rejects.toThrow(NotFoundException);
    });

    it('returns the studio link and studio members for a linked artist', async () => {
      cache.get.mockResolvedValue(undefined);
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', bio: null, photoUrl: null,
        photoAsset: null, specialty: null, website: null, instagram: null, twitter: null,
        facebook: null, tiktok: null, isCollective: false, studioId: 'studio-1',
        studio: { id: 'studio-1', name: '@TheStudio_artists', slug: 'the-studio-artists', instagram: 'thestudio_artists', photoUrl: null },
        studioMembers: [],
      });

      const result = await service.findBySlug('maggie-abcd1234');

      expect(result).toEqual(expect.objectContaining({
        studioId: 'studio-1',
        studio: expect.objectContaining({ name: '@TheStudio_artists' }),
      }));
    });

    it('returns studioMembers for a studio/collective artist', async () => {
      cache.get.mockResolvedValue(undefined);
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        id: 'studio-1', slug: 'the-studio-artists', name: '@TheStudio_artists', bio: null, photoUrl: null,
        photoAsset: null, specialty: null, website: null, instagram: null, twitter: null,
        facebook: null, tiktok: null, isCollective: true, studioId: null, studio: null,
        studioMembers: [{ id: 'artist-1', name: 'Maggie', slug: 'maggie-abcd1234', photoUrl: null }],
      });

      const result = await service.findBySlug('the-studio-artists');

      expect((result as any).isCollective).toBe(true);
      expect((result as any).studioMembers).toEqual([
        { id: 'artist-1', name: 'Maggie', slug: 'maggie-abcd1234', photoUrl: null },
      ]);
    });

    it('serves from cache without querying prisma on a cache hit', async () => {
      const cached = { id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', studioId: null };
      cache.get.mockResolvedValue(cached);

      const result = await service.findBySlug('maggie-abcd1234');

      expect(result).toBe(cached);
      expect(prisma.artist.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('passes through studio/isCollective fields for each artist in the list', async () => {
      (prisma.artist.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'artist-1', slug: 'maggie-abcd1234', name: 'Maggie', photoUrl: null, photoAsset: null,
          specialty: null, website: null, instagram: null, twitter: null, facebook: null, tiktok: null,
          isCollective: false, studioId: 'studio-1',
          studio: { id: 'studio-1', name: '@TheStudio_artists', slug: 'the-studio-artists', instagram: null },
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);
      (prisma.artist.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({} as any);

      expect(result.data[0]).toEqual(expect.objectContaining({
        studioId: 'studio-1',
        studio: expect.objectContaining({ name: '@TheStudio_artists' }),
      }));
    });
  });

  describe('findStudioContributions', () => {
    function mockStudio(memberIds: string[] = ['member-1']) {
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        id: 'studio-1',
        studioMembers: memberIds.map((id) => ({ id })),
      });
    }

    function contributionRow(editionId: string, artistId: string, artistName: string, artistSlug: string, role: string) {
      return {
        role,
        artistId,
        artist: { id: artistId, name: artistName, slug: artistSlug },
        edition: {
          id: editionId, slug: `${editionId}-slug`, additionalImages: [], variantLabel: null,
          bookBoxCompany: null, communityImages: [],
        },
      };
    }

    beforeEach(() => {
      cache.get.mockResolvedValue(undefined);
    });

    it('scopes the query to the studio itself plus every member, not just the members', async () => {
      mockStudio(['member-1', 'member-2']);
      (prisma.artistContribution.findMany as jest.Mock).mockResolvedValueOnce([]);
      editionsService.resolveEditionSaleDates.mockResolvedValue(new Map());

      await service.findStudioContributions('the-studio', undefined, 'newest', 1, 24);

      const distinctCallArgs = (prisma.artistContribution.findMany as jest.Mock).mock.calls[0][0];
      expect(distinctCallArgs.where.artistId.in).toEqual(['studio-1', 'member-1', 'member-2']);
    });

    it('rejects an artistId filter that does not belong to the studio', async () => {
      mockStudio(['member-1']);

      await expect(
        service.findStudioContributions('the-studio', 'someone-elses-id', 'newest', 1, 24),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the studio slug does not exist', async () => {
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findStudioContributions('missing-studio', undefined, 'newest', 1, 24),
      ).rejects.toThrow(NotFoundException);
    });

    it('narrows the query to a single member when artistId is provided', async () => {
      mockStudio(['member-1', 'member-2']);
      (prisma.artistContribution.findMany as jest.Mock).mockResolvedValueOnce([]);
      editionsService.resolveEditionSaleDates.mockResolvedValue(new Map());

      await service.findStudioContributions('the-studio', 'member-1', 'newest', 1, 24);

      const distinctCallArgs = (prisma.artistContribution.findMany as jest.Mock).mock.calls[0][0];
      expect(distinctCallArgs.where.artistId.in).toEqual(['member-1']);
    });

    it('merges an edition credited to both the studio directly and a member into one result', async () => {
      mockStudio(['member-1']);
      (prisma.artistContribution.findMany as jest.Mock)
        .mockResolvedValueOnce([{ editionId: 'edition-1' }])
        .mockResolvedValueOnce([
          contributionRow('edition-1', 'studio-1', 'The Studio', 'the-studio', 'cover'),
          contributionRow('edition-1', 'member-1', 'Jane', 'jane', 'colorist'),
        ]);
      editionsService.resolveEditionSaleDates.mockResolvedValue(
        new Map([['edition-1', { label: 'General Sale', date: new Date('2026-01-01') }]]),
      );

      const result = await service.findStudioContributions('the-studio', undefined, 'newest', 1, 24);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].attributions).toEqual([
        { artistId: 'studio-1', artistName: 'The Studio', artistSlug: 'the-studio', role: 'cover' },
        { artistId: 'member-1', artistName: 'Jane', artistSlug: 'jane', role: 'colorist' },
      ]);
    });

    it('merges an edition credited to two different members into one result', async () => {
      mockStudio(['member-1', 'member-2']);
      (prisma.artistContribution.findMany as jest.Mock)
        .mockResolvedValueOnce([{ editionId: 'edition-1' }])
        .mockResolvedValueOnce([
          contributionRow('edition-1', 'member-1', 'Jane', 'jane', 'cover'),
          contributionRow('edition-1', 'member-2', 'Alex', 'alex', 'interior'),
        ]);
      editionsService.resolveEditionSaleDates.mockResolvedValue(
        new Map([['edition-1', { label: 'General Sale', date: new Date('2026-01-01') }]]),
      );

      const result = await service.findStudioContributions('the-studio', undefined, 'newest', 1, 24);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].attributions.map((a: any) => a.artistId)).toEqual(['member-1', 'member-2']);
    });

    it('sorts editions by resolved release date, newest first', async () => {
      mockStudio(['member-1']);
      (prisma.artistContribution.findMany as jest.Mock)
        .mockResolvedValueOnce([{ editionId: 'older' }, { editionId: 'newer' }])
        .mockResolvedValueOnce([]);
      editionsService.resolveEditionSaleDates.mockResolvedValue(new Map([
        ['older', { label: 'General Sale', date: new Date('2020-01-01') }],
        ['newer', { label: 'General Sale', date: new Date('2026-01-01') }],
      ]));

      await service.findStudioContributions('the-studio', undefined, 'newest', 1, 24);

      const cachedOrder = cache.set.mock.calls[0][1];
      expect(cachedOrder).toEqual(['newer', 'older']);
    });

    it('sorts editions by resolved release date, oldest first', async () => {
      mockStudio(['member-1']);
      (prisma.artistContribution.findMany as jest.Mock)
        .mockResolvedValueOnce([{ editionId: 'older' }, { editionId: 'newer' }])
        .mockResolvedValueOnce([]);
      editionsService.resolveEditionSaleDates.mockResolvedValue(new Map([
        ['older', { label: 'General Sale', date: new Date('2020-01-01') }],
        ['newer', { label: 'General Sale', date: new Date('2026-01-01') }],
      ]));

      await service.findStudioContributions('the-studio', undefined, 'oldest', 1, 24);

      const cachedOrder = cache.set.mock.calls[0][1];
      expect(cachedOrder).toEqual(['older', 'newer']);
    });

    it('falls back to edition.createdAt when no sale date resolves', async () => {
      mockStudio(['member-1']);
      (prisma.artistContribution.findMany as jest.Mock)
        .mockResolvedValueOnce([{ editionId: 'no-sale-date' }, { editionId: 'has-sale-date' }])
        .mockResolvedValueOnce([]);
      editionsService.resolveEditionSaleDates.mockResolvedValue(new Map([
        ['no-sale-date', null],
        ['has-sale-date', { label: 'General Sale', date: new Date('2020-01-01') }],
      ]));
      (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([
        { id: 'no-sale-date', createdAt: new Date('2027-01-01') },
      ]);

      await service.findStudioContributions('the-studio', undefined, 'newest', 1, 24);

      expect(prisma.bookEdition.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['no-sale-date'] } },
        select: { id: true, createdAt: true },
      });
      const cachedOrder = cache.set.mock.calls[0][1];
      // no-sale-date falls back to createdAt 2027, which is newer than has-sale-date's 2020
      expect(cachedOrder).toEqual(['no-sale-date', 'has-sale-date']);
    });

    it('paginates the sorted edition-id list at page boundaries', async () => {
      const sortedIds = ['a', 'b', 'c', 'd', 'e'];
      mockStudio(['member-1']);
      cache.get.mockResolvedValueOnce(sortedIds); // pre-sorted, cached
      (prisma.artistContribution.findMany as jest.Mock).mockResolvedValueOnce(
        ['c', 'd'].map((id) => contributionRow(id, 'member-1', 'Jane', 'jane', 'cover')),
      );

      const result = await service.findStudioContributions('the-studio', undefined, 'newest', 2, 2);

      expect(result.total).toBe(5);
      expect(result.data.map((d: any) => d.edition.id)).toEqual(['c', 'd']);
    });

    it('caches distinct id lists per filter+sort combination', async () => {
      mockStudio(['member-1']);
      (prisma.artistContribution.findMany as jest.Mock).mockResolvedValue([]);
      editionsService.resolveEditionSaleDates.mockResolvedValue(new Map());

      await service.findStudioContributions('the-studio', undefined, 'newest', 1, 24);
      await service.findStudioContributions('the-studio', undefined, 'oldest', 1, 24);
      await service.findStudioContributions('the-studio', 'member-1', 'newest', 1, 24);

      const cacheKeys = cache.set.mock.calls.map((call: any[]) => call[0]);
      expect(new Set(cacheKeys).size).toBe(3);
    });
  });

  describe('findStudioCardMonths', () => {
    function mockStudio(memberIds: string[] = ['member-1']) {
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        id: 'studio-1',
        studioMembers: memberIds.map((id) => ({ id })),
      });
    }

    it('scopes the query to the studio itself plus every member', async () => {
      mockStudio(['member-1', 'member-2']);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionMonth.count as jest.Mock).mockResolvedValue(0);

      await service.findStudioCardMonths('the-studio', undefined, 1, 24);

      const findManyArgs = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyArgs.where.cardArtistId.in).toEqual(['studio-1', 'member-1', 'member-2']);
      expect(findManyArgs.orderBy).toEqual([{ year: 'desc' }, { month: 'desc' }]);
    });

    it('narrows to a single member when artistId is provided', async () => {
      mockStudio(['member-1', 'member-2']);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionMonth.count as jest.Mock).mockResolvedValue(0);

      await service.findStudioCardMonths('the-studio', 'member-2', 1, 24);

      const findManyArgs = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyArgs.where.cardArtistId.in).toEqual(['member-2']);
    });

    it('rejects an artistId filter that does not belong to the studio', async () => {
      mockStudio(['member-1']);

      await expect(
        service.findStudioCardMonths('the-studio', 'someone-elses-id', 1, 24),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
