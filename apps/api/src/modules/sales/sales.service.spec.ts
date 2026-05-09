import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { SalesService } from './sales.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSaleGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sg-1',
    userId: 'user-1',
    title: null,
    totalAmount: 30,
    currency: 'USD',
    platform: 'eBay',
    soldAt: new Date('2024-01-15T00:00:00Z'),
    notes: null,
    priceDistribution: 'EQUAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    entries: [],
    ...overrides,
  };
}

function makePurchaseGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pg-1',
    totalAmount: 20,
    shippingAmount: 5,
    currency: 'USD',
    purchasedAt: new Date('2023-06-01T00:00:00Z'),
    _count: { bookEntries: 1 },
    ...overrides,
  };
}

function makeEntry(id: string, allocated: number | { toNumber(): number }, pg: unknown) {
  return {
    id: `se-${id}`,
    saleGroupId: 'sg-1',
    userBookEntryId: id,
    allocatedAmount: allocated,
    userBookEntry: { purchaseGroup: pg },
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SalesService', () => {
  let service: SalesService;
  let prisma: DeepMockProxy<PrismaService>;
  let currencyService: DeepMockProxy<CurrencyService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    currencyService = mockDeep<CurrencyService>();
    const crowdStatsService = mockDeep<import('../crowd-stats/crowd-stats.service').CrowdStatsService>();
    service = new SalesService(prisma, currencyService, crowdStatsService);

    // Default: $transaction passes prisma itself as the tx callback arg
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
  });

  // ── withProfit ──────────────────────────────────────────────────────────────

  describe('withProfit (private)', () => {
    it('same currency → skips conversion and returns correct profitLoss', async () => {
      (currencyService.convert as jest.Mock).mockResolvedValue(25);
      const pg = makePurchaseGroup(); // cost = (20+5)/1 = 25 USD
      const group = makeSaleGroup({ entries: [makeEntry('ube-1', 30, pg)] });

      const result = await (service as any).withProfit(group);

      // same currency → convert is still called (USD → USD)
      expect(result.profitLoss).toBe(5); // 30 - 25
      expect(result.totalPurchaseCost).toBe(25);
      expect(result.entries[0].purchaseCostInSaleCurrency).toBe(25);
    });

    it('different currency → calls currencyService.convert', async () => {
      (currencyService.convert as jest.Mock).mockResolvedValue(22.5);
      const pg = makePurchaseGroup({ currency: 'GBP' });
      const group = makeSaleGroup({ currency: 'USD', entries: [makeEntry('ube-1', 30, pg)] });

      const result = await (service as any).withProfit(group);

      expect(currencyService.convert).toHaveBeenCalledWith(
        25, // (20+5)/1
        'GBP',
        'USD',
        group.soldAt,
      );
      expect(result.entries[0].purchaseCostInSaleCurrency).toBe(22.5);
      expect(result.profitLoss).toBe(7.5); // 30 - 22.5
    });

    it('two entries from 2-book purchase group → cost is totalAmount/2 per book', async () => {
      (currencyService.convert as jest.Mock).mockResolvedValue(12.5);
      const pg = makePurchaseGroup({ totalAmount: 20, shippingAmount: 5, _count: { bookEntries: 2 } });
      const group = makeSaleGroup({
        totalAmount: 50,
        entries: [makeEntry('ube-1', 25, pg), makeEntry('ube-2', 25, pg)],
      });

      const result = await (service as any).withProfit(group);

      // rawCost per book = (20+5)/2 = 12.5
      expect(currencyService.convert).toHaveBeenCalledTimes(2);
      expect(currencyService.convert).toHaveBeenCalledWith(12.5, 'USD', 'USD', group.soldAt);
      expect(result.totalPurchaseCost).toBe(25); // 12.5 * 2
      expect(result.profitLoss).toBe(25); // 50 - 25
    });

    it('entry with no purchaseGroup → purchaseCostInSaleCurrency=null, profitLoss=null', async () => {
      const group = makeSaleGroup({ entries: [makeEntry('ube-1', 30, null)] });

      const result = await (service as any).withProfit(group);

      expect(result.entries[0].purchaseCostInSaleCurrency).toBeNull();
      expect(result.profitLoss).toBeNull();
      expect(result.totalPurchaseCost).toBeNull();
    });

    it('currencyService.convert throws → purchaseCostInSaleCurrency=null, profitLoss=null', async () => {
      (currencyService.convert as jest.Mock).mockRejectedValue(new Error('rate unavailable'));
      const pg = makePurchaseGroup();
      const group = makeSaleGroup({ entries: [makeEntry('ube-1', 30, pg)] });

      const result = await (service as any).withProfit(group);

      expect(result.entries[0].purchaseCostInSaleCurrency).toBeNull();
      expect(result.profitLoss).toBeNull();
    });

    it('Decimal totalAmount (object with .toNumber()) handled correctly', async () => {
      (currencyService.convert as jest.Mock).mockResolvedValue(25);
      const pg = makePurchaseGroup({
        totalAmount: { toNumber: () => 20 },
        shippingAmount: { toNumber: () => 5 },
      });
      const group = makeSaleGroup({
        totalAmount: { toNumber: () => 30 },
        entries: [makeEntry('ube-1', { toNumber: () => 30 }, pg)],
      });

      const result = await (service as any).withProfit(group);

      expect(result.totalAmount).toBe(30);
      expect(result.entries[0].allocatedAmount).toBe(30);
      expect(result.profitLoss).toBe(5);
    });
  });

  // ── createSaleGroup ─────────────────────────────────────────────────────────

  describe('createSaleGroup', () => {
    const baseDto = {
      totalAmount: 40,
      currency: 'USD',
      platform: 'eBay',
      soldAt: '2024-01-15',
      priceDistribution: 'EQUAL' as const,
      entryIds: ['ube-1', 'ube-2'],
    };

    it('throws BadRequestException when entryIds is empty', async () => {
      await expect(
        service.createSaleGroup('user-1', { ...baseDto, entryIds: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when some entryIds do not belong to user', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'ube-1' }]); // only 1 of 2

      await expect(service.createSaleGroup('user-1', baseDto)).rejects.toThrow(BadRequestException);
    });

    it('EQUAL distribution: creates equal allocatedAmount per book', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'ube-1' },
        { id: 'ube-2' },
      ]);
      const createdGroup = { id: 'sg-new' };
      (prisma.userSaleGroup.create as jest.Mock).mockResolvedValueOnce(createdGroup);
      (prisma.userSaleEntry.create as jest.Mock).mockResolvedValue({});
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({});
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce({
        ...createdGroup,
        entries: [],
      });

      await service.createSaleGroup('user-1', baseDto);

      const calls = (prisma.userSaleEntry.create as jest.Mock).mock.calls;
      expect(calls.length).toBe(2);
      // equalAmount = Math.round((40/2)*100)/100 = 20
      expect(calls[0][0].data.allocatedAmount).toBe(20);
      expect(calls[1][0].data.allocatedAmount).toBe(20);
    });

    it('CUSTOM distribution: allocatedAmount matches customAmounts per entry', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'ube-1' },
        { id: 'ube-2' },
      ]);
      const createdGroup = { id: 'sg-new' };
      (prisma.userSaleGroup.create as jest.Mock).mockResolvedValueOnce(createdGroup);
      (prisma.userSaleEntry.create as jest.Mock).mockResolvedValue({});
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({});
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce({
        ...createdGroup,
        entries: [],
      });

      const customDto = {
        ...baseDto,
        priceDistribution: 'CUSTOM' as const,
        customAmounts: { 'ube-1': 15, 'ube-2': 25 },
      };

      await service.createSaleGroup('user-1', customDto);

      const calls = (prisma.userSaleEntry.create as jest.Mock).mock.calls;
      const amounts = calls.map((c: any[]) => c[0].data.allocatedAmount);
      expect(amounts).toContain(15);
      expect(amounts).toContain(25);
    });

    it('updates UserBookEntry ownershipStatus to SOLD', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'ube-1' }]);
      (prisma.userSaleGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'sg-new' });
      (prisma.userSaleEntry.create as jest.Mock).mockResolvedValue({});
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({});
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sg-new', entries: [] });

      await service.createSaleGroup('user-1', { ...baseDto, entryIds: ['ube-1'] });

      expect(prisma.userBookEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ube-1' },
          data: expect.objectContaining({ ownershipStatus: 'SOLD' }),
        }),
      );
    });

    it('creates OwnershipStatusHistory entries for each book', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'ube-1' },
        { id: 'ube-2' },
      ]);
      (prisma.userSaleGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'sg-new' });
      (prisma.userSaleEntry.create as jest.Mock).mockResolvedValue({});
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({});
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'sg-new', entries: [] });

      await service.createSaleGroup('user-1', baseDto);

      expect(prisma.ownershipStatusHistory.create).toHaveBeenCalledTimes(2);
      expect(prisma.ownershipStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userBookEntryId: 'ube-1', status: 'SOLD' } }),
      );
    });
  });

  // ── updateSaleGroup ─────────────────────────────────────────────────────────

  describe('updateSaleGroup', () => {
    const existingGroup = {
      id: 'sg-1',
      userId: 'user-1',
      totalAmount: 40,
      currency: 'USD',
      priceDistribution: 'EQUAL',
      entries: [
        { id: 'se-1', userBookEntryId: 'ube-1', allocatedAmount: 20 },
        { id: 'se-2', userBookEntryId: 'ube-2', allocatedAmount: 20 },
      ],
    };

    it('throws NotFoundException when group not found', async () => {
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.updateSaleGroup('user-1', 'sg-x', {})).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when group belongs to different user', async () => {
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce({
        ...existingGroup,
        userId: 'other-user',
      });

      await expect(service.updateSaleGroup('user-1', 'sg-1', {})).rejects.toThrow(ForbiddenException);
    });

    it('EQUAL distribution: redistributes equally when totalAmount changes', async () => {
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce(existingGroup);
      (prisma.userSaleGroup.update as jest.Mock).mockResolvedValueOnce({ ...existingGroup, entries: [] });
      (prisma.userSaleEntry.update as jest.Mock).mockResolvedValue({});
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({});

      await service.updateSaleGroup('user-1', 'sg-1', { totalAmount: 60 });

      // new equalAmount = Math.round((60/2)*100)/100 = 30
      const calls = (prisma.userSaleEntry.update as jest.Mock).mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0][0].data.allocatedAmount).toBe(30);
      expect(calls[1][0].data.allocatedAmount).toBe(30);
    });

    it('CUSTOM distribution: redistributes proportionally when totalAmount changes', async () => {
      const customGroup = {
        ...existingGroup,
        priceDistribution: 'CUSTOM',
        entries: [
          { id: 'se-1', userBookEntryId: 'ube-1', allocatedAmount: 10 },
          { id: 'se-2', userBookEntryId: 'ube-2', allocatedAmount: 30 },
        ],
      };
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce(customGroup);
      (prisma.userSaleGroup.update as jest.Mock).mockResolvedValueOnce({ ...customGroup, entries: [] });
      (prisma.userSaleEntry.update as jest.Mock).mockResolvedValue({});
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({});

      await service.updateSaleGroup('user-1', 'sg-1', { totalAmount: 80 });

      // se-1: (10/40)*80 = 20; se-2: (30/40)*80 = 60
      const calls = (prisma.userSaleEntry.update as jest.Mock).mock.calls;
      const amounts = calls.map((c: any[]) => c[0].data.allocatedAmount);
      expect(amounts).toContain(20);
      expect(amounts).toContain(60);
    });

    it('only currency changes — updates saleCurrency on book entries without redistribution', async () => {
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce(existingGroup);
      (prisma.userSaleGroup.update as jest.Mock).mockResolvedValueOnce({ ...existingGroup, entries: [] });
      (prisma.userSaleEntry.update as jest.Mock).mockResolvedValue({});
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({});

      await service.updateSaleGroup('user-1', 'sg-1', { currency: 'GBP' });

      expect(prisma.userSaleEntry.update).not.toHaveBeenCalled();
      expect(prisma.userBookEntry.update).toHaveBeenCalledTimes(2);
      expect(prisma.userBookEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { saleCurrency: 'GBP' } }),
      );
    });

    it('no redistribution when totalAmount unchanged', async () => {
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce(existingGroup);
      (prisma.userSaleGroup.update as jest.Mock).mockResolvedValueOnce({ ...existingGroup, entries: [] });

      await service.updateSaleGroup('user-1', 'sg-1', { totalAmount: 40 }); // same amount

      expect(prisma.userSaleEntry.update).not.toHaveBeenCalled();
    });
  });

  // ── deleteSaleGroup ─────────────────────────────────────────────────────────

  describe('deleteSaleGroup', () => {
    it('throws NotFoundException when not found', async () => {
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.deleteSaleGroup('user-1', 'sg-x')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when group belongs to different user', async () => {
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'sg-1',
        userId: 'other-user',
      });

      await expect(service.deleteSaleGroup('user-1', 'sg-1')).rejects.toThrow(ForbiddenException);
    });

    it('restores books to OWNED status and nulls sale fields', async () => {
      (prisma.userSaleGroup.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'sg-1',
        userId: 'user-1',
      });
      (prisma.userSaleEntry.findMany as jest.Mock).mockResolvedValueOnce([
        { userBookEntryId: 'ube-1' },
        { userBookEntryId: 'ube-2' },
      ]);
      (prisma.userBookEntry.updateMany as jest.Mock).mockResolvedValueOnce({ count: 2 });
      (prisma.userSaleGroup.delete as jest.Mock).mockResolvedValueOnce({});

      await service.deleteSaleGroup('user-1', 'sg-1');

      expect(prisma.userBookEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ube-1', 'ube-2'] } },
        data: {
          ownershipStatus: 'OWNED',
          salePrice: null,
          saleCurrency: null,
          saleDate: null,
          saleVenue: null,
        },
      });
      expect(prisma.userSaleGroup.delete).toHaveBeenCalledWith({ where: { id: 'sg-1' } });
    });
  });
});
