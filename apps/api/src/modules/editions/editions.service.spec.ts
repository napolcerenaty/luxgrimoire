/**
 * Unit tests for EditionsService.resolveEditionSaleDate and linkEditionHistory.
 *
 * These replace the old generalSaleDate-column-based date comparisons — an edition's sale
 * date is now resolved live from its linked SaleAnnouncement's SaleTier rows (or, for
 * standalone editions, the earliest manually-entered EditionSaleDate row). This is the
 * highest-risk part of the sale-tier redesign (auto-linking reprint/re-edition chains), so
 * these tests reproduce the chain-linking / re-routing scenarios the old generalSaleDate-based
 * version would have covered, against the new resolver.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { FeatureTaggerService } from '../feature-categories/feature-tagger.service';
import { EditionsService } from './editions.service';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

describe('EditionsService.resolveEditionSaleDate', () => {
  let service: EditionsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;
    const tagger = mockDeep<FeatureTaggerService>();
    service = new EditionsService(prisma, typesense, uploadService, mediaAssetsService, cache, tagger);
  });

  it('returns null for an edition with no announcement link and no manual dates', async () => {
    (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.editionSaleDate.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await service.resolveEditionSaleDate('edition-1');

    expect(result).toBeNull();
  });

  it('resolves the earliest manual EditionSaleDate for a standalone edition', async () => {
    (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.editionSaleDate.findFirst as jest.Mock).mockResolvedValue({
      id: 'esd-1', editionId: 'edition-1', label: 'General Sale', date: daysFromNow(1), order: 0,
    });

    const result = await service.resolveEditionSaleDate('edition-1');

    expect(result?.label).toBe('General Sale');
    expect(prisma.saleTier.findFirst).not.toHaveBeenCalled();
  });

  it('resolves live from the linked announcement\'s default tiers when there is no default region', async () => {
    (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([{ saleId: 'sale-1' }]);
    (prisma.saleAnnouncementRegion.findFirst as jest.Mock).mockResolvedValue(null);
    const earliestTier = { id: 'tier-1', name: 'First Access', date: daysFromNow(2) };
    (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue(earliestTier);

    const result = await service.resolveEditionSaleDate('edition-1');

    expect(result).toEqual({ label: 'First Access', date: earliestTier.date });
    // Manual dates are never consulted for a linked edition — the announcement is authoritative.
    expect(prisma.editionSaleDate.findFirst).not.toHaveBeenCalled();
  });

  it('prefers the default region\'s own tiers over the announcement\'s top-level tiers when both exist', async () => {
    (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([{ saleId: 'sale-1' }]);
    (prisma.saleAnnouncementRegion.findFirst as jest.Mock).mockResolvedValue({ id: 'region-1' });
    const regionTier = { id: 'tier-region', name: 'Region Early Access', date: daysFromNow(1) };
    (prisma.saleTier.findFirst as jest.Mock).mockResolvedValueOnce(regionTier);

    const result = await service.resolveEditionSaleDate('edition-1');

    expect(result).toEqual({ label: 'Region Early Access', date: regionTier.date });
    expect(prisma.saleTier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { saleId: 'sale-1', regionId: 'region-1' } }),
    );
  });

  it('returns null when linked but the announcement has no tiers yet', async () => {
    (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([{ saleId: 'sale-1' }]);
    (prisma.saleAnnouncementRegion.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await service.resolveEditionSaleDate('edition-1');

    expect(result).toBeNull();
  });

  it('aggregates across multiple linked announcements and picks the earliest tier overall', async () => {
    // Edition linked to both an original sale (later tier) and a newly-added restock sale
    // (earlier tier) — must consider both, not arbitrarily pick just one.
    (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([
      { saleId: 'sale-original' },
      { saleId: 'sale-restock' },
    ]);
    (prisma.saleAnnouncementRegion.findFirst as jest.Mock).mockResolvedValue(null);
    const originalTier = { id: 'tier-original', name: 'General Sale', date: daysFromNow(10) };
    const restockTier = { id: 'tier-restock', name: 'Restock', date: daysFromNow(3) };
    (prisma.saleTier.findFirst as jest.Mock)
      .mockResolvedValueOnce(originalTier)
      .mockResolvedValueOnce(restockTier);

    const result = await service.resolveEditionSaleDate('edition-1');

    expect(result).toEqual({ label: 'Restock', date: restockTier.date });
  });

  it('still resolves from the one announcement with tiers when linked to a second with none yet', async () => {
    (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([
      { saleId: 'sale-with-tiers' },
      { saleId: 'sale-without-tiers' },
    ]);
    (prisma.saleAnnouncementRegion.findFirst as jest.Mock).mockResolvedValue(null);
    const tier = { id: 'tier-1', name: 'General Sale', date: daysFromNow(5) };
    (prisma.saleTier.findFirst as jest.Mock)
      .mockResolvedValueOnce(tier)
      .mockResolvedValueOnce(null);

    const result = await service.resolveEditionSaleDate('edition-1');

    expect(result).toEqual({ label: 'General Sale', date: tier.date });
  });
});

describe('EditionsService.linkEditionHistory', () => {
  let service: EditionsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;
    const tagger = mockDeep<FeatureTaggerService>();
    service = new EditionsService(prisma, typesense, uploadService, mediaAssetsService, cache, tagger);
  });

  function mockEdition(overrides: Record<string, unknown> = {}) {
    return {
      id: 'id', slug: 'slug', bookId: 'book-1', createdAt: new Date('2025-01-01'),
      previousEditionId: null, nextEdition: null,
      ...overrides,
    };
  }

  it('orders older/newer by resolved sale date (not createdAt) when both editions resolve a date', async () => {
    const a = mockEdition({ id: 'a', slug: 'edition-a', createdAt: new Date('2025-06-01') });
    const b = mockEdition({ id: 'b', slug: 'edition-b', createdAt: new Date('2025-01-01') });
    (prisma.bookEdition.findUnique as jest.Mock)
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(b);
    // a resolves to an earlier date than b, despite a.createdAt being later than b.createdAt —
    // confirms ordering uses the resolver, not the DB row's createdAt.
    jest.spyOn(service, 'resolveEditionSaleDate')
      .mockImplementation(async (id: string) => {
        if (id === 'a') return { label: 'First Access', date: new Date('2025-03-01') };
        if (id === 'b') return { label: 'General Sale', date: new Date('2025-04-01') };
        return null;
      });

    const result = await service.linkEditionHistory('edition-a', 'edition-b');

    expect(result.older.slug).toBe('edition-a');
    expect(result.newer.slug).toBe('edition-b');
    expect(result.wasRerouted).toBe(false);
    expect(prisma.bookEdition.update).toHaveBeenCalledWith({
      where: { id: 'b' },
      data: { previousEditionId: 'a' },
    });
  });

  it('falls back to createdAt when an edition has no resolvable sale date', async () => {
    const a = mockEdition({ id: 'a', slug: 'edition-a', createdAt: new Date('2025-01-01') });
    const b = mockEdition({ id: 'b', slug: 'edition-b', createdAt: new Date('2025-06-01') });
    (prisma.bookEdition.findUnique as jest.Mock)
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(b);
    jest.spyOn(service, 'resolveEditionSaleDate').mockResolvedValue(null);

    const result = await service.linkEditionHistory('edition-a', 'edition-b');

    // Neither resolves a tier/manual date, so createdAt decides — same as the old
    // generalSaleDate-null fallback behavior.
    expect(result.older.slug).toBe('edition-a');
    expect(result.newer.slug).toBe('edition-b');
  });

  it('re-routes the chain when the newly linked edition falls between an existing pair', async () => {
    const older = mockEdition({
      id: 'older', slug: 'edition-older',
      nextEdition: { id: 'existing-next', slug: 'edition-existing-next', createdAt: new Date('2025-05-01') },
    });
    const middle = mockEdition({ id: 'middle', slug: 'edition-middle' });
    (prisma.bookEdition.findUnique as jest.Mock)
      .mockResolvedValueOnce(older)
      .mockResolvedValueOnce(middle);
    jest.spyOn(service, 'resolveEditionSaleDate').mockImplementation(async (id: string) => {
      if (id === 'older') return { label: 'General Sale', date: new Date('2025-01-01') };
      if (id === 'middle') return { label: 'General Sale', date: new Date('2025-03-01') }; // between older and existing-next
      if (id === 'existing-next') return { label: 'General Sale', date: new Date('2025-05-01') };
      return null;
    });
    (prisma.$transaction as jest.Mock).mockResolvedValue(undefined);

    const result = await service.linkEditionHistory('edition-older', 'edition-middle');

    expect(result.wasRerouted).toBe(true);
    expect(result.chain.map(c => c.slug)).toEqual(['edition-older', 'edition-middle', 'edition-existing-next']);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      prisma.bookEdition.update({ where: { id: 'middle' }, data: { previousEditionId: 'older' } }),
      prisma.bookEdition.update({ where: { id: 'existing-next' }, data: { previousEditionId: 'middle' } }),
    ]);
  });

  it('does not re-route when the newly linked edition is newer than the existing next edition', async () => {
    const older = mockEdition({
      id: 'older', slug: 'edition-older',
      nextEdition: { id: 'existing-next', slug: 'edition-existing-next', createdAt: new Date('2025-02-01') },
    });
    const newest = mockEdition({ id: 'newest', slug: 'edition-newest' });
    (prisma.bookEdition.findUnique as jest.Mock)
      .mockResolvedValueOnce(older)
      .mockResolvedValueOnce(newest);
    jest.spyOn(service, 'resolveEditionSaleDate').mockImplementation(async (id: string) => {
      if (id === 'older') return { label: 'General Sale', date: new Date('2025-01-01') };
      if (id === 'existing-next') return { label: 'General Sale', date: new Date('2025-02-01') };
      if (id === 'newest') return { label: 'General Sale', date: new Date('2025-06-01') }; // after existing-next
      return null;
    });

    const result = await service.linkEditionHistory('edition-older', 'edition-newest');

    expect(result.wasRerouted).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.bookEdition.update).toHaveBeenCalledWith({
      where: { id: 'newest' },
      data: { previousEditionId: 'older' },
    });
  });

  it('rejects linking editions from different books', async () => {
    const a = mockEdition({ id: 'a', slug: 'edition-a', bookId: 'book-1' });
    const b = mockEdition({ id: 'b', slug: 'edition-b', bookId: 'book-2' });
    (prisma.bookEdition.findUnique as jest.Mock)
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(b);

    await expect(service.linkEditionHistory('edition-a', 'edition-b')).rejects.toThrow(
      'Editions must belong to the same book',
    );
  });
});
