/**
 * Unit tests for SubscriptionsService.joinSubscription()
 *
 * After the subscription-entry-per-period refactor:
 * - active entries are checked via findFirst({ userId, subscriptionId, active: true })
 * - joining always creates a new UserSubscriptionEntry row
 * - there is no separate membership history table
 */

import { ConflictException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';
import { JoinSubscriptionDto } from './subscriptions.dto';

const SUB_ID = 'sub-join-1';
const SUB_SLUG = 'join-test-sub';
const USER_ID = 'user-join-1';
const ENTRY_ID = 'entry-join-1';

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Join Test Sub',
    isCombo: false,
    componentIds: [],
    currency: 'GBP',
    renewalDay: 1,
    renewalDayUserSet: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    renewalMonthOffset: 0,
    isContentStream: false,
    startDate: null,
    parentSubscriptionId: null,
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    active: true,
    startDate: '2024-01-01',
    cancellationDate: null,
    cancellationReason: null,
    basePrice: '20.00',
    costCurrency: 'GBP',
    shippingCost: null,
    renewalDay: 1,
    billingPeriods: [],
    feeTemplates: [],
    ...overrides,
  };
}

function makeJoinDto(overrides: Partial<JoinSubscriptionDto> = {}): JoinSubscriptionDto {
  return {
    startDate: '2025-01-01',
    ...overrides,
  } as JoinSubscriptionDto;
}

