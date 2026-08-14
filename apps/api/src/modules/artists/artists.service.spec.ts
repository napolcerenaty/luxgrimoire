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
import { ArtistsService } from './artists.service';

describe('ArtistsService', () => {
  let service: ArtistsService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    service = new ArtistsService(prisma, typesense, uploadService, mediaAssetsService, cache as any);
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
});
