import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { PurchaseGroupsService } from './purchase-groups.service';
import { CreatePurchaseGroupDto, UpdatePurchaseGroupDto } from './purchase-groups.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCreateDto(overrides: Partial<CreatePurchaseGroupDto> = {}): CreatePurchaseGroupDto {
  return {
    totalAmount: 30,
    currency: 'USD',
    purchasedAt: '2024-01-15',
    editionIds: ['ed-a', 'ed-b', 'ed-c'],
    ...overrides,
  } as CreatePurchaseGroupDto;
}

const EDITIONS = [
  { id: 'ed-a', bookId: 'book-a' },
  { id: 'ed-b', bookId: 'book-b' },
  { id: 'ed-c', bookId: 'book-c' },
];

describe('PurchaseGroupsService', () => {
  let service: PurchaseGroupsService;
  let prisma: DeepMockProxy<PrismaService>;
  let statsService: DeepMockProxy<StatsService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    statsService = mockDeep<StatsService>();
    service = new PurchaseGroupsService(prisma, statsService);

    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue(EDITIONS);
    (prisma.userPurchaseGroup.create as jest.Mock).mockImplementation(async ({ data }: any) => ({ id: 'pg-1', ...data }));
    (prisma.userBookEntry.create as jest.Mock).mockImplementation(async ({ data }: any) => ({ id: `ube-${data.editionId}`, ...data }));
  });

  // ── createGroup ──────────────────────────────────────────────────────────────

  describe('createGroup', () => {
    it('EQUAL distribution (default, no overrides): splits totalAmount evenly across all editions', async () => {
      const dto = makeCreateDto({ totalAmount: 30 });
      const { bookEntries } = await service.createGroup('user-1', dto);

      expect(bookEntries).toHaveLength(3);
      for (const be of bookEntries) {
        expect((be as any).basePrice).toBe(10);
      }
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ priceDistribution: 'EQUAL' }) }),
      );
    });

    it('CUSTOM distribution with all editions priced: uses the exact prices given', async () => {
      const dto = makeCreateDto({
        totalAmount: 35,
        priceDistribution: 'CUSTOM',
        editionPrices: { 'ed-a': 10, 'ed-b': 20, 'ed-c': 5 },
      });
      const { bookEntries } = await service.createGroup('user-1', dto);

      const byEdition = Object.fromEntries(bookEntries.map((be: any) => [be.editionId, be.basePrice]));
      expect(byEdition).toEqual({ 'ed-a': 10, 'ed-b': 20, 'ed-c': 5 });
      expect(prisma.userPurchaseGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ priceDistribution: 'CUSTOM' }) }),
      );
    });

    it('CUSTOM distribution with a partial price: the priced edition gets its exact price, the rest split the remainder', async () => {
      const dto = makeCreateDto({
        totalAmount: 30,
        priceDistribution: 'CUSTOM',
        editionPrices: { 'ed-a': 20 },
      });
      const { bookEntries } = await service.createGroup('user-1', dto);

      const byEdition = Object.fromEntries(bookEntries.map((be: any) => [be.editionId, be.basePrice]));
      expect(byEdition['ed-a']).toBe(20);
      expect(byEdition['ed-b']).toBe(5);
      expect(byEdition['ed-c']).toBe(5);
    });

    it('CUSTOM distribution declared but editionPrices omitted entirely: rejects', async () => {
      const dto = makeCreateDto({ priceDistribution: 'CUSTOM' });
      await expect(service.createGroup('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('CUSTOM distribution where priced editions sum above totalAmount: rejects, no entries created', async () => {
      const dto = makeCreateDto({
        totalAmount: 30,
        priceDistribution: 'CUSTOM',
        editionPrices: { 'ed-a': 25, 'ed-b': 20 },
      });
      await expect(service.createGroup('user-1', dto)).rejects.toThrow(BadRequestException);
      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('rejects when editionIds is empty', async () => {
      const dto = makeCreateDto({ editionIds: [] });
      await expect(service.createGroup('user-1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ── updateGroup ──────────────────────────────────────────────────────────────

  describe('updateGroup', () => {
    function mockExistingGroup(overrides: Record<string, unknown> = {}) {
      const group = {
        id: 'pg-1',
        userId: 'user-1',
        totalAmount: 30,
        priceDistribution: 'EQUAL',
        bookEntries: [
          { id: 'ube-a', basePrice: 10 },
          { id: 'ube-b', basePrice: 10 },
          { id: 'ube-c', basePrice: 10 },
        ],
        ...overrides,
      };
      (prisma.userPurchaseGroup.findUnique as jest.Mock).mockResolvedValue(group);
      (prisma.userPurchaseGroup.update as jest.Mock).mockImplementation(async ({ data }: any) => ({ id: 'pg-1', ...data }));
      return group;
    }

    it('changing totalAmount on an EQUAL group: redistributes evenly at the new total', async () => {
      mockExistingGroup();
      const dto: UpdatePurchaseGroupDto = { totalAmount: 60 };
      await service.updateGroup('user-1', 'pg-1', dto);

      expect(prisma.userBookEntry.update).toHaveBeenCalledTimes(3);
      for (const call of (prisma.userBookEntry.update as jest.Mock).mock.calls) {
        expect(call[0].data.basePrice).toBe(20);
      }
    });

    it('changing totalAmount on a CUSTOM group with no new entryPrices: rescales old allocations proportionally', async () => {
      mockExistingGroup({
        priceDistribution: 'CUSTOM',
        bookEntries: [
          { id: 'ube-a', basePrice: 20 },
          { id: 'ube-b', basePrice: 5 },
          { id: 'ube-c', basePrice: 5 },
        ],
      });
      const dto: UpdatePurchaseGroupDto = { totalAmount: 60 }; // double the old total (30)
      await service.updateGroup('user-1', 'pg-1', dto);

      const byId = Object.fromEntries(
        (prisma.userBookEntry.update as jest.Mock).mock.calls.map((c: any) => [c[0].where.id, c[0].data.basePrice]),
      );
      expect(byId).toEqual({ 'ube-a': 40, 'ube-b': 10, 'ube-c': 10 });
    });

    it('providing entryPrices switches the group to CUSTOM and uses the given prices', async () => {
      mockExistingGroup();
      const dto: UpdatePurchaseGroupDto = { entryPrices: { 'ube-a': 18, 'ube-b': 6, 'ube-c': 6 } };
      await service.updateGroup('user-1', 'pg-1', dto);

      expect(prisma.userPurchaseGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ priceDistribution: 'CUSTOM' }) }),
      );
      const byId = Object.fromEntries(
        (prisma.userBookEntry.update as jest.Mock).mock.calls.map((c: any) => [c[0].where.id, c[0].data.basePrice]),
      );
      expect(byId).toEqual({ 'ube-a': 18, 'ube-b': 6, 'ube-c': 6 });
    });

    it('no total or entryPrices change: does not touch book entry prices', async () => {
      mockExistingGroup();
      const dto: UpdatePurchaseGroupDto = { title: 'Renamed' };
      await service.updateGroup('user-1', 'pg-1', dto);

      expect(prisma.userBookEntry.update).not.toHaveBeenCalled();
    });
  });

  // ── computeGroupCosts (via getGroup) ─────────────────────────────────────────

  describe('per-entry cost computation', () => {
    it('uses real basePrice per entry when present, falls back to equal split for legacy (null) entries', async () => {
      (prisma.userPurchaseGroup.findUnique as jest.Mock).mockResolvedValue({
        id: 'pg-1',
        userId: 'user-1',
        totalAmount: 30,
        shippingAmount: 9,
        bookEntries: [
          { id: 'ube-a', basePrice: 20 },
          { id: 'ube-b', basePrice: null }, // legacy, pre-migration
          { id: 'ube-c', basePrice: null },
        ],
        fees: [],
        discounts: [],
        refunds: [],
      });

      const result = await service.getGroup('user-1', 'pg-1');

      // basePrice: real value when set, else equal share of totalAmount (30/3 = 10)
      const byId = Object.fromEntries(result.bookEntries.map((be: any) => [be.id, be.basePrice]));
      expect(byId).toEqual({ 'ube-a': 20, 'ube-b': 10, 'ube-c': 10 });

      // entryCost = basePrice + equal share of shipping/fees/discounts/refunds (9/3 = 3 each)
      const costById = Object.fromEntries(result.bookEntries.map((be: any) => [be.id, be.entryCost]));
      expect(costById).toEqual({ 'ube-a': 23, 'ube-b': 13, 'ube-c': 13 });

      // perBookCost stays the group-wide average for backward compatibility
      expect(result.perBookCost).toBe(13); // (30 + 9) / 3
    });
  });
});
