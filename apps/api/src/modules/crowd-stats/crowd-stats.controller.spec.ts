import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { CrowdStatsService } from './crowd-stats.service';
import { CrowdStatsController } from './crowd-stats.controller';

describe('CrowdStatsController.getPlatformStats', () => {
  let controller: CrowdStatsController;
  let prisma: DeepMockProxy<PrismaService>;
  let announcementsService: DeepMockProxy<AnnouncementsService>;
  let cache: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const crowdStatsService = mockDeep<CrowdStatsService>();
    const currencyService = mockDeep<CurrencyService>();
    announcementsService = mockDeep<AnnouncementsService>();
    cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) };

    controller = new CrowdStatsController(
      crowdStatsService,
      prisma,
      currencyService,
      announcementsService,
      cache as any,
    );

    (prisma.bookEdition.count as jest.Mock).mockResolvedValue(100);
    (prisma.bookBoxCompany.count as jest.Mock).mockResolvedValue(10);
    (prisma.subscription.count as jest.Mock).mockResolvedValue(20);
    (announcementsService.getActiveSaleCount as jest.Mock).mockResolvedValue(5);
  });

  it('returns the cached value without querying when a cache hit occurs', async () => {
    const cached = { editionsCount: 1, companiesCount: 2, subscriptionsCount: 3, activeSalesCount: 4 };
    cache.get.mockResolvedValue(cached);

    const result = await controller.getPlatformStats();

    expect(result).toBe(cached);
    expect(prisma.bookEdition.count).not.toHaveBeenCalled();
    expect(announcementsService.getActiveSaleCount).not.toHaveBeenCalled();
  });

  it('assembles fresh stats from all four sources on a cache miss and caches the result', async () => {
    const result = await controller.getPlatformStats();

    expect(result).toEqual({
      editionsCount: 100,
      companiesCount: 10,
      subscriptionsCount: 20,
      activeSalesCount: 5,
    });
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), result, expect.any(Number));
  });

  // Regression guard: the upcoming-sales count must come from AnnouncementsService's shared
  // tiers-based "active sale" definition, not a raw prisma.saleAnnouncement.count() re-implemented
  // here against the legacy `generalSaleDate` column (which is what caused the counter to get
  // stuck on old backfilled sales — see AnnouncementsService.getActiveSaleCount).
  it('delegates the active-sales count to AnnouncementsService instead of querying saleAnnouncement directly', async () => {
    await controller.getPlatformStats();

    expect(announcementsService.getActiveSaleCount).toHaveBeenCalledTimes(1);
    expect(prisma.saleAnnouncement.count).not.toHaveBeenCalled();
  });

  it('only counts non-discontinued, non-content-stream subscriptions', async () => {
    await controller.getPlatformStats();

    expect(prisma.subscription.count).toHaveBeenCalledWith({
      where: { isDiscontinued: false, isContentStream: false },
    });
  });

  it('only counts verified editions', async () => {
    await controller.getPlatformStats();

    expect(prisma.bookEdition.count).toHaveBeenCalledWith({
      where: { verifiedAt: { not: null } },
    });
  });
});
