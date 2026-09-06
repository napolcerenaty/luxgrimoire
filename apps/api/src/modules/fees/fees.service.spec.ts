import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { FeesService } from './fees.service';

const USER = 'user-1';
const OTHER = 'user-2';

describe('FeesService', () => {
  let service: FeesService;
  let prisma: DeepMockProxy<PrismaService>;
  let stats: { markStatsStale: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    stats = { markStatsStale: jest.fn() };
    service = new FeesService(prisma, stats as unknown as StatsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Fee templates ──────────────────────────────────────────────────────────

  describe('getTemplates', () => {
    it('scopes to the user and only filters isActive when activeOnly is set', async () => {
      (prisma.userFeeTemplate.findMany as jest.Mock).mockResolvedValue([]);

      await service.getTemplates(USER);
      expect((prisma.userFeeTemplate.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        userId: USER,
      });

      await service.getTemplates(USER, true);
      expect((prisma.userFeeTemplate.findMany as jest.Mock).mock.calls[1][0].where).toEqual({
        userId: USER,
        isActive: true,
      });
    });
  });

  describe('createTemplate', () => {
    it('applies the OTHER / null / PLN defaults when the DTO omits them', async () => {
      (prisma.userFeeTemplate.create as jest.Mock).mockResolvedValue({ id: 't1' });

      await service.createTemplate(USER, { name: 'Shipping' } as any);

      expect((prisma.userFeeTemplate.create as jest.Mock).mock.calls[0][0].data).toEqual({
        userId: USER,
        name: 'Shipping',
        category: 'OTHER',
        defaultAmount: null,
        defaultCurrency: 'PLN',
      });
    });

    it('passes explicit DTO values through unchanged', async () => {
      (prisma.userFeeTemplate.create as jest.Mock).mockResolvedValue({ id: 't1' });

      await service.createTemplate(USER, {
        name: 'Customs',
        category: 'CUSTOMS',
        defaultAmount: 15,
        defaultCurrency: 'USD',
      } as any);

      expect((prisma.userFeeTemplate.create as jest.Mock).mock.calls[0][0].data).toEqual({
        userId: USER,
        name: 'Customs',
        category: 'CUSTOMS',
        defaultAmount: 15,
        defaultCurrency: 'USD',
      });
    });
  });

  describe('updateTemplate', () => {
    it('throws NotFoundException when the template does not exist', async () => {
      (prisma.userFeeTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.updateTemplate(USER, 't1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the template belongs to another user', async () => {
      (prisma.userFeeTemplate.findUnique as jest.Mock).mockResolvedValue({ id: 't1', userId: OTHER });
      await expect(service.updateTemplate(USER, 't1', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('only writes the fields present in the DTO', async () => {
      (prisma.userFeeTemplate.findUnique as jest.Mock).mockResolvedValue({ id: 't1', userId: USER });
      (prisma.userFeeTemplate.update as jest.Mock).mockResolvedValue({ id: 't1' });

      await service.updateTemplate(USER, 't1', { name: 'Renamed' } as any);

      expect((prisma.userFeeTemplate.update as jest.Mock).mock.calls[0][0].data).toEqual({
        name: 'Renamed',
      });
    });
  });

  describe('deleteTemplate', () => {
    it('throws NotFoundException when missing', async () => {
      (prisma.userFeeTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.deleteTemplate(USER, 't1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a template owned by someone else', async () => {
      (prisma.userFeeTemplate.findUnique as jest.Mock).mockResolvedValue({ id: 't1', userId: OTHER });
      await expect(service.deleteTemplate(USER, 't1')).rejects.toThrow(ForbiddenException);
    });

    it('deletes the row on success', async () => {
      (prisma.userFeeTemplate.findUnique as jest.Mock).mockResolvedValue({ id: 't1', userId: USER });
      await service.deleteTemplate(USER, 't1');
      expect(prisma.userFeeTemplate.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });
  });

  // ── Purchase fees ──────────────────────────────────────────────────────────

  describe('getPurchaseFees', () => {
    it('adds billingPeriodId / purchaseGroupId to the filter only when provided', async () => {
      (prisma.userPurchaseFee.findMany as jest.Mock).mockResolvedValue([]);

      await service.getPurchaseFees(USER);
      expect((prisma.userPurchaseFee.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        userId: USER,
      });

      await service.getPurchaseFees(USER, { billingPeriodId: 'bp1', purchaseGroupId: 'pg1' });
      expect((prisma.userPurchaseFee.findMany as jest.Mock).mock.calls[1][0].where).toEqual({
        userId: USER,
        billingPeriodId: 'bp1',
        purchaseGroupId: 'pg1',
      });
    });
  });

  describe('createPurchaseFee', () => {
    it('coerces the date, defaults optional fields and marks that year stale', async () => {
      (prisma.userPurchaseFee.create as jest.Mock).mockResolvedValue({ id: 'f1' });

      await service.createPurchaseFee(USER, {
        name: 'Postage',
        amount: 12,
        currency: 'PLN',
        date: '2024-06-15',
      } as any);

      const data = (prisma.userPurchaseFee.create as jest.Mock).mock.calls[0][0].data;
      expect(data).toMatchObject({
        userId: USER,
        name: 'Postage',
        amount: 12,
        currency: 'PLN',
        category: 'OTHER',
        feeTemplateId: null,
        billingPeriodId: null,
        purchaseGroupId: null,
        notes: null,
      });
      expect(data.date).toEqual(new Date('2024-06-15'));
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER, [2024]);
    });
  });

  describe('updatePurchaseFee', () => {
    it('throws NotFoundException / ForbiddenException like the other mutations', async () => {
      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.updatePurchaseFee(USER, 'f1', {} as any)).rejects.toThrow(NotFoundException);

      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'f1',
        userId: OTHER,
        date: new Date('2024-01-01'),
      });
      await expect(service.updatePurchaseFee(USER, 'f1', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('marks both the old and the new year stale when the date changes', async () => {
      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValue({
        id: 'f1',
        userId: USER,
        date: new Date('2024-01-01'),
      });
      (prisma.userPurchaseFee.update as jest.Mock).mockResolvedValue({ id: 'f1' });

      await service.updatePurchaseFee(USER, 'f1', { date: '2026-03-03' } as any);

      expect(stats.markStatsStale).toHaveBeenCalledWith(USER, [2024, 2026]);
    });

    it('marks only the existing year stale when the date is untouched', async () => {
      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValue({
        id: 'f1',
        userId: USER,
        date: new Date('2024-01-01'),
      });
      (prisma.userPurchaseFee.update as jest.Mock).mockResolvedValue({ id: 'f1' });

      await service.updatePurchaseFee(USER, 'f1', { amount: 5 } as any);

      expect(stats.markStatsStale).toHaveBeenCalledWith(USER, [2024]);
    });
  });

  describe('deletePurchaseFee', () => {
    it('rejects an unknown or non-owned fee', async () => {
      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.deletePurchaseFee(USER, 'f1')).rejects.toThrow(NotFoundException);

      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'f1',
        userId: OTHER,
        date: new Date('2024-01-01'),
      });
      await expect(service.deletePurchaseFee(USER, 'f1')).rejects.toThrow(ForbiddenException);
    });

    it('deletes and marks the fee year stale', async () => {
      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValue({
        id: 'f1',
        userId: USER,
        date: new Date('2025-07-01'),
      });

      await service.deletePurchaseFee(USER, 'f1');

      expect(prisma.userPurchaseFee.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER, [2025]);
    });
  });

  // ── Stats helpers ──────────────────────────────────────────────────────────

  describe('stats helpers', () => {
    it('getFeesForStats filters by currency only when supplied', async () => {
      (prisma.userPurchaseFee.findMany as jest.Mock).mockResolvedValue([]);

      await service.getFeesForStats(USER);
      expect((prisma.userPurchaseFee.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        userId: USER,
      });

      await service.getFeesForStats(USER, 'USD');
      expect((prisma.userPurchaseFee.findMany as jest.Mock).mock.calls[1][0].where).toEqual({
        userId: USER,
        currency: 'USD',
      });
    });

    it('getDiscountsForStats / getRefundsForStats apply the same currency filter', async () => {
      (prisma.userPurchaseDiscount.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userPurchaseRefund.findMany as jest.Mock).mockResolvedValue([]);

      await service.getDiscountsForStats(USER, 'EUR');
      await service.getRefundsForStats(USER, 'EUR');

      expect((prisma.userPurchaseDiscount.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        userId: USER,
        currency: 'EUR',
      });
      expect((prisma.userPurchaseRefund.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        userId: USER,
        currency: 'EUR',
      });
    });
  });

  // ── Discounts ──────────────────────────────────────────────────────────────

  describe('discounts', () => {
    it('createDiscount coerces the date, nulls the optional name and marks the year stale', async () => {
      (prisma.userPurchaseDiscount.create as jest.Mock).mockResolvedValue({ id: 'dsc1' });

      await service.createDiscount(USER, { amount: 5, currency: 'PLN', date: '2026-02-02' } as any);

      const data = (prisma.userPurchaseDiscount.create as jest.Mock).mock.calls[0][0].data;
      expect(data.name).toBeNull();
      expect(data.date).toEqual(new Date('2026-02-02'));
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER, [2026]);
    });

    it('updateDiscount enforces ownership', async () => {
      (prisma.userPurchaseDiscount.findUnique as jest.Mock).mockResolvedValue({
        id: 'dsc1',
        userId: OTHER,
        date: new Date('2026-01-01'),
      });
      await expect(service.updateDiscount(USER, 'dsc1', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('deleteDiscount removes the row and marks the year stale', async () => {
      (prisma.userPurchaseDiscount.findUnique as jest.Mock).mockResolvedValue({
        id: 'dsc1',
        userId: USER,
        date: new Date('2023-05-05'),
      });

      await service.deleteDiscount(USER, 'dsc1');

      expect(prisma.userPurchaseDiscount.delete).toHaveBeenCalledWith({ where: { id: 'dsc1' } });
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER, [2023]);
    });
  });

  // ── Refunds ────────────────────────────────────────────────────────────────

  describe('refunds', () => {
    it('createRefund coerces the date and marks the year stale', async () => {
      (prisma.userPurchaseRefund.create as jest.Mock).mockResolvedValue({ id: 'r1' });

      await service.createRefund(USER, {
        amount: 20,
        currency: 'PLN',
        date: '2025-11-11',
        reason: 'damaged',
      } as any);

      const data = (prisma.userPurchaseRefund.create as jest.Mock).mock.calls[0][0].data;
      expect(data).toMatchObject({ userId: USER, amount: 20, currency: 'PLN', reason: 'damaged' });
      expect(data.date).toEqual(new Date('2025-11-11'));
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER, [2025]);
    });

    it('deleteRefund enforces ownership and marks the year stale', async () => {
      (prisma.userPurchaseRefund.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'r1',
        userId: OTHER,
        date: new Date('2025-01-01'),
      });
      await expect(service.deleteRefund(USER, 'r1')).rejects.toThrow(ForbiddenException);

      (prisma.userPurchaseRefund.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'r1',
        userId: USER,
        date: new Date('2025-01-01'),
      });
      await service.deleteRefund(USER, 'r1');
      expect(prisma.userPurchaseRefund.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(stats.markStatsStale).toHaveBeenLastCalledWith(USER, [2025]);
    });
  });
});
