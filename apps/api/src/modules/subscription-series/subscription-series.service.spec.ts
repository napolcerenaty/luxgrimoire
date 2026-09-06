import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { SubscriptionSeriesService } from './subscription-series.service';

const SLUG = 'winter-arc';
const existingSeries = {
  id: 'ser-1',
  slug: SLUG,
  name: 'Winter Arc',
  coverImage: null,
  coverImageAsset: null,
  startMonth: 1,
  startYear: 2026,
  endMonth: 6,
  endYear: 2026,
  subscription: { id: 'sub-1', slug: 'fairyloot', name: 'FairyLoot' },
  months: [],
};

describe('SubscriptionSeriesService', () => {
  let service: SubscriptionSeriesService;
  let prisma: DeepMockProxy<PrismaService>;
  let media: { ensureForPublicId: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    media = { ensureForPublicId: jest.fn().mockResolvedValue({ id: 'asset-1', publicId: 'pid-1' }) };
    service = new SubscriptionSeriesService(prisma, media as unknown as MediaAssetsService);
    (prisma.subscriptionSeries as any).findUnique.mockResolvedValue(existingSeries);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findBySlug', () => {
    it('throws NotFoundException when the series does not exist', async () => {
      (prisma.subscriptionSeries as any).findUnique.mockResolvedValue(null);
      await expect(service.findBySlug('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('throws NotFoundException when the subscription is unknown', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create({ subscriptionId: 'x', name: 'S', startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an end date before the start date', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ id: 'sub-1' });
      await expect(
        service.create({ subscriptionId: 'sub-1', name: 'S', startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 3 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates with a generated slug and the skipMode / canCancelDuring / isActive defaults', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ id: 'sub-1' });
      (prisma.subscriptionSeries as any).create.mockResolvedValue({ ...existingSeries });

      await service.create({
        subscriptionId: 'sub-1', name: 'Winter Arc', startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 6,
      } as any);

      const data = (prisma.subscriptionSeries as any).create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        subscriptionId: 'sub-1',
        skipMode: 'INDIVIDUAL',
        canCancelDuring: true,
        isActive: true,
        coverImageAssetId: null,
      });
      expect(data.slug).toMatch(/^winter-arc(-|$)/);
      expect(media.ensureForPublicId).not.toHaveBeenCalled();
    });

    it('resolves a media asset when a cover image is supplied', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ id: 'sub-1' });
      (prisma.subscriptionSeries as any).create.mockResolvedValue({ ...existingSeries });

      await service.create({
        subscriptionId: 'sub-1', name: 'S', startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 6, coverImage: 'pid-1',
      } as any);

      expect(media.ensureForPublicId).toHaveBeenCalledWith('pid-1');
      expect((prisma.subscriptionSeries as any).create.mock.calls[0][0].data.coverImageAssetId).toBe('asset-1');
    });
  });

  describe('update', () => {
    it('validates the merged date range against the existing series', async () => {
      // existing is Jan–Jun 2026; moving only the start to Aug 2026 makes it invalid
      await expect(service.update(SLUG, { startMonth: 8, startYear: 2026 } as any)).rejects.toThrow(BadRequestException);
    });

    it('writes only the supplied fields', async () => {
      (prisma.subscriptionSeries as any).update.mockResolvedValue({ ...existingSeries, name: 'Renamed' });

      await service.update(SLUG, { name: 'Renamed' } as any);

      expect((prisma.subscriptionSeries as any).update.mock.calls[0][0].data).toEqual({ name: 'Renamed' });
    });
  });

  describe('delete', () => {
    it('detaches every month before removing the series', async () => {
      (prisma.subscriptionMonth.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      (prisma.subscriptionSeries as any).delete.mockResolvedValue({ ...existingSeries });

      await service.delete(SLUG);

      expect(prisma.subscriptionMonth.updateMany).toHaveBeenCalledWith({
        where: { series: { slug: SLUG } },
        data: { seriesId: null },
      });
      expect((prisma.subscriptionSeries as any).delete).toHaveBeenCalled();
    });
  });

  describe('assignMonths', () => {
    it('rejects months that belong to a different subscription', async () => {
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'm1', subscriptionId: 'sub-1' },
        { id: 'm2', subscriptionId: 'sub-OTHER' },
      ]);

      await expect(service.assignMonths(SLUG, { monthIds: ['m1', 'm2'] } as any)).rejects.toThrow(BadRequestException);
    });

    it('rejects months already assigned to another series, naming the conflicts', async () => {
      (prisma.subscriptionMonth.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'm1', subscriptionId: 'sub-1' }])
        .mockResolvedValueOnce([{ id: 'm1', year: 2026, month: 3, series: { name: 'Other Arc' } }]);

      await expect(service.assignMonths(SLUG, { monthIds: ['m1'] } as any)).rejects.toThrow(ConflictException);
    });

    it('assigns the months to this series on the happy path', async () => {
      (prisma.subscriptionMonth.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'm1', subscriptionId: 'sub-1' }])
        .mockResolvedValueOnce([]);
      (prisma.subscriptionMonth.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.assignMonths(SLUG, { monthIds: ['m1'] } as any);

      expect(prisma.subscriptionMonth.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1'] } },
        data: { seriesId: 'ser-1' },
      });
    });
  });

  describe('removeMonths', () => {
    it('nulls seriesId for the given months', async () => {
      (prisma.subscriptionMonth.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      await service.removeMonths(SLUG, { monthIds: ['m1', 'm2'] } as any);

      expect(prisma.subscriptionMonth.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1', 'm2'] } },
        data: { seriesId: null },
      });
    });
  });
});
