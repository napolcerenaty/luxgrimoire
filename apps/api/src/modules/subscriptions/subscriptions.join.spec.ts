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

  // ── Eligible months — comprehensive matrix ────────────────────────────────
  //
  // getEligibleMonths determines which subscription box months a user is eligible
  // for based on their join date and subscription settings.
  //
  // New algorithm (renewal-cycle-aware):
  //  renewalAlreadyHappened = joinDay >= (renewalDay ?? 1)
  //  lastBillingMonth = joinMonth (if happened) or joinMonth - 1 (if not)
  //  currentBoxMonth  = lastBillingMonth + renewalMonthOffset
  //  signupIncludesCurrentMonth=true  → first = currentBoxMonth
  //  signupIncludesCurrentMonth=false → first = currentBoxMonth + 1
  //  paymentOnStartup does NOT change which months are eligible

  describe('eligible months — first box month determination', () => {
    /** Returns the `where.AND[0].OR` lower-bound clause from the first subscriptionMonth.findMany call */
    async function getLowerBound(subOverrides: Record<string, unknown>, startDate: string) {
      jest.clearAllMocks();
      const sub = makeSub({ renewalDay: 1, renewalMonthOffset: 0, signupIncludesCurrentMonth: false, ...subOverrides });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ dryRun: true, startDate }));

      const call = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0]?.[0];
      return call?.where?.AND?.[0]?.OR as Array<Record<string, unknown>> | undefined;
    }

    function getMonthGte(lowerBound: Array<Record<string, unknown>> | undefined, year: number) {
      const clause = lowerBound?.find(c => c.year === year) as any;
      return clause?.month?.gte as number | undefined;
    }

    function getYearGt(lowerBound: Array<Record<string, unknown>> | undefined) {
      const clause = lowerBound?.find(c => (c.year as any)?.gt !== undefined) as any;
      return clause?.year?.gt as number | undefined;
    }

    // ── renewalDay=1: joinDay >= 1 always → renewal already happened → lastBillingMonth = joinMonth ──

    it('renewalDay=1, offset=0, includes=false, Feb join → first box is March', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: false, renewalMonthOffset: 0 }, '2025-02-10');
      expect(getMonthGte(lb, 2025)).toBe(3);
      expect(getYearGt(lb)).toBe(2025);
    });

    it('renewalDay=1, offset=1, includes=false, Feb join → first box is April (currentBox=March, +1 for !includes)', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: false, renewalMonthOffset: 1 }, '2025-02-10');
      expect(getMonthGte(lb, 2025)).toBe(4);
      expect(getYearGt(lb)).toBe(2025);
    });

    it('renewalDay=1, offset=2, includes=false, Feb join → first box is May (currentBox=April, +1 for !includes)', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: false, renewalMonthOffset: 2 }, '2025-02-10');
      expect(getMonthGte(lb, 2025)).toBe(5);
    });

    it('renewalDay=1, offset=0, includes=false, Dec join → first box is January next year', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: false, renewalMonthOffset: 0 }, '2024-12-15');
      expect(getYearGt(lb)).toBe(2025);
      expect(getMonthGte(lb, 2025)).toBe(1);
    });

    it('renewalDay=1, offset=1, includes=false, Dec join → first box is February next year (currentBox=Jan, +1 for !includes)', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: false, renewalMonthOffset: 1 }, '2024-12-15');
      expect(getYearGt(lb)).toBe(2025);
      expect(getMonthGte(lb, 2025)).toBe(2);
    });

    it('renewalDay=1, offset=0, includes=false, Nov join → first box is December', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: false, renewalMonthOffset: 0 }, '2025-11-01');
      expect(getMonthGte(lb, 2025)).toBe(12);
    });

    it('renewalDay=1, offset=0, includes=true, Feb join → first box is February', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: true, renewalMonthOffset: 0 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(2);
    });

    it('renewalDay=1, offset=1, includes=true, Feb join → first box is March (currentBox = lastBillingMonth + offset = Feb+1)', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: true, renewalMonthOffset: 1 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(3);
    });

    it('renewalDay=1, offset=2, includes=true, Feb join → first box is April (currentBox = Feb+2)', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: true, renewalMonthOffset: 2 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(4);
    });

    it('renewalDay=1, offset=1, includes=true, Jan join → first box is February (currentBox = Jan+1)', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: true, renewalMonthOffset: 1 }, '2025-01-20');
      expect(getMonthGte(lb, 2025)).toBe(2);
    });

    it('renewalDay=1, offset=1, includes=true, Dec join → first box is January next year (currentBox = Dec+1)', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: true, renewalMonthOffset: 1 }, '2024-12-10');
      expect(getYearGt(lb)).toBe(2025);
      expect(getMonthGte(lb, 2025)).toBe(1);
    });

    it('renewalDay=1, offset=0, includes=true, Dec join → first box is December', async () => {
      const lb = await getLowerBound({ signupIncludesCurrentMonth: true, renewalMonthOffset: 0 }, '2024-12-10');
      expect(getMonthGte(lb, 2024)).toBe(12);
    });

    // ── paymentOnStartup does not change eligible months ────────────────────

    it('paymentOnStartup=true + renewalDay=1, offset=1, includes=true, Feb join → first box is March', async () => {
      const lb = await getLowerBound({ paymentOnStartup: true, signupIncludesCurrentMonth: true, renewalMonthOffset: 1 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(3);
    });

    it('paymentOnStartup=true + renewalDay=1, offset=1, includes=false, Feb join → first box is April', async () => {
      const lb = await getLowerBound({ paymentOnStartup: true, signupIncludesCurrentMonth: false, renewalMonthOffset: 1 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(4);
    });

    // ── renewalDay=20: joinDay < renewalDay → renewal hasn't happened → lastBillingMonth = joinMonth - 1 ──

    it('renewalDay=20, offset=0, includes=false, Feb5 join → lastBillingMonth=Jan → first box is February', async () => {
      const lb = await getLowerBound({ renewalDay: 20, signupIncludesCurrentMonth: false, renewalMonthOffset: 0 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(2);
    });

    it('renewalDay=20, offset=1, includes=true, Feb5 join → lastBillingMonth=Jan, currentBox=Feb → first box is February', async () => {
      // User scenario: join Feb 5, renewalDay=20, offset=1, includes=true → first = Feb
      const lb = await getLowerBound({ renewalDay: 20, signupIncludesCurrentMonth: true, renewalMonthOffset: 1 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(2);
    });

    it('renewalDay=20, offset=0, includes=true, Feb5 join → lastBillingMonth=Jan, currentBox=Jan → first box is January', async () => {
      const lb = await getLowerBound({ renewalDay: 20, signupIncludesCurrentMonth: true, renewalMonthOffset: 0 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(1);
    });

    it('renewalDay=20, offset=1, includes=false, Feb5 join → lastBillingMonth=Jan, currentBox=Feb → first box is March', async () => {
      const lb = await getLowerBound({ renewalDay: 20, signupIncludesCurrentMonth: false, renewalMonthOffset: 1 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(3);
    });

    it('renewalDay=20, offset=0, includes=false, Jan5 join → lastBillingMonth=Dec2024, currentBox=Dec2024 → first box is January 2025', async () => {
      const lb = await getLowerBound({ renewalDay: 20, signupIncludesCurrentMonth: false, renewalMonthOffset: 0 }, '2025-01-05');
      expect(getYearGt(lb)).toBe(2025);
      expect(getMonthGte(lb, 2025)).toBe(1);
    });

    it('renewalDay=20, offset=1, includes=true, Jan5 join → lastBillingMonth=Dec2024, currentBox=Jan2025 → first box is January 2025', async () => {
      const lb = await getLowerBound({ renewalDay: 20, signupIncludesCurrentMonth: true, renewalMonthOffset: 1 }, '2025-01-05');
      expect(getYearGt(lb)).toBe(2025);
      expect(getMonthGte(lb, 2025)).toBe(1);
    });
  });

  // ── Eligible months — upper bound (cancellation date + offset) ─────────────
  //
  // When a sub is cancelled, the upper-bound box month must also account for
  // the renewal cycle: if the last renewal already fired before cancellation,
  // the last eligible box = cancelMonth + renewalMonthOffset.
  // If it hadn't fired yet, the last eligible box = (cancelMonth - 1) + offset.

  describe('eligible months — upper bound with cancellation date', () => {
    async function getUpperBound(subOverrides: Record<string, unknown>, startDate: string, cancellationDate: string) {
      jest.clearAllMocks();
      const sub = makeSub({ renewalDay: 1, renewalMonthOffset: 0, signupIncludesCurrentMonth: false, ...subOverrides });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({
        dryRun: true,
        startDate,
        alreadyCancelled: true,
        cancellationDate,
      }));

      const call = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0]?.[0];
      return call?.where?.AND?.[1]?.OR as Array<Record<string, unknown>> | undefined;
    }

    function getMonthLte(upperBound: Array<Record<string, unknown>> | undefined, year: number) {
      const clause = upperBound?.find(c => c.year === year) as any;
      return clause?.month?.lte as number | undefined;
    }

    function getYearLt(upperBound: Array<Record<string, unknown>> | undefined) {
      const clause = upperBound?.find(c => (c.year as any)?.lt !== undefined) as any;
      return clause?.year?.lt as number | undefined;
    }

    it('renewalDay=20, offset=1, cancelDay=21 Nov → renewal happened (21>=20) → last box = Nov+1 = December', async () => {
      // Exact user scenario: renewalDay=20, offset=1, cancel 21.11.2024 → December should be included
      const ub = await getUpperBound(
        { renewalDay: 20, renewalMonthOffset: 1, signupIncludesCurrentMonth: true },
        '2024-02-05',
        '2024-11-21',
      );
      expect(getMonthLte(ub, 2024)).toBe(12);
    });

    it('renewalDay=20, offset=1, cancelDay=15 Nov → renewal NOT happened (15<20) → last box = Oct+1 = November', async () => {
      const ub = await getUpperBound(
        { renewalDay: 20, renewalMonthOffset: 1, signupIncludesCurrentMonth: true },
        '2024-02-05',
        '2024-11-15',
      );
      expect(getMonthLte(ub, 2024)).toBe(11);
    });

    it('renewalDay=20, offset=0, cancelDay=21 Nov → renewal happened → last box = November', async () => {
      const ub = await getUpperBound(
        { renewalDay: 20, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2024-02-05',
        '2024-11-21',
      );
      expect(getMonthLte(ub, 2024)).toBe(11);
    });

    it('renewalDay=1, offset=1, cancelDay=15 Dec → renewal happened (15>=1) → last box = Dec+1 = January next year', async () => {
      const ub = await getUpperBound(
        { renewalDay: 1, renewalMonthOffset: 1, signupIncludesCurrentMonth: true },
        '2024-02-05',
        '2024-12-15',
      );
      expect(getYearLt(ub)).toBe(2025);
      expect(getMonthLte(ub, 2025)).toBe(1);
    });
  });

  // ── Eligible months — upper bound for active sub (no cancellation date) ───
  //
  // When there is no cancellation date, the upper bound must still respect
  // the renewal day: if today is before the renewal day, this month's renewal
  // hasn't happened yet, so the current calendar month must be excluded.
  //
  // Regression: previously limitMonth was always now.getMonth()+1, which
  // included the current month even before its renewal fired.

  describe('eligible months — upper bound for active subscription respects today vs renewalDay', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    async function getUpperBoundActive(subOverrides: Record<string, unknown>, startDate: string, fakeNow: Date) {
      jest.useFakeTimers();
      jest.setSystemTime(fakeNow);
      jest.clearAllMocks();
      const sub = makeSub({ renewalDay: 1, renewalMonthOffset: 0, signupIncludesCurrentMonth: true, ...subOverrides });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ dryRun: true, startDate }));

      const call = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0]?.[0];
      const ub = call?.where?.AND?.[1]?.OR as Array<Record<string, unknown>> | undefined;
      return ub;
    }

    function getMonthLte(ub: Array<Record<string, unknown>> | undefined, year: number) {
      const clause = ub?.find((c) => c.year === year) as any;
      return clause?.month?.lte as number | undefined;
    }

    function getYearLt(ub: Array<Record<string, unknown>> | undefined) {
      const clause = ub?.find((c) => (c.year as any)?.lt !== undefined) as any;
      return clause?.year?.lt as number | undefined;
    }

    // ── Bi-monthly sub, renewalDay=15: joined June 1 ──────────────────────

    it('today July 12 (before renewalDay=15) → limit = June, July box excluded', async () => {
      // Regression: user joined June 1 with signupIncludesCurrentMonth=true, bimonthly sub.
      // July 15 renewal hasn't happened yet (today = July 12) → July must NOT appear.
      const ub = await getUpperBoundActive(
        { renewalDay: 15, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2026-06-01',
        new Date('2026-07-12T10:00:00Z'),
      );
      expect(getMonthLte(ub, 2026)).toBe(6); // limit = June
      expect(getYearLt(ub)).toBe(2026);
    });

    it('today July 15 exactly (renewalDay=15 — boundary) → limit = July, July box included', async () => {
      // On the renewal day itself, the renewal has happened → July is eligible.
      const ub = await getUpperBoundActive(
        { renewalDay: 15, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2026-06-01',
        new Date('2026-07-15T08:00:00Z'),
      );
      expect(getMonthLte(ub, 2026)).toBe(7); // limit = July
      expect(getYearLt(ub)).toBe(2026);
    });

    it('today July 16 (after renewalDay=15) → limit = July, July box included', async () => {
      const ub = await getUpperBoundActive(
        { renewalDay: 15, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2026-06-01',
        new Date('2026-07-16T10:00:00Z'),
      );
      expect(getMonthLte(ub, 2026)).toBe(7); // limit = July
      expect(getYearLt(ub)).toBe(2026);
    });

    it('today Jan 12 (before renewalDay=15) → limit = December previous year', async () => {
      // Jan 15 hasn't happened yet; last billed = December → limit wraps to Dec of prev year.
      const ub = await getUpperBoundActive(
        { renewalDay: 15, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2025-06-01',
        new Date('2026-01-12T10:00:00Z'),
      );
      expect(getYearLt(ub)).toBe(2025);
      expect(getMonthLte(ub, 2025)).toBe(12); // limit = December 2025
    });

    it('renewalDay=1 (always happened by any day) → limit = current month regardless of today', async () => {
      // renewalDay=1 means nowDay >= 1 always true → current month always included.
      const ub = await getUpperBoundActive(
        { renewalDay: 1, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2026-01-01',
        new Date('2026-07-03T10:00:00Z'),
      );
      expect(getMonthLte(ub, 2026)).toBe(7); // limit = July
    });
  });
});
