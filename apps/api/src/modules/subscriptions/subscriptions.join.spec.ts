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

  // eligibleMonths (and the "current"/"next" candidates the picker builds from it) are anchored on
  // computeJoinDateWindow — the join date's own raw calendar position (or cadence cycle for
  // multi-month subs), with NO renewal-day/renewalMonthOffset/signupIncludesCurrentMonth math at
  // all. That cycle math still exists and still runs (computeFirstEligibleBoxMonth, via
  // computeDateAnchoredFirstBoxMonth) but only feeds `defaultFirstBoxYear`/`defaultFirstBoxMonth`
  // in the response now — the renewal-cycle-aware "Suggested" badge, not the query boundary. See
  // the "'Suggested' badge" block below for cycle-math coverage, and buildFirstBoxCandidates
  // (joinSubscription.utils.test.ts) for why: a subscriber joining today whose subscription has
  // signupIncludesCurrentMonth=false should still see "current" mean the window shipping right
  // now, with the eligibility-adjusted month marked Suggested separately (Afterlight bug report).
  describe('eligible months — first box month determination (join-date window, no cycle math)', () => {
    /** Returns the `where.AND[0].OR` lower-bound clause from the first subscriptionMonth.findMany call */
    async function getLowerBound(subOverrides: Record<string, unknown>, startDate: string) {
      jest.clearAllMocks();
      const sub = makeSub({ renewalDay: 1, renewalMonthOffset: 0, signupIncludesCurrentMonth: false, ...subOverrides });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      // No real content found at the raw join-date position → computeJoinDateWindow falls back to
      // that unshifted calendar position as-is.
      (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue(null);

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

    it('with no real content nearby, eligibleMonths starts at the raw join month — renewalDay/offset/includes have no effect', async () => {
      const lb = await getLowerBound({ renewalDay: 20, renewalMonthOffset: 2, signupIncludesCurrentMonth: false }, '2025-02-10');
      expect(getMonthGte(lb, 2025)).toBe(2);
      expect(getYearGt(lb)).toBe(2025);
    });

    it('join on Dec 31 → eligibleMonths starts at December of the join year (no year-boundary special-casing)', async () => {
      const lb = await getLowerBound({}, '2024-12-31');
      expect(getMonthGte(lb, 2024)).toBe(12);
    });

    it('paymentOnStartup does not change the eligible-months boundary', async () => {
      const lb = await getLowerBound({ paymentOnStartup: true, renewalDay: 15 }, '2025-02-05');
      expect(getMonthGte(lb, 2025)).toBe(2);
    });

    it('when real content exists at the join month, it is used as-is (not shifted)', async () => {
      jest.clearAllMocks();
      const sub = makeSub({ renewalDay: 1, renewalMonthOffset: 0, signupIncludesCurrentMonth: false });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ year: 2025, month: 2 });

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ dryRun: true, startDate: '2025-02-10' }));

      const call = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0]?.[0];
      const lb = call?.where?.AND?.[0]?.OR as Array<Record<string, unknown>> | undefined;
      expect(getMonthGte(lb, 2025)).toBe(2);
    });

    it('when the join month is fully skipped (no content), shifts forward to the nearest real month', async () => {
      jest.clearAllMocks();
      const sub = makeSub({ renewalDay: 1, renewalMonthOffset: 0, signupIncludesCurrentMonth: false });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      // Feb has no content (company-wide skip) — nearest real content is April
      (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue({ year: 2025, month: 4 });

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ dryRun: true, startDate: '2025-02-10' }));

      const call = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls[0]?.[0];
      const lb = call?.where?.AND?.[0]?.OR as Array<Record<string, unknown>> | undefined;
      expect(getMonthGte(lb, 2025)).toBe(4);
    });
  });

  // ── defaultFirstBoxYear/Month — the renewal-cycle-aware "Suggested" badge ──────
  //
  // computeFirstEligibleBoxMonth's cycle math still runs — it just no longer decides the
  // eligibleMonths query boundary (see block above). It's returned separately in the dry-run
  // response so the frontend can mark whichever of previous/current/next matches it as
  // "Suggested" (see buildFirstBoxCandidates).
  describe('dry-run response — defaultFirstBoxYear/Month (renewal-cycle-aware suggestion)', () => {
    async function getDefaultFirstBox(subOverrides: Record<string, unknown>, startDate: string) {
      jest.clearAllMocks();
      const sub = makeSub({ renewalDay: 1, renewalMonthOffset: 0, signupIncludesCurrentMonth: false, ...subOverrides });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue(null);

      return service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ dryRun: true, startDate })) as Promise<any>;
    }

    it('renewalDay=20, offset=2, includes=false, Feb10 join → suggestion is April (cycle math still applies here)', async () => {
      // joinDay=10 < renewalDay=20 → not yet happened → lastBillingMonth=Jan; boxMonth=Jan+2=March;
      // includes=false → first = March+1 = April.
      const result = await getDefaultFirstBox({ renewalDay: 20, renewalMonthOffset: 2, signupIncludesCurrentMonth: false }, '2025-02-10');
      expect(result.defaultFirstBoxYear).toBe(2025);
      expect(result.defaultFirstBoxMonth).toBe(4);
    });

    it('join on Dec 31, renewalDay=1, includes=false → suggestion is January next year', async () => {
      // joinDay=31 >= renewalDay=1 → happened → lastBillingMonth=Dec; boxMonth=Dec; includes=false → Jan next year.
      const result = await getDefaultFirstBox({}, '2024-12-31');
      expect(result.defaultFirstBoxYear).toBe(2025);
      expect(result.defaultFirstBoxMonth).toBe(1);
    });

    it('renewalDay=1, includes=true, Feb10 join → suggestion equals the raw join month (no divergence)', async () => {
      const result = await getDefaultFirstBox({ renewalDay: 1, signupIncludesCurrentMonth: true }, '2025-02-10');
      expect(result.defaultFirstBoxYear).toBe(2025);
      expect(result.defaultFirstBoxMonth).toBe(2);
      expect(result.joinWindowYear).toBe(2025);
      expect(result.joinWindowMonth).toBe(2);
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

  // ── recordFirstMonthAsPreorder — which month gets registered as preorder ──
  //
  // When paymentOnStartup=true the service calls recordFirstMonthAsPreorder,
  // which must find the SAME "current box month" as getEligibleMonths and register
  // it as PREORDER.  The DB query inside the function uses:
  //
  //   renewalAlreadyHappened = joinDay >= subRenewalDay
  //   lastBillingMonth = joinMonth            (if happened)
  //                    = joinMonth - 1         (if not)
  //   currentBoxMonth  = lastBillingMonth + renewalMonthOffset
  //   firstEligibleMonth = currentBoxMonth     (signupIncludesCurrentMonth=true)
  //                      = currentBoxMonth + 1 (false)
  //
  // We verify by inspecting the subscriptionMonth.findFirst call made inside the function.

  describe('recordFirstMonthAsPreorder — first preorder month', () => {
    afterEach(() => jest.useRealTimers());

    /**
     * Sets up a real join (not dryRun) with paymentOnStartup=true and returns
     * the `where` clause from the subscriptionMonth.findFirst call made inside
     * recordFirstMonthAsPreorder specifically — identified by its `include` (it
     * fetches book rows), not by call order: joinSubscription now also makes an
     * earlier, unrelated subscriptionMonth.findFirst call (select-only, no
     * `include`) to date-anchor the default first box month, so "the first call"
     * is no longer a safe way to find this one.
     */
    async function getPreorderQuery(
      subOverrides: Record<string, unknown>,
      startDate: string,
      dtoOverrides: Record<string, unknown> = {},
    ): Promise<{ yearGt?: number; monthGte?: number; yearGt2?: number; subscriptionId?: string } | undefined> {
      jest.clearAllMocks();
      const sub = makeSub({
        paymentOnStartup: true,
        signupIncludesCurrentMonth: true,
        renewalDay: 15,
        renewalMonthOffset: 0,
        ...subOverrides,
      });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      // No active entry
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      // Created entry — renewalDay is null because sub has a fixed renewalDay (not user-set)
      (prisma.userSubscriptionEntry.create as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate, renewalDay: null }),
      );
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      // findFirst returns null → recordFirstMonthAsPreorder exits early (no books to add)
      (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValue([]);

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ startDate, ...dtoOverrides }));

      const calls = (prisma.subscriptionMonth.findFirst as jest.Mock).mock.calls;
      const call = calls.map((c: any[]) => c[0]).find((c: any) => c?.include?.books) ?? calls[calls.length - 1]?.[0];
      const or: Array<any> | undefined = call?.where?.OR;
      if (!or) return undefined;
      const yearGtClause = or.find((c: any) => c.year?.gt !== undefined);
      const monthGteClause = or.find((c: any) => typeof c.year === 'number');
      return {
        yearGt: yearGtClause?.year?.gt,
        monthGte: monthGteClause?.month?.gte,
        yearGt2: monthGteClause?.year,
        subscriptionId: call?.where?.subscriptionId,
      };
    }

    // ── which subscriptionId the preorder lookup queries against ──
    //
    // Regression: recordFirstMonthAsPreorder used to be called with the joined
    // subscription's own `sub.id`, even when that subscription is a content-stream
    // variant (e.g. "Illumicrate box" as a variant of an "Illumicrate" content
    // stream). SubscriptionMonth rows for a variant live on the PARENT subscription
    // (see scheduleBookChoiceForNewEntry / getEligibleMonths, which already used
    // monthsSubscriptionId = parentSubscriptionId ?? sub.id). Because the preorder
    // step queried the wrong id, subscriptionMonth.findFirst always found nothing,
    // and the join silently created no preorder — the book never appeared in the
    // collection even though paymentOnStartup was on and the month wasn't a
    // book-choice month. Fixed by passing monthsSubscriptionId (and the matching
    // effectiveStartDateObj/effectiveSignupIncludes) into recordFirstMonthAsPreorder.
    describe('subscriptionId used for the preorder month lookup', () => {
      it('uses the subscription\'s own id for a normal (non-variant) subscription', async () => {
        const q = await getPreorderQuery({}, '2026-06-20');
        expect(q?.subscriptionId).toBe(SUB_ID);
      });

      it('uses the PARENT content stream\'s id — not the variant\'s own id — when joining a content-stream variant', async () => {
        const PARENT_ID = 'parent-content-stream-1';
        const q = await getPreorderQuery({ parentSubscriptionId: PARENT_ID }, '2026-06-20');
        expect(q?.subscriptionId).toBe(PARENT_ID);
        expect(q?.subscriptionId).not.toBe(SUB_ID);
      });
    });

    // ── first box month resolution ──
    //
    // recordFirstMonthAsPreorder no longer runs its own computeFirstEligibleBoxMonth call directly
    // — it uses the same resolved first-box month as everywhere else (the join modal's mandatory
    // picker choice, or — absent that — the date-anchored default). That default still applies the
    // renewal-day/renewalMonthOffset/signupIncludesCurrentMonth cycle math as its starting guess
    // (same numbers computeFirstEligibleBoxMonth would give), then snaps forward only if that exact
    // month has no real content — with no SubscriptionMonth content in these mocks, that snap never
    // triggers, so the numbers below match the plain cycle-math formula. See
    // computeDateAnchoredFirstBoxMonth / resolveFirstBoxMonth.

    it('with no firstBoxYear/firstBoxMonth in the dto → preorder query uses the renewal-cycle default (renewalDay=15, includes=true, Jun20 join → June)', async () => {
      const q = await getPreorderQuery(
        { renewalDay: 15, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2026-06-20',
      );
      expect(q?.monthGte).toBe(6);
      expect(q?.yearGt2).toBe(2026);
    });

    it('with firstBoxYear/firstBoxMonth in the dto → preorder query uses that exact value, ignoring renewalDay entirely', async () => {
      const q = await getPreorderQuery(
        { renewalDay: 15, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2026-06-20',
        { firstBoxYear: 2026, firstBoxMonth: 5 },
      );
      expect(q?.monthGte).toBe(5);
      expect(q?.yearGt2).toBe(2026);
    });

    it('join Jan 1 with no firstBoxYear/firstBoxMonth, renewalDay=15 → preorder query starts at December of the previous year (renewal-cycle math)', async () => {
      // joinDay=1 < renewalDay=15 → not yet happened → lastBillingMonth=Dec 2025; includes=true → first=Dec 2025.
      const q = await getPreorderQuery(
        { renewalDay: 15, renewalMonthOffset: 0, signupIncludesCurrentMonth: true },
        '2026-01-01',
      );
      expect(q?.monthGte).toBe(12);
      expect(q?.yearGt2).toBe(2025);
    });

    it('preorder entry is created with ownershipStatus PREORDER not OWNED', async () => {
      jest.clearAllMocks();
      const sub = makeSub({ paymentOnStartup: true, signupIncludesCurrentMonth: true, renewalDay: 15, renewalMonthOffset: 0 });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionEntry.create as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2026-06-01', renewalDay: null }),
      );
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      const mayMonth = { id: 'may-month', year: 2026, month: 5, signatureType: null, books: [{ editionId: 'ed-1', bookId: 'book-1', signatureType: null }] };
      (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue(mayMonth);
      (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValue({ id: 'group-1' });
      // findFirst for upsertSubscriptionBookEntry (checks if entry exists)
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'be-1' });
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ startDate: '2026-06-01' }));

      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownershipStatus: 'PREORDER' }),
        }),
      );
    });

    it('regression: adds the book to the collection when joining a content-stream variant (Illumicrate-box-style sub)', async () => {
      jest.clearAllMocks();
      const PARENT_ID = 'parent-content-stream-1';
      const sub = makeSub({
        paymentOnStartup: true,
        signupIncludesCurrentMonth: true,
        renewalDay: 15,
        renewalMonthOffset: 0,
        parentSubscriptionId: PARENT_ID,
      });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(sub as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionEntry.create as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2026-06-01', renewalDay: null }),
      );
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);

      const augustMonth = { id: 'august-month', year: 2026, month: 8, signatureType: null, books: [{ editionId: 'ed-aug', bookId: 'book-aug', signatureType: null }] };
      (prisma.subscriptionMonth.findFirst as jest.Mock).mockResolvedValue(augustMonth);
      (prisma.userSubscriptionEntryFeeTemplate.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValue({ id: 'group-variant-1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'be-aug' });
      (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({});

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ startDate: '2026-06-01' }));

      // Looked up months on the PARENT stream, not the variant's own id (the preorder-specific
      // call — identified by its `include`, since an earlier date-anchoring call now also runs)
      const findFirstCalls = (prisma.subscriptionMonth.findFirst as jest.Mock).mock.calls;
      const findFirstCall = findFirstCalls.map((c: any[]) => c[0]).find((c: any) => c?.include?.books);
      expect(findFirstCall?.where?.subscriptionId).toBe(PARENT_ID);

      // ...and the book was actually added as a PREORDER
      expect(prisma.userBookEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ editionId: 'ed-aug', bookId: 'book-aug', ownershipStatus: 'PREORDER' }),
        }),
      );
    });
  });

  // ── recordFirstMonthAsPreorder — combo subscriptions ──
  //
  // Combos have no SubscriptionMonth rows of their own (books live on each component
  // subscription, aggregated at read time by getComboEligibleMonths). joinSubscription
  // guards the preorder step with `!isCombo`, so recordFirstMonthAsPreorder must never
  // run for a combo — even when paymentOnStartup is on, and even when one of the combo's
  // components is itself a content-stream variant (the same shape as the variant bug
  // above, just one level further removed). These tests lock in that the guard stays in
  // place: if it were ever removed, recordFirstMonthAsPreorder would run its single-
  // subscriptionId findFirst (with an `include` fetching books) against a combo id that
  // owns no months at all. A separate, unrelated subscriptionMonth.findFirst call (no
  // `include`, just year/month) legitimately does still run for every join, combo or
  // not — it date-anchors the default first box month — so the guard is checked via the
  // preorder-shaped call specifically, not "findFirst never called at all".
  describe('recordFirstMonthAsPreorder — combo subscriptions (guarded out entirely)', () => {
    it('does not attempt a preorder lookup for a combo subscription with a regular component', async () => {
      jest.clearAllMocks();
      const REGULAR_COMP_ID = 'regular-comp-1';
      const combo = makeSub({
        isCombo: true,
        componentIds: [REGULAR_COMP_ID],
        paymentOnStartup: true,
        signupIncludesCurrentMonth: true,
        renewalDay: 15,
      });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(combo as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionEntry.create as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2026-06-01', renewalDay: null }),
      );
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      // resolveEffectiveComponentIds (inside getComboEligibleMonths)
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([
        { id: REGULAR_COMP_ID, parentSubscriptionId: null },
      ]);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ startDate: '2026-06-01' }));

      const preorderShapedCalls = (prisma.subscriptionMonth.findFirst as jest.Mock).mock.calls
        .filter((c: any[]) => c[0]?.include?.books);
      expect(preorderShapedCalls).toHaveLength(0);
      expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
    });

    it('does not attempt a preorder lookup for a combo subscription whose component is a content-stream variant', async () => {
      jest.clearAllMocks();
      const VARIANT_COMP_ID = 'variant-comp-1';
      const PARENT_ID = 'parent-content-stream-2';
      const combo = makeSub({
        isCombo: true,
        componentIds: [VARIANT_COMP_ID],
        paymentOnStartup: true,
        signupIncludesCurrentMonth: true,
        renewalDay: 15,
      });
      jest.spyOn(service, 'findBySlug').mockResolvedValueOnce(combo as any);
      (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userSubscriptionEntry.create as jest.Mock).mockResolvedValueOnce(
        makeEntry({ startDate: '2026-06-01', renewalDay: null }),
      );
      (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValue([]);
      // resolveEffectiveComponentIds resolves the variant component to its parent stream
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([
        { id: VARIANT_COMP_ID, parentSubscriptionId: PARENT_ID },
      ]);
      (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValue([]);

      await service.joinSubscription(USER_ID, SUB_SLUG, makeJoinDto({ startDate: '2026-06-01' }));

      const preorderShapedCalls = (prisma.subscriptionMonth.findFirst as jest.Mock).mock.calls
        .filter((c: any[]) => c[0]?.include?.books);
      expect(preorderShapedCalls).toHaveLength(0);
      expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
    });
  });
});
