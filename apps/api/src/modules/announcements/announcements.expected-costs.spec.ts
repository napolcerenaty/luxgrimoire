/**
 * Tests for AnnouncementsService.getExpectedCosts() — the "expected shipping/fees, based on
 * your past purchases" hint for a single sale announcement detail page. Personalized only:
 * no DB query at all for anonymous viewers, and `available: false` whenever there isn't
 * enough to show (missing company, zero editions, or no snapshot prediction).
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { UserCostSnapshotCronService } from '../user-cost-snapshots/user-cost-snapshot.cron';
import { AnnouncementsService } from './announcements.service';

describe('AnnouncementsService.getExpectedCosts', () => {
  let service: AnnouncementsService;
  let prisma: DeepMockProxy<PrismaService>;
  let userCostSnapshotService: DeepMockProxy<UserCostSnapshotCronService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    userCostSnapshotService = mockDeep<UserCostSnapshotCronService>();
    const cache = { get: async () => undefined, set: async () => {} } as any;
    service = new AnnouncementsService(prisma, typesense, uploadService, mediaAssetsService, userCostSnapshotService, cache, undefined);
  });

  it('returns unavailable without querying anything for an anonymous viewer', async () => {
    const result = await service.getExpectedCosts('sale-1', null);

    expect(result).toEqual({ available: false });
    expect(prisma.saleAnnouncement.findUnique).not.toHaveBeenCalled();
    expect(userCostSnapshotService.predict).not.toHaveBeenCalled();
  });

  it('returns unavailable without querying anything when userId is undefined', async () => {
    const result = await service.getExpectedCosts('sale-1', undefined);

    expect(result).toEqual({ available: false });
    expect(prisma.saleAnnouncement.findUnique).not.toHaveBeenCalled();
  });

  it('returns unavailable when the sale has no company', async () => {
    (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValueOnce({
      companyId: null, _count: { editions: 3 },
    });

    const result = await service.getExpectedCosts('sale-1', 'user-1');

    expect(result).toEqual({ available: false });
    expect(userCostSnapshotService.predict).not.toHaveBeenCalled();
  });

  it('returns unavailable when the sale has zero editions (nothing to book-count-match against)', async () => {
    (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValueOnce({
      companyId: 'company-1', _count: { editions: 0 },
    });

    const result = await service.getExpectedCosts('sale-1', 'user-1');

    expect(result).toEqual({ available: false });
    expect(userCostSnapshotService.predict).not.toHaveBeenCalled();
  });

  it('returns unavailable when the snapshot service has no prediction', async () => {
    (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValueOnce({
      companyId: 'company-1', _count: { editions: 2 },
    });
    (userCostSnapshotService.predict as jest.Mock).mockResolvedValueOnce(null);

    const result = await service.getExpectedCosts('sale-1', 'user-1');

    expect(result).toEqual({ available: false });
  });

  it('calls predict with the sale\'s company and edition count, and spreads the prediction when available', async () => {
    (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValueOnce({
      companyId: 'company-1', _count: { editions: 3 },
    });
    const prediction = {
      shipping: { amount: 12.5, currency: 'USD' },
      fees: [{ category: 'CUSTOMS', amount: 4, currency: 'USD' }],
      currency: 'USD',
      sampleSize: 2,
    };
    (userCostSnapshotService.predict as jest.Mock).mockResolvedValueOnce(prediction);

    const result = await service.getExpectedCosts('sale-1', 'user-1');

    expect(userCostSnapshotService.predict).toHaveBeenCalledWith('user-1', 'company-1', 3);
    expect(result).toEqual({ available: true, ...prediction });
  });
});