describe('SubscriptionsService — joinSubscription', () => {
  let service: SubscriptionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let crowdStatsMock: { incrementSubscriberCount: jest.Mock; decrementSubscriberCount: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    crowdStatsMock = {
      incrementSubscriberCount: jest.fn().mockResolvedValue(undefined),
      decrementSubscriberCount: jest.fn().mockResolvedValue(undefined),
    };

    service = new SubscriptionsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any, // CountryFeeSnapshotCronService
      {} as any,
      crowdStatsMock as any,
      { markStatsStale: jest.fn() } as any,
      { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,
    );
  });

  describe('first join (no existing entry)', () => {
    function setup() {
      const sub = makeSub();
      const createdEntry = makeEntry({ active: true, startDate: '2025-01-01' });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionEntry.create as jest.Mock).mockResolvedValueOnce(createdEntry);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      return { sub, createdEntry };
    }

    it('creates a new entry via create', async () => {
      const { createdEntry } = setup();
      const result = await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto());
      expect(prisma.userSubscriptionEntry.create).toHaveBeenCalled();
      expect(prisma.userSubscriptionEntry.upsert).not.toHaveBeenCalled();
      expect(result.entry.id).toBe(createdEntry.id);
    });

    it('does NOT call history create (no history table in new model)', async () => {
      setup();
      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto());
      expect(prisma.userSubscriptionEntry.create).toHaveBeenCalled();
    });

    it('increments subscriber count', async () => {
      setup();
      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto());
      expect(crowdStatsMock.incrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });

    it('returns entry with active=true', async () => {
      setup();
      const result = await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto());
      expect(result.entry.active).toBe(true);
    });

    it('returns eligibleMonths array', async () => {
      setup();
      const result = await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto());
      expect(Array.isArray(result.eligibleMonths)).toBe(true);
    });
  });

  describe('rejoin after cancellation', () => {
    function setup() {
      const sub = makeSub();
      const createdEntry = makeEntry({ id: 'entry-join-2', active: true, startDate: '2025-01-01' });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionEntry.create as jest.Mock).mockResolvedValueOnce(createdEntry);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      return { createdEntry };
    }

    it('creates a new entry when rejoining after cancellation', async () => {
      const { createdEntry } = setup();
      const result = await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto());
      expect(prisma.userSubscriptionEntry.create).toHaveBeenCalled();
      expect(prisma.userSubscriptionEntry.upsert).not.toHaveBeenCalled();
      expect(result.entry.id).toBe(createdEntry.id);
    });

    it('increments subscriber count on rejoin', async () => {
      setup();
      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto());
      expect(crowdStatsMock.incrementSubscriberCount).toHaveBeenCalledWith(SUB_ID);
    });
  });

  describe('joining when already active', () => {
    it('throws ConflictException', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry({ active: true }));

      await expect(service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto())).rejects.toThrow(ConflictException);
    });

    it('does not create any DB records', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry({ active: true }));

      await expect(service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto())).rejects.toThrow(ConflictException);

      expect(prisma.userSubscriptionEntry.create).not.toHaveBeenCalled();
      expect(prisma.userSubscriptionEntry.upsert).not.toHaveBeenCalled();
    });
  });

  describe('joining with alreadyCancelled=true (historical entry)', () => {
    function setup() {
      const sub = makeSub();
      const historicalEntry = makeEntry({
        active: false,
        startDate: '2023-01-01',
        cancellationDate: '2023-12-31',
      });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionEntry.create as jest.Mock).mockResolvedValueOnce(historicalEntry);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      return { historicalEntry };
    }

    it('creates entry with active=false', async () => {
      setup();
      const dto = makeJoinDto({
        alreadyCancelled: true,
        startDate: '2023-01-01',
        cancellationDate: '2023-12-31',
      });
      const result = await service.joinSubscription(USER_ID, SUB_SLUG, dto);
      expect(result.entry.active).toBe(false);
    });

    it('uses create for already-cancelled entries', async () => {
      setup();
      const dto = makeJoinDto({
        alreadyCancelled: true,
        startDate: '2023-01-01',
        cancellationDate: '2023-12-31',
      });
      await service.joinSubscription(USER_ID, SUB_SLUG, dto);
      expect(prisma.userSubscriptionEntry.create).toHaveBeenCalled();
      expect(prisma.userSubscriptionEntry.upsert).not.toHaveBeenCalled();
    });

    it('does NOT increment subscriber count for already-cancelled entries', async () => {
      setup();
      const dto = makeJoinDto({
        alreadyCancelled: true,
        startDate: '2023-01-01',
        cancellationDate: '2023-12-31',
      });
      await service.joinSubscription(USER_ID, SUB_SLUG, dto);
      expect(crowdStatsMock.incrementSubscriberCount).not.toHaveBeenCalled();
    });
  });

  describe('dryRun=true', () => {
    it('returns eligible months without persisting anything', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(makeSub() as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      const dto = makeJoinDto({ dryRun: true, startDate: '2025-01-01' });
      const result = await service.joinSubscription(USER_ID, SUB_SLUG, dto);

      expect(result.entry.id).toBe('__preview__');
      expect(prisma.userSubscriptionEntry.create).not.toHaveBeenCalled();
      expect(prisma.userSubscriptionEntry.upsert).not.toHaveBeenCalled();
    });
  });

  // ── renewalMonthOffset does NOT shift first eligible box month ──────────────
  //
  // Bug: getEligibleMonths added renewalMonthOffset to the first eligible date,
  // causing signupIncludesCurrentMonth+offset=1 to show March instead of February.
  // The offset shifts payment dates only — not which months are delivered.

  describe('renewalMonthOffset — eligible months start at correct box month', () => {
    function setupDryRun(subOverrides: Record<string, unknown> = {}) {
      const sub = makeSub({ paymentOnStartup: true, signupIncludesCurrentMonth: true, renewalMonthOffset: 1, renewalDay: 20, ...subOverrides });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
    }

    it('signupIncludesCurrentMonth=true + offset=1: eligible months start in Feb, not March', async () => {
      setupDryRun();
      const dto = makeJoinDto({ dryRun: true, startDate: '2025-02-05' });
      await service.joinSubscription(USER_ID, SUB_SLUG, dto);

      // subscriptionMonth.findMany is called to get eligible months;
      // verify the lower bound is Feb 2025 (month>=2 in year=2025), not March
      const findManyCalls = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
      const eligiblesCall = findManyCalls[0][0];
      const lowerBound = eligiblesCall?.where?.AND?.[0]?.OR;
      expect(lowerBound).toBeDefined();
      // Lower bound: year>2025 OR (year=2025 AND month>=2)
      const sameyearClause = lowerBound.find((c: any) => c.year === 2025);
      expect(sameyearClause?.month?.gte).toBe(2);  // February, not 3 (March)
    });

    it('signupIncludesCurrentMonth=false + offset=1: eligible months start in March (next month after join)', async () => {
      setupDryRun({ signupIncludesCurrentMonth: false });
      const dto = makeJoinDto({ dryRun: true, startDate: '2025-02-05' });
      await service.joinSubscription(USER_ID, SUB_SLUG, dto);

      const findManyCalls = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
      const eligiblesCall = findManyCalls[0][0];
      const lowerBound = eligiblesCall?.where?.AND?.[0]?.OR;
      expect(lowerBound).toBeDefined();
      // Lower bound: year>2025 OR (year=2025 AND month>=3)
      const sameyearClause = lowerBound.find((c: any) => c.year === 2025);
      expect(sameyearClause?.month?.gte).toBe(3);  // March (next month), not April
    });

    it('offset=0 + signupIncludesCurrentMonth=true: eligible months start in Feb (baseline, no regression)', async () => {
      setupDryRun({ renewalMonthOffset: 0 });
      const dto = makeJoinDto({ dryRun: true, startDate: '2025-02-05' });
      await service.joinSubscription(USER_ID, SUB_SLUG, dto);

      const findManyCalls = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
      const eligiblesCall = findManyCalls[0][0];
      const lowerBound = eligiblesCall?.where?.AND?.[0]?.OR;
      const sameyearClause = lowerBound?.find((c: any) => c.year === 2025);
      expect(sameyearClause?.month?.gte).toBe(2);  // February
    });

    it('offset=1 + Jan join + signupIncludesCurrentMonth=true: eligible months start in Jan, not Feb', async () => {
      setupDryRun({ renewalMonthOffset: 1 });
      const dto = makeJoinDto({ dryRun: true, startDate: '2025-01-15' });
      await service.joinSubscription(USER_ID, SUB_SLUG, dto);

      const findManyCalls = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
      const eligiblesCall = findManyCalls[0][0];
      const lowerBound = eligiblesCall?.where?.AND?.[0]?.OR;
      const sameyearClause = lowerBound?.find((c: any) => c.year === 2025);
      expect(sameyearClause?.month?.gte).toBe(1);  // January
    });
  });
});
