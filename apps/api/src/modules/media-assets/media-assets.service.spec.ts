import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from './media-assets.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAssetRow(overrides: Record<string, unknown> = {}) {
  const { _count, ...rest } = overrides;
  return {
    id: 'asset-1',
    publicId: 'lux/asset-1',
    folder: 'lux',
    createdAt: new Date('2026-01-01'),
    ...rest,
    _count: {
      authorPhotos: 0,
      artistPhotos: 0,
      companyLogos: 0,
      subscriptionCovers: 0,
      subscriptionLogos: 0,
      seriesCovers: 0,
      monthCovers: 0,
      monthSpoilers: 0,
      saMainImages: 0,
      saExtraImages: 0,
      editionImages: 0,
      ...(_count as Record<string, number> | undefined),
    },
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('MediaAssetsService', () => {
  let service: MediaAssetsService;
  let prisma: DeepMockProxy<PrismaService>;
  let uploadService: DeepMockProxy<UploadService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    uploadService = mockDeep<UploadService>();
    service = new MediaAssetsService(prisma);
  });

  // ── findAllWithUsage ─────────────────────────────────────────────────────

  describe('findAllWithUsage', () => {
    it('dedupes book count across multiple editions of the same book while summing other usage as-is', async () => {
      const row = makeAssetRow({ _count: { authorPhotos: 1, editionImages: 2 } });
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([row]);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(1);
      // Both editions belong to the same book -> distinct book count of 1
      (prisma.book.count as jest.Mock).mockResolvedValue(1);
      (prisma.userEditionImage.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllWithUsage({});

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'asset-1',
        bookCount: 1,
        otherUsageCount: 1,
        totalUsageCount: 3,
      });
      expect(prisma.book.count).toHaveBeenCalledWith({
        where: { editions: { some: { editionImages: { some: { assetId: 'asset-1' } } } } },
      });
    });

    it('returns zeros for a completely unused asset', async () => {
      const row = makeAssetRow();
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([row]);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(1);
      (prisma.book.count as jest.Mock).mockResolvedValue(0);
      (prisma.userEditionImage.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAllWithUsage({});

      expect(result.data[0]).toMatchObject({ bookCount: 0, otherUsageCount: 0, totalUsageCount: 0 });
    });

    it('counts a community-submitted edition photo (no assetId FK, matched by publicId) as usage', async () => {
      // A community photo has no book/edition link via editionImages, but its cloudinaryId
      // matches this asset's publicId — it must still block deletion via otherUsageCount.
      const row = makeAssetRow();
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([row]);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(1);
      (prisma.book.count as jest.Mock).mockResolvedValue(0);
      (prisma.userEditionImage.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAllWithUsage({});

      expect(prisma.userEditionImage.count).toHaveBeenCalledWith({ where: { cloudinaryId: 'lux/asset-1' } });
      expect(result.data[0]).toMatchObject({ bookCount: 0, otherUsageCount: 1, totalUsageCount: 1 });
    });

    it('forwards search/folder/page/pageSize into the query', async () => {
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(0);

      await service.findAllWithUsage({ search: 'cover', folder: 'lux/covers', page: 2, pageSize: 10 });

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            folder: 'lux/covers',
            publicId: { contains: 'cover', mode: 'insensitive' },
          }),
          skip: 10,
          take: 10,
        }),
      );
    });

    it('always excludes the blog folder — those images live in Ghost, an external CMS with no usage tracking here', async () => {
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(0);

      await service.findAllWithUsage({});

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { OR: [{ folder: null }, { folder: { not: 'luxgrimoire/blog' } }] },
            ]),
          }),
        }),
      );
    });

    it('computes total and totalPages from the count query', async () => {
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(25);

      const result = await service.findAllWithUsage({ pageSize: 10 });

      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it('unusedOnly pushes every relation-none check plus a community-publicId exclusion into the query', async () => {
      (prisma.userEditionImage.findMany as jest.Mock).mockResolvedValue([
        { cloudinaryId: 'lux/community-1' },
        { cloudinaryId: 'lux/community-2' },
      ]);
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(0);

      await service.findAllWithUsage({ unusedOnly: true });

      expect(prisma.userEditionImage.findMany).toHaveBeenCalledWith({
        select: { cloudinaryId: true },
        distinct: ['cloudinaryId'],
      });
      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { authorPhotos: { none: {} } },
              { editionImages: { none: {} } },
              { publicId: { notIn: ['lux/community-1', 'lux/community-2'] } },
            ]),
          }),
        }),
      );
    });

    it('does not query community publicIds when unusedOnly is not requested', async () => {
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.mediaAsset.count as jest.Mock).mockResolvedValue(0);

      await service.findAllWithUsage({});

      expect(prisma.userEditionImage.findMany).not.toHaveBeenCalled();
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('refuses to delete a blog-folder asset even if it looks unused, and never touches Cloudinary/DB', async () => {
      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({
        id: 'asset-1',
        publicId: 'luxgrimoire/blog/some-post-image',
        folder: 'luxgrimoire/blog',
      });

      const result = await service.remove('asset-1', uploadService);

      expect(result).toEqual({ deleted: false, publicId: 'luxgrimoire/blog/some-post-image' });
      expect(uploadService.deleteImage).not.toHaveBeenCalled();
      expect(prisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
      // Should short-circuit before even re-checking usage counts
      expect(prisma.author.count).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the asset id does not exist', async () => {
      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('missing-id', uploadService)).rejects.toThrow(NotFoundException);
      expect(uploadService.deleteImage).not.toHaveBeenCalled();
    });

    it('deletes from Cloudinary and the DB when the asset has zero usages', async () => {
      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({ id: 'asset-1', publicId: 'lux/asset-1' });
      // countUsages() re-queries all 9 relation counts internally — stub every one at 0
      (prisma.author.count as jest.Mock).mockResolvedValue(0);
      (prisma.artist.count as jest.Mock).mockResolvedValue(0);
      (prisma.bookBoxCompany.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscriptionSeries.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscriptionMonth.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(0);
      (prisma.bookEditionMediaAsset.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleAnnouncementMediaAsset.count as jest.Mock).mockResolvedValue(0);
      (prisma.userEditionImage.count as jest.Mock).mockResolvedValue(0);
      (uploadService.deleteImage as jest.Mock).mockResolvedValue(undefined);
      (prisma.mediaAsset.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.remove('asset-1', uploadService);

      expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/asset-1');
      expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { publicId: 'lux/asset-1' } });
      expect(result).toEqual({ deleted: true, publicId: 'lux/asset-1' });
    });

    it('does not touch Cloudinary or the DB when the asset is still in use', async () => {
      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({ id: 'asset-1', publicId: 'lux/asset-1' });
      (prisma.author.count as jest.Mock).mockResolvedValue(1);
      (prisma.artist.count as jest.Mock).mockResolvedValue(0);
      (prisma.bookBoxCompany.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscriptionSeries.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscriptionMonth.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(0);
      (prisma.bookEditionMediaAsset.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleAnnouncementMediaAsset.count as jest.Mock).mockResolvedValue(0);
      (prisma.userEditionImage.count as jest.Mock).mockResolvedValue(0);

      const result = await service.remove('asset-1', uploadService);

      expect(uploadService.deleteImage).not.toHaveBeenCalled();
      expect(prisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: false, publicId: 'lux/asset-1' });
    });

    it('does not delete an asset that is still referenced by a community-submitted edition photo', async () => {
      // Community photos (UserEditionImage) have no book/author/artist FK at all — this is the
      // exact case that would otherwise slip through every other usage check as "unused".
      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({ id: 'asset-1', publicId: 'lux/asset-1' });
      (prisma.author.count as jest.Mock).mockResolvedValue(0);
      (prisma.artist.count as jest.Mock).mockResolvedValue(0);
      (prisma.bookBoxCompany.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscriptionSeries.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscriptionMonth.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(0);
      (prisma.bookEditionMediaAsset.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleAnnouncementMediaAsset.count as jest.Mock).mockResolvedValue(0);
      (prisma.userEditionImage.count as jest.Mock).mockResolvedValue(1);

      const result = await service.remove('asset-1', uploadService);

      expect(prisma.userEditionImage.count).toHaveBeenCalledWith({ where: { cloudinaryId: 'lux/asset-1' } });
      expect(uploadService.deleteImage).not.toHaveBeenCalled();
      expect(prisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: false, publicId: 'lux/asset-1' });
    });

    it('reflects the current usage state even if it changed since an earlier list fetch', async () => {
      // Simulates: list showed totalUsageCount 0, but a book was linked to this asset just before delete
      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({ id: 'asset-1', publicId: 'lux/asset-1' });
      (prisma.author.count as jest.Mock).mockResolvedValue(0);
      (prisma.artist.count as jest.Mock).mockResolvedValue(0);
      (prisma.bookBoxCompany.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscriptionSeries.count as jest.Mock).mockResolvedValue(0);
      (prisma.subscriptionMonth.count as jest.Mock).mockResolvedValue(0);
      (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(0);
      (prisma.bookEditionMediaAsset.count as jest.Mock).mockResolvedValue(1); // raced: now in use
      (prisma.saleAnnouncementMediaAsset.count as jest.Mock).mockResolvedValue(0);
      (prisma.userEditionImage.count as jest.Mock).mockResolvedValue(0);

      const result = await service.remove('asset-1', uploadService);

      expect(result.deleted).toBe(false);
      expect(uploadService.deleteImage).not.toHaveBeenCalled();
    });
  });
});
