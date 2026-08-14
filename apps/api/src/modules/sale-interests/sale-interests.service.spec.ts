/**
 * Tests for SaleInterestsService.findAll()'s batched "expected shipping/fees, based on your
 * past purchases" wiring — powers the personal calendar's sale-interest list. Must stay at
 * exactly one predictBatch() call regardless of how many interests are returned (that's the
 * whole point of predictBatch over calling predict() in a loop — see
 * UserCostSnapshotCronService), and must gracefully skip interests with no resolvable
 * company/book-count instead of throwing.
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { UserCostSnapshotCronService } from '../user-cost-snapshots/user-cost-snapshot.cron';
import { SaleInterestsService } from './sale-interests.service';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    announcementId: 'sale-1',
    announcement: {
      id: 'sale-1',
      title: 'Sale 1',
      company: { id: 'company-1', name: 'Co' },
      _count: { editions: 2 },
    },
    saleTier: null,
    ...overrides,
  };
}

describe('SaleInterestsService.findAll — batched expected costs', () => {
  let service: SaleInterestsService;
  let prisma: DeepMockProxy<PrismaService>;
  let userCostSnapshotService: DeepMockProxy<UserCostSnapshotCronService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    userCostSnapshotService = mockDeep<UserCostSnapshotCronService>();
    service = new SaleInterestsService(prisma, userCostSnapshotService, undefined);
  });

  it('attaches expectedCosts from the batched prediction map, keyed by companyId:bookCount', async () => {
    (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValueOnce([makeRow()]);
    const prediction = { shipping: { amount: 9, currency: 'USD' }, fees: [], currency: 'USD', sampleSize: 2 };
    (userCostSnapshotService.predictBatch as jest.Mock).mockResolvedValueOnce(
      new Map([['company-1:2', prediction]]),
    );

    const result = await service.findAll('user-1');

    expect(result).toHaveLength(1);
    expect((result[0] as any).expectedCosts).toEqual(prediction);
  });

  it('issues exactly one predictBatch call regardless of how many interests are returned', async () => {
    (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValueOnce([
      makeRow({ announcementId: 'sale-1' }),
      makeRow({ announcementId: 'sale-2', announcement: { id: 'sale-2', title: 'S2', company: { id: 'company-2', name: 'Co2' }, _count: { editions: 4 } } }),
      makeRow({ announcementId: 'sale-3' }), // same company+bookCount as the first row
    ]);
    (userCostSnapshotService.predictBatch as jest.Mock).mockResolvedValueOnce(new Map());

    await service.findAll('user-1');

    expect(userCostSnapshotService.predictBatch).toHaveBeenCalledTimes(1);
    const [, requests] = (userCostSnapshotService.predictBatch as jest.Mock).mock.calls[0];
    expect(requests).toEqual([
      { companyId: 'company-1', bookCount: 2 },
      { companyId: 'company-2', bookCount: 4 },
      { companyId: 'company-1', bookCount: 2 },
    ]);
  });

  it('sets expectedCosts to null (not throwing) when the interest has no company', async () => {
    (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValueOnce([
      makeRow({ announcement: { id: 'sale-1', title: 'S1', company: null, _count: { editions: 2 } } }),
    ]);
    (userCostSnapshotService.predictBatch as jest.Mock).mockResolvedValueOnce(new Map());

    const result = await service.findAll('user-1');

    expect((result[0] as any).expectedCosts).toBeNull();
    expect(userCostSnapshotService.predictBatch).toHaveBeenCalledWith('user-1', []);
  });

  it('sets expectedCosts to null when the sale has zero editions (no book-count to match)', async () => {
    (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValueOnce([
      makeRow({ announcement: { id: 'sale-1', title: 'S1', company: { id: 'company-1', name: 'Co' }, _count: { editions: 0 } } }),
    ]);
    (userCostSnapshotService.predictBatch as jest.Mock).mockResolvedValueOnce(new Map());

    const result = await service.findAll('user-1');

    expect((result[0] as any).expectedCosts).toBeNull();
    expect(userCostSnapshotService.predictBatch).toHaveBeenCalledWith('user-1', []);
  });

  it('falls back to null when predictBatch has no entry for a row\'s key (no snapshot/insufficient data)', async () => {
    (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValueOnce([makeRow()]);
    (userCostSnapshotService.predictBatch as jest.Mock).mockResolvedValueOnce(new Map()); // empty — no prediction for company-1:2

    const result = await service.findAll('user-1');

    expect((result[0] as any).expectedCosts).toBeNull();
  });
});
