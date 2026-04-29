import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { SpendingService } from './spending.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FeesService } from '../fees/fees.service';
import { CurrencyService } from '../currency/currency.service';

describe('SpendingService', () => {
  let service: SpendingService;
  let prisma: DeepMockProxy<PrismaService>;
  let feesService: DeepMockProxy<FeesService>;
  let currencyService: DeepMockProxy<CurrencyService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    feesService = mockDeep<FeesService>();
    currencyService = mockDeep<CurrencyService>();
    service = new SpendingService(
      prisma as unknown as PrismaService,
      feesService as unknown as FeesService,
      currencyService as unknown as CurrencyService,
    );
  });

  // ─── addTransaction ────────────────────────────────────────────────────────

  describe('addTransaction', () => {
    it('should create a transaction with correct data', async () => {
      const created = { id: 't1', userId: 'u1', amount: 29.99, currency: 'USD', purchasedAt: new Date() };
      prisma.purchaseTransaction.create.mockResolvedValue(created as any);

      const result = await service.addTransaction('u1', {
        amount: 29.99,
        currency: 'USD',
        purchasedAt: '2024-01-15',
        notes: 'Test book',
      });

      expect(result).toBe(created);
      expect(prisma.purchaseTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            amount: 29.99,
            currency: 'USD',
            description: 'Test book',
          }),
        }),
      );
    });
  });

  // ─── updateTransaction ─────────────────────────────────────────────────────

  describe('updateTransaction', () => {
    it('should throw NotFoundException if transaction not found', async () => {
      prisma.purchaseTransaction.findUnique.mockResolvedValue(null);
      await expect(
        service.updateTransaction('u1', 'missing-id', { amount: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the transaction', async () => {
      prisma.purchaseTransaction.findUnique.mockResolvedValue({ id: 't1', userId: 'other-user' } as any);
      await expect(
        service.updateTransaction('u1', 't1', { amount: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update only provided fields', async () => {
      prisma.purchaseTransaction.findUnique.mockResolvedValue({ id: 't1', userId: 'u1' } as any);
      prisma.purchaseTransaction.update.mockResolvedValue({ id: 't1' } as any);

      await service.updateTransaction('u1', 't1', { amount: 55.0 });

      const updateCall = prisma.purchaseTransaction.update.mock.calls[0][0];
      expect(updateCall.data).toHaveProperty('amount', 55.0);
      expect(updateCall.data).not.toHaveProperty('currency'); // not provided
    });
  });

  // ─── deleteTransaction ─────────────────────────────────────────────────────

  describe('deleteTransaction', () => {
    it('should throw NotFoundException if transaction does not exist', async () => {
      prisma.purchaseTransaction.findUnique.mockResolvedValue(null);
      await expect(service.deleteTransaction('u1', 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the transaction', async () => {
      prisma.purchaseTransaction.findUnique.mockResolvedValue({ id: 't1', userId: 'someone-else' } as any);
      await expect(service.deleteTransaction('u1', 't1')).rejects.toThrow(ForbiddenException);
    });

    it('should delete the transaction when ownership is valid', async () => {
      prisma.purchaseTransaction.findUnique.mockResolvedValue({ id: 't1', userId: 'u1' } as any);
      prisma.purchaseTransaction.delete.mockResolvedValue({ id: 't1' } as any);

      await service.deleteTransaction('u1', 't1');
      expect(prisma.purchaseTransaction.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });
  });

  // ─── getSpendingStats ──────────────────────────────────────────────────────

  describe('getSpendingStats', () => {
    it('should sum transactions, fees, and subtract discounts + refunds', async () => {
      const now = new Date();
      prisma.purchaseTransaction.findMany.mockResolvedValue([
        { id: 't1', amount: 100, purchasedAt: now },
        { id: 't2', amount: 50, purchasedAt: now },
      ] as any);

      feesService.getFeesForStats.mockResolvedValue([{ amount: 10, date: now }] as any);
      feesService.getDiscountsForStats.mockResolvedValue([{ amount: 20, date: now }] as any);
      feesService.getRefundsForStats.mockResolvedValue([{ amount: 5, date: now }] as any);

      const result = await service.getSpendingStats('u1');

      // total = 100 + 50 + 10 - 20 - 5 = 135
      expect(result.totalAmount).toBe(135);
    });

    it('should group amounts by year correctly', async () => {
      const date2023 = new Date('2023-06-01');
      const date2024 = new Date('2024-06-01');

      prisma.purchaseTransaction.findMany.mockResolvedValue([
        { id: 't1', amount: 100, purchasedAt: date2023 },
        { id: 't2', amount: 200, purchasedAt: date2024 },
      ] as any);

      feesService.getFeesForStats.mockResolvedValue([]);
      feesService.getDiscountsForStats.mockResolvedValue([]);
      feesService.getRefundsForStats.mockResolvedValue([]);

      const result = await service.getSpendingStats('u1');

      const yearMap = Object.fromEntries(result.byYear.map((e) => [e.year, e.amount]));
      expect(yearMap[2023]).toBe(100);
      expect(yearMap[2024]).toBe(200);
    });

    it('should return empty stats when no transactions', async () => {
      prisma.purchaseTransaction.findMany.mockResolvedValue([]);
      feesService.getFeesForStats.mockResolvedValue([]);
      feesService.getDiscountsForStats.mockResolvedValue([]);
      feesService.getRefundsForStats.mockResolvedValue([]);

      const result = await service.getSpendingStats('u1');

      expect(result.totalAmount).toBe(0);
      expect(result.byYear).toHaveLength(0);
      expect(result.byMonth).toHaveLength(0);
    });
  });
});
