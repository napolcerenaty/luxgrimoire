/**
 * Service-level tests for price change operations in SubscriptionsService.
 *
 * Covers:
 *  1. computeCurrentPrice (private) — prefill logic for displaying subscription price
 *  2. listPriceChanges — sentinel excluded, ordered list returned
 *  3. createPriceChange — upsert with correct compound key, cache cleared
 *  4. deletePriceChange — delete + cache clear; errors for missing, wrong-sub, sentinel
 *
 * Note: nextRenewalPriceChanged notification is driven by resolveEffectiveBasePrice —
 * see price-change.util.spec.ts for comprehensive trigger-condition tests.
 */

import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUB_ID = 'sub-id-1';
const SUB_SLUG = 'test-subscription';

function makePriceChange(
  overrides: Partial<{
    id: string;
    subscriptionId: string;
    effectiveYear: number;
    effectiveMonth: number;
    currency: string;
    newBasePrice: { toString(): string };
    notes: string | null;
  }> = {},
) {
  return {
    id: 'pc-1',
    subscriptionId: SUB_ID,
    effectiveYear: 2024,
    effectiveMonth: 6,
    currency: 'EUR',
    newBasePrice: { toString: () => '15.00' },
    notes: null,
    ...overrides,
  };
}

function makePriceChangeInput(
  overrides: Partial<{
    effectiveYear: number;
    effectiveMonth: number;
    newBasePrice: number;
    currency: string;
    notes: string;
  }> = {},
) {
  return {
    effectiveYear: 2024,
    effectiveMonth: 6,
    newBasePrice: 15.0,
    currency: 'EUR',
    notes: undefined,
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SubscriptionsService — price changes', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { del: jest.Mock; get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    service = new SubscriptionsService(
      prisma,
      {} as any, // TypesenseService
      {} as any, // SkipPolicyEngine
      {} as any, // RenewalCronService
      {} as any, // CountryFeeSnapshotCronService
      {} as any, // UploadService
      {} as any, // CrowdStatsService
      { markStatsStale: jest.fn() } as any, // StatsService
      cache as any,
    );
    // Avoid cache+DB complexity for findBySlug — tested in dedicated findBySlug tests
    jest
      .spyOn(service, 'findBySlug')
      .mockResolvedValue({ id: SUB_ID, slug: SUB_SLUG } as any);
  });

  // ── computeCurrentPrice ─────────────────────────────────────────────────────

  describe('computeCurrentPrice — prefill / display logic', () => {
    const call = (changes: { effectiveYear: number; effectiveMonth: number; newBasePrice: { toString(): string } }[]) =>
      (service as any).computeCurrentPrice(changes);

    it('returns null when no price change records exist', () => {
      expect(call([])).toBeNull();
    });

    it('returns sentinel price when only the sentinel record (1900-01) exists', () => {
      const changes = [
        { effectiveYear: 1900, effectiveMonth: 1, newBasePrice: { toString: () => '10.00' } },
      ];
      expect(call(changes)).toBe('10.00');
    });

    it('returns most recent explicit change instead of sentinel', () => {
      const changes = [
        { effectiveYear: 1900, effectiveMonth: 1, newBasePrice: { toString: () => '10.00' } },
        { effectiveYear: 2024, effectiveMonth: 6, newBasePrice: { toString: () => '15.00' } },
      ];
      expect(call(changes)).toBe('15.00');
    });

    it('returns most recent explicit change when multiple explicit changes exist', () => {
      const changes = [
        { effectiveYear: 1900, effectiveMonth: 1, newBasePrice: { toString: () => '10.00' } },
        { effectiveYear: 2022, effectiveMonth: 3, newBasePrice: { toString: () => '12.00' } },
        { effectiveYear: 2024, effectiveMonth: 6, newBasePrice: { toString: () => '15.00' } },
        { effectiveYear: 2023, effectiveMonth: 9, newBasePrice: { toString: () => '13.00' } },
      ];
      expect(call(changes)).toBe('15.00'); // 2024-06 is most recent
    });

    it('returns most recent month when multiple changes exist in the same year', () => {
      const changes = [
        { effectiveYear: 2024, effectiveMonth: 1, newBasePrice: { toString: () => '12.00' } },
        { effectiveYear: 2024, effectiveMonth: 9, newBasePrice: { toString: () => '16.00' } },
        { effectiveYear: 2024, effectiveMonth: 3, newBasePrice: { toString: () => '13.00' } },
      ];
      expect(call(changes)).toBe('16.00'); // month 9 is most recent
    });

    it('formats price to exactly 2 decimal places', () => {
      const changes = [
        { effectiveYear: 2024, effectiveMonth: 6, newBasePrice: { toString: () => '15.5' } },
      ];
      expect(call(changes)).toBe('15.50');
    });

    it('sentinel ignored when any explicit change exists (even older than sentinel for display)', () => {
      const changes = [
        { effectiveYear: 1900, effectiveMonth: 1, newBasePrice: { toString: () => '9.99' } },
        { effectiveYear: 2020, effectiveMonth: 1, newBasePrice: { toString: () => '11.00' } },
      ];
      expect(call(changes)).toBe('11.00');
    });

    it('ignores a price change scheduled for a future month, falling back to sentinel', () => {
      const farFuture = new Date();
      farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 5);
      const changes = [
        { effectiveYear: 1900, effectiveMonth: 1, newBasePrice: { toString: () => '9.99' } },
        { effectiveYear: farFuture.getUTCFullYear(), effectiveMonth: farFuture.getUTCMonth() + 1, newBasePrice: { toString: () => '99.00' } },
      ];
      expect(call(changes)).toBe('9.99');
    });

    it('picks the most recent already-arrived change, ignoring a later future one', () => {
      const farFuture = new Date();
      farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 5);
      const changes = [
        { effectiveYear: 1900, effectiveMonth: 1, newBasePrice: { toString: () => '9.99' } },
        { effectiveYear: 2024, effectiveMonth: 6, newBasePrice: { toString: () => '15.00' } },
        { effectiveYear: farFuture.getUTCFullYear(), effectiveMonth: farFuture.getUTCMonth() + 1, newBasePrice: { toString: () => '99.00' } },
      ];
      expect(call(changes)).toBe('15.00');
    });
  });

  // ── listPriceChanges ────────────────────────────────────────────────────────

  describe('listPriceChanges', () => {
    it('queries DB with correct subscriptionId and excludes sentinel year=1900', async () => {
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([
        makePriceChange(),
      ]);

      const result = await service.listPriceChanges(SUB_SLUG);

      expect(prisma.subscriptionPriceChange.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subscriptionId: SUB_ID,
            NOT: { effectiveYear: 1900 },
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('returns results ordered by year asc then month asc', async () => {
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([]);

      await service.listPriceChanges(SUB_SLUG);

      expect(prisma.subscriptionPriceChange.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ currency: 'asc' }, { effectiveYear: 'asc' }, { effectiveMonth: 'asc' }],
        }),
      );
    });

    it('returns empty array when no explicit price changes exist', async () => {
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.listPriceChanges(SUB_SLUG);

      expect(result).toEqual([]);
    });

    it('returns multiple price changes in order', async () => {
      const changes = [
        makePriceChange({ effectiveYear: 2022, effectiveMonth: 1 }),
        makePriceChange({ id: 'pc-2', effectiveYear: 2023, effectiveMonth: 6 }),
        makePriceChange({ id: 'pc-3', effectiveYear: 2024, effectiveMonth: 3 }),
      ];
      (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValue(changes);

      const result = await service.listPriceChanges(SUB_SLUG);

      expect(result).toHaveLength(3);
    });

    it('throws NotFoundException when subscription is not found', async () => {
      jest.spyOn(service, 'findBySlug').mockRejectedValue(new NotFoundException());

      await expect(service.listPriceChanges('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── createPriceChange ───────────────────────────────────────────────────────

  describe('createPriceChange', () => {
    it('upserts with correct compound unique key', async () => {
      const dto = makePriceChangeInput();
      const created = makePriceChange();
      (prisma.subscriptionPriceChange.upsert as jest.Mock).mockResolvedValue(created);

      await service.createPriceChange(SUB_SLUG, dto as any);

      expect(prisma.subscriptionPriceChange.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            subscriptionId_effectiveYear_effectiveMonth_currency: {
              subscriptionId: SUB_ID,
              effectiveYear: 2024,
              effectiveMonth: 6,
              currency: 'EUR',
            },
          },
        }),
      );
    });

    it('create block includes all required fields', async () => {
      const dto = makePriceChangeInput({ notes: 'Annual adjustment' });
      (prisma.subscriptionPriceChange.upsert as jest.Mock).mockResolvedValue(makePriceChange());

      await service.createPriceChange(SUB_SLUG, dto as any);

      expect(prisma.subscriptionPriceChange.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            subscriptionId: SUB_ID,
            effectiveYear: 2024,
            effectiveMonth: 6,
            newBasePrice: 15.0,
            currency: 'EUR',
            notes: 'Annual adjustment',
          }),
        }),
      );
    });

    it('update block updates price, currency, and notes', async () => {
      const dto = makePriceChangeInput({ notes: 'Price correction' });
      (prisma.subscriptionPriceChange.upsert as jest.Mock).mockResolvedValue(makePriceChange());

      await service.createPriceChange(SUB_SLUG, dto as any);

      expect(prisma.subscriptionPriceChange.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            newBasePrice: 15.0,
            currency: 'EUR',
            notes: 'Price correction',
          }),
        }),
      );
    });

    it('returns the upserted price change record', async () => {
      const expected = makePriceChange();
      (prisma.subscriptionPriceChange.upsert as jest.Mock).mockResolvedValue(expected);

      const result = await service.createPriceChange(SUB_SLUG, makePriceChangeInput() as any);

      expect(result).toBe(expected);
    });

    it('clears subscription cache after upsert', async () => {
      (prisma.subscriptionPriceChange.upsert as jest.Mock).mockResolvedValue(makePriceChange());

      await service.createPriceChange(SUB_SLUG, makePriceChangeInput() as any);

      expect(cache.del).toHaveBeenCalledWith(`subscriptions:slug:${SUB_SLUG}`);
    });

    it('throws NotFoundException when subscription does not exist', async () => {
      jest.spyOn(service, 'findBySlug').mockRejectedValue(new NotFoundException());

      await expect(
        service.createPriceChange('nonexistent', makePriceChangeInput() as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates existing record when same year/month/currency already exists (upsert semantics)', async () => {
      const dto = makePriceChangeInput({ newBasePrice: 18.0 });
      const updated = makePriceChange({ newBasePrice: { toString: () => '18.00' } });
      (prisma.subscriptionPriceChange.upsert as jest.Mock).mockResolvedValue(updated);

      const result = await service.createPriceChange(SUB_SLUG, dto as any);

      // Upsert is called once regardless of whether record exists
      expect(prisma.subscriptionPriceChange.upsert).toHaveBeenCalledTimes(1);
      expect(result).toBe(updated);
    });

    it('stores null notes when notes is not provided in DTO', async () => {
      const dto = makePriceChangeInput(); // notes: undefined
      (prisma.subscriptionPriceChange.upsert as jest.Mock).mockResolvedValue(makePriceChange());

      await service.createPriceChange(SUB_SLUG, dto as any);

      expect(prisma.subscriptionPriceChange.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ notes: null }),
          update: expect.objectContaining({ notes: null }),
        }),
      );
    });
  });

  // ── deletePriceChange ───────────────────────────────────────────────────────

  describe('deletePriceChange', () => {
    it('deletes the price change record', async () => {
      const change = makePriceChange({ id: 'pc-del', subscriptionId: SUB_ID });
      (prisma.subscriptionPriceChange.findUnique as jest.Mock).mockResolvedValue(change);
      (prisma.subscriptionPriceChange.delete as jest.Mock).mockResolvedValue(change);

      await service.deletePriceChange(SUB_SLUG, 'pc-del');

      expect(prisma.subscriptionPriceChange.delete).toHaveBeenCalledWith({
        where: { id: 'pc-del' },
      });
    });

    it('clears subscription cache after deletion', async () => {
      const change = makePriceChange({ id: 'pc-del', subscriptionId: SUB_ID });
      (prisma.subscriptionPriceChange.findUnique as jest.Mock).mockResolvedValue(change);
      (prisma.subscriptionPriceChange.delete as jest.Mock).mockResolvedValue(change);

      await service.deletePriceChange(SUB_SLUG, 'pc-del');

      expect(cache.del).toHaveBeenCalledWith(`subscriptions:slug:${SUB_SLUG}`);
    });

    it('throws NotFoundException when price change record does not exist', async () => {
      (prisma.subscriptionPriceChange.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deletePriceChange(SUB_SLUG, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when price change belongs to a different subscription', async () => {
      const change = makePriceChange({ id: 'pc-1', subscriptionId: 'OTHER-SUB-ID' });
      (prisma.subscriptionPriceChange.findUnique as jest.Mock).mockResolvedValue(change);

      await expect(service.deletePriceChange(SUB_SLUG, 'pc-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when attempting to delete sentinel record (year=1900, month=1)', async () => {
      const sentinel = makePriceChange({
        id: 'sentinel',
        subscriptionId: SUB_ID,
        effectiveYear: 1900,
        effectiveMonth: 1,
      });
      (prisma.subscriptionPriceChange.findUnique as jest.Mock).mockResolvedValue(sentinel);

      await expect(service.deletePriceChange(SUB_SLUG, 'sentinel')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('does NOT delete when subscription lookup fails', async () => {
      jest.spyOn(service, 'findBySlug').mockRejectedValue(new NotFoundException());

      await expect(service.deletePriceChange('nonexistent', 'pc-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.subscriptionPriceChange.delete).not.toHaveBeenCalled();
    });

    it('non-sentinel 1900 record (month≠1) is deletable — only exact (1900, 1) sentinel is protected', async () => {
      // In practice this situation should not arise, but the guard is explicit:
      // effectiveYear === 1900 && effectiveMonth === 1 → rejected; anything else → allowed
      const change = makePriceChange({
        id: 'odd-1900',
        subscriptionId: SUB_ID,
        effectiveYear: 1900,
        effectiveMonth: 6,
      });
      (prisma.subscriptionPriceChange.findUnique as jest.Mock).mockResolvedValue(change);
      (prisma.subscriptionPriceChange.delete as jest.Mock).mockResolvedValue(change);

      await expect(service.deletePriceChange(SUB_SLUG, 'odd-1900')).resolves.toBeUndefined();
    });
  });
});
