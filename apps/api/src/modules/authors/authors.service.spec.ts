import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { EditionsService } from '../editions/editions.service';
import { AuthorsService } from './authors.service';

describe('AuthorsService', () => {
  let service: AuthorsService;
  let prisma: DeepMockProxy<PrismaService>;
  let typesense: { upsertDocument: jest.Mock; deleteDocument: jest.Mock };
  let media: { ensureForPublicId: jest.Mock };
  let editions: { resolveEditionSaleDates: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    typesense = { upsertDocument: jest.fn().mockResolvedValue(undefined), deleteDocument: jest.fn().mockResolvedValue(undefined) };
    media = { ensureForPublicId: jest.fn().mockResolvedValue({ id: 'asset-1', publicId: 'pid-1' }) };
    editions = { resolveEditionSaleDates: jest.fn().mockResolvedValue(new Map()) };
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    service = new AuthorsService(
      prisma,
      typesense as unknown as TypesenseService,
      media as unknown as MediaAssetsService,
      editions as unknown as EditionsService,
      cache as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('applies no name filter without a search term', async () => {
      (prisma.author as any).findMany.mockResolvedValue([]);
      (prisma.author.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({} as any);

      expect((prisma.author as any).findMany.mock.calls[0][0].where).toEqual({});
    });

    it('filters by a case-insensitive name contains and projects the asset publicId over photoUrl', async () => {
      (prisma.author as any).findMany.mockResolvedValue([
        { id: 'a1', name: 'Jane', photoUrl: 'old.jpg', photoAsset: { id: 'x', publicId: 'new-pid' } },
      ]);
      (prisma.author.count as jest.Mock).mockResolvedValue(1);

      const res = await service.findAll({ search: 'jan' } as any);

      expect((prisma.author as any).findMany.mock.calls[0][0].where).toEqual({
        name: { contains: 'jan', mode: 'insensitive' },
      });
      expect(res.data[0].photoUrl).toBe('new-pid');
    });
  });

  describe('findBySlug', () => {
    it('returns the cached profile without hitting the database', async () => {
      cache.get.mockResolvedValue({ id: 'a1', name: 'Cached' });

      const res = await service.findBySlug('jane');

      expect(res).toEqual({ id: 'a1', name: 'Cached' });
      expect((prisma.author as any).findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException on a cache miss for an unknown author', async () => {
      (prisma.author as any).findUnique.mockResolvedValue(null);
      await expect(service.findBySlug('ghost')).rejects.toThrow(NotFoundException);
    });

    it('fetches, caches and returns on a cache miss', async () => {
      (prisma.author as any).findUnique.mockResolvedValue({ id: 'a1', slug: 'jane', name: 'Jane', photoUrl: null, photoAsset: null });

      const res = await service.findBySlug('jane');

      expect(res).toMatchObject({ id: 'a1', name: 'Jane' });
      expect(cache.set).toHaveBeenCalledWith('authors:slug:jane', expect.any(Object), expect.any(Number));
    });
  });

  describe('update', () => {
    it('recomputes photoAssetId, busts both cache keys and re-indexes', async () => {
      cache.get.mockResolvedValue({ id: 'a1', slug: 'jane', name: 'Jane' }); // findBySlug guard
      (prisma.author as any).update.mockResolvedValue({ id: 'a1', slug: 'jane', name: 'Jane', photoUrl: 'pid-1' });
      (prisma.bookAuthor.findMany as jest.Mock).mockResolvedValue([]);

      await service.update('jane', { bio: 'new bio', photoUrl: 'pid-1' } as any);

      const data = (prisma.author as any).update.mock.calls[0][0].data;
      expect(data).toMatchObject({ bio: 'new bio', photoUrl: 'pid-1', photoAssetId: 'asset-1' });
      expect(cache.del).toHaveBeenCalledWith('authors:slug:jane');
      expect(cache.del).toHaveBeenCalledWith('authors:slug:jane:books');
      expect(typesense.upsertDocument).toHaveBeenCalledWith('authors', expect.objectContaining({ id: 'a1' }));
    });
  });

  describe('delete', () => {
    it('de-indexes, busts the cache and removes the row', async () => {
      cache.get.mockResolvedValue({ id: 'a1', slug: 'jane', name: 'Jane' });
      (prisma.author.delete as jest.Mock).mockResolvedValue({ id: 'a1' });

      await service.delete('jane');

      expect(typesense.deleteDocument).toHaveBeenCalledWith('authors', 'a1');
      expect(cache.del).toHaveBeenCalledWith('authors:slug:jane');
      expect(prisma.author.delete).toHaveBeenCalledWith({ where: { slug: 'jane' } });
    });
  });
});
