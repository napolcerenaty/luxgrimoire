import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { AnnouncementsService } from './announcements.service';

// Regression guard: getActiveSaleCount used to filter on the legacy top-level
// `generalSaleDate` column, which every sale created/edited since the dynamic
// sale-tier redesign leaves null — the homepage "upcoming sales" counter was
// effectively frozen on old backfilled sales. It must instead reuse the same
// tiers-based "active sale" definition as findAll's `upcoming` filter and getNextSale.
function containsKeyDeep(value: unknown, key: string): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsKeyDeep(item, key));
  return Object.entries(value as Record<string, unknown>).some(
    ([k, v]) => k === key || containsKeyDeep(v, key),
  );
}

describe('AnnouncementsService.getActiveSaleCount', () => {
  let service: AnnouncementsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    const cache = { get: async () => undefined, set: async () => {} } as any;
    service = new AnnouncementsService(prisma, typesense, uploadService, mediaAssetsService, cache, undefined);
    (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(7);
  });

  it('never filters on the legacy generalSaleDate column', async () => {
    await service.getActiveSaleCount();

    const where = (prisma.saleAnnouncement.count as jest.Mock).mock.calls[0][0].where;
    expect(containsKeyDeep(where, 'generalSaleDate')).toBe(false);
  });

  it('filters via the tiers relation, same as the shared active-sale definition', async () => {
    await service.getActiveSaleCount();

    const where = (prisma.saleAnnouncement.count as jest.Mock).mock.calls[0][0].where;
    expect(containsKeyDeep(where, 'tiers')).toBe(true);
  });

  it('returns whatever the count query resolves', async () => {
    const result = await service.getActiveSaleCount();
    expect(result).toBe(7);
  });
});
