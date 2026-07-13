/**
 * Tests for getEligibleMonths() upper-bound logic used inside backfillSubscription().
 *
 * Regression: before the fix, getEligibleMonths() was called without renewalDay /
 * renewalMonthOffset, causing both to default to 1/0. With default renewalDay=1,
 * any day-of-month >= 1 set currentRenewalHappened=true, so the current calendar
 * month was always included as eligible — causing future months to be added as skips
 * or (if also in selectedMonthIds) added to the collection before renewal occurred.
 *
 * Scenarios covered:
 *  1. renewalDay=15, today=12th  → limit = previous month  (renewal not yet happened)
 *  2. renewalDay=15, today=18th  → limit = current month   (renewal already happened)
 *  3. renewalMonthOffset=1, renewal not yet happened       → limit = current-calendar-month (box month = billed+1)
 *  4. renewalMonthOffset=1, renewal already happened       → limit = next-calendar-month   (box month = billed+1)
 *  5. Bimonthly sub, renewalDay=15, today before renewal   → July box excluded from eligible
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const SUB_ID = 'sub-em-1';
const SUB_SLUG = 'em-test-sub';
const USER_ID = 'user-em-1';
const ENTRY_ID = 'entry-em-1';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    slug: SUB_SLUG,
    name: 'Eligible Months Test Sub',
    isCombo: false,
    componentIds: [],
    parentSubscriptionId: null,
    currency: 'EUR',
    renewalDay: 15,
    renewalDayUserSet: false,
    paymentOnStartup: false,
    signupIncludesCurrentMonth: false,
    renewalMonthOffset: 0,
    intervalMonths: 1,
    startingMonth: null,
    startDate: null,
    isContentStream: false,
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    userId: USER_ID,
    subscriptionId: SUB_ID,
    startDate: '2026-01-01',
    cancellationDate: null,
    renewalDay: null,
    basePrice: { toString: () => '20.00' },
    costCurrency: 'EUR',
    shippingCost: null,
    firstSkipDate: null,
    prepaidMonths: 1,
    feeTemplates: [],
    ...overrides,
  };
}

/** A month with one book so it can be selected or skipped. */
function makeMonth(id: string, year: number, month: number) {
  return {
    id,
    year,
    month,
    signatureType: null,
    books: [{ editionId: `ed-${id}`, bookId: `bk-${id}`, signatureType: null }],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a minimal service instance for eligible-months boundary tests.
 * All dependencies except prisma + skipPolicyEngine are stubbed out.
 */
function buildService(prisma: DeepMockProxy<PrismaService>, skipMock: { recomputeSkipState: jest.Mock }) {
  return new SubscriptionsService(
    prisma,
    {} as any,       // TypesenseService
    skipMock as any, // SkipPolicyEngine
    {} as any,       // RenewalCronService
    {} as any,       // CountryFeeSnapshotCronService
    {} as any,       // UploadService
    {} as any,       // CrowdStatsService
    { markStatsStale: jest.fn() } as any, // StatsService
    { del: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) } as any,
  );
}

/**
 * Sets up all prisma mocks needed for a single-month backfill.
 * The second subscriptionMonth.findMany call (eligible months) returns `eligibleMonths`.
 */
function setupMocks(
  prisma: DeepMockProxy<PrismaService>,
  skipMock: { recomputeSkipState: jest.Mock },
  selectedMonth: ReturnType<typeof makeMonth>,
  eligibleMonthsResult: ReturnType<typeof makeMonth>[],
) {
  // 1. Entry lookup
  (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry());
  // 2. Settings history (none)
  (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
  // 3. Price changes (none)
  (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
  // 4. Selected months fetch (call 1)
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([selectedMonth]);
  // 5. Book entry upsert
  (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
  (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'be-1' });
  (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
  // 6. Purchase group
  (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
  (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue({ id: 'pg-1' });
  // 7. Skip policy lookup
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
  // 8. Eligible months query (call 2) — returns what the test provides
  (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce(eligibleMonthsResult);
  // 9. Skip state recompute
  skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);
  // 10. refreshNextRenewalDate needs entry again
  (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);
}

/**
 * Extracts the WHERE clause passed to the 2nd subscriptionMonth.findMany call
 * (the eligible months query inside getEligibleMonths).
 */
function getEligibleMonthsWhere(prisma: DeepMockProxy<PrismaService>) {
  const calls = (prisma.subscriptionMonth.findMany as jest.Mock).mock.calls;
  // Call index 0: selected months by ID list
  // Call index 1: eligible months by date range
  if (calls.length < 2) throw new Error('Expected at least 2 subscriptionMonth.findMany calls');
  return calls[1][0].where as {
    subscriptionId: string;
    AND: [
      { OR: [{ year: { gt: number } }, { year: number; month: { gte: number } }] },
      { OR: [{ year: { lt: number } }, { year: number; month: { lte: number } }] },
    ];
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('backfillSubscription — eligible months upper bound (renewal day awareness)', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let skipMock: { recomputeSkipState: jest.Mock };
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    skipMock = { recomputeSkipState: jest.fn() };
    service = buildService(prisma, skipMock);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Scenario 1: renewalDay=15, today=July 12 — renewal not yet happened ──

  it('excludes current month when renewalDay=15 and today is the 12th (before renewal)', async () => {
    // Today: July 12, 2026 — renewal on 15th has NOT happened yet
    jest.useFakeTimers({ now: new Date('2026-07-12T10:00:00Z') });

    const sub = makeSub({ renewalDay: 15, renewalMonthOffset: 0 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const mayMonth = makeMonth('m-may', 2026, 5);
    setupMocks(prisma, skipMock, mayMonth, []);

    await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-may'] } as any);

    const where = getEligibleMonthsWhere(prisma);
    // Upper bound should be June (month 6) — July (7) excluded because July 15 hasn't happened
    const upperBound = where.AND[1];
    // The limit year is 2026, limit month is 6 (June)
    expect(upperBound).toEqual({
      OR: [
        { year: { lt: 2026 } },
        { year: 2026, month: { lte: 6 } },
      ],
    });
  });

  // ── Scenario 2: renewalDay=15, today=July 18 — renewal already happened ──

  it('includes current month when renewalDay=15 and today is the 18th (after renewal)', async () => {
    // Today: July 18, 2026 — renewal on 15th HAS happened
    jest.useFakeTimers({ now: new Date('2026-07-18T10:00:00Z') });

    const sub = makeSub({ renewalDay: 15, renewalMonthOffset: 0 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const mayMonth = makeMonth('m-may', 2026, 5);
    setupMocks(prisma, skipMock, mayMonth, []);

    await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-may'] } as any);

    const where = getEligibleMonthsWhere(prisma);
    // Upper bound should be July (month 7)
    const upperBound = where.AND[1];
    expect(upperBound).toEqual({
      OR: [
        { year: { lt: 2026 } },
        { year: 2026, month: { lte: 7 } },
      ],
    });
  });

  // ── Scenario 3: renewalMonthOffset=1, today=July 12 (before renewal) ──
  // Renewal in June paid for July box. July 15 renewal pays for August box.
  // Since June 15 already happened, July box IS eligible.

  it('includes offset box month when previous renewal already happened (offset=1, today=July 12)', async () => {
    // Today: July 12. renewalDay=15. Offset=1.
    // July 12 < July 15 → currentRenewalHappened=false
    // lastBilledMonth = June (July-1)
    // lastBoxMonth = June + 1 = July → limitMonth = July
    jest.useFakeTimers({ now: new Date('2026-07-12T10:00:00Z') });

    const sub = makeSub({ renewalDay: 15, renewalMonthOffset: 1 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const mayMonth = makeMonth('m-may', 2026, 5);
    setupMocks(prisma, skipMock, mayMonth, []);

    await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-may'] } as any);

    const where = getEligibleMonthsWhere(prisma);
    // Upper bound should be July (month 7) — June renewal paid for July box
    const upperBound = where.AND[1];
    expect(upperBound).toEqual({
      OR: [
        { year: { lt: 2026 } },
        { year: 2026, month: { lte: 7 } },
      ],
    });
  });

  // ── Scenario 4: renewalMonthOffset=1, today=July 18 (after renewal) ──
  // July 15 renewal happened → pays for August box → limit = August

  it('advances box limit to offset month when current renewal happened (offset=1, today=July 18)', async () => {
    // Today: July 18. renewalDay=15. Offset=1.
    // July 18 >= July 15 → currentRenewalHappened=true
    // lastBilledMonth = July
    // lastBoxMonth = July + 1 = August → limitMonth = August
    jest.useFakeTimers({ now: new Date('2026-07-18T10:00:00Z') });

    const sub = makeSub({ renewalDay: 15, renewalMonthOffset: 1 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const mayMonth = makeMonth('m-may', 2026, 5);
    setupMocks(prisma, skipMock, mayMonth, []);

    await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-may'] } as any);

    const where = getEligibleMonthsWhere(prisma);
    // Upper bound should be August (month 8)
    const upperBound = where.AND[1];
    expect(upperBound).toEqual({
      OR: [
        { year: { lt: 2026 } },
        { year: 2026, month: { lte: 8 } },
      ],
    });
  });

  // ── Scenario 5: Exact bug regression ─────────────────────────────────────
  // Bimonthly sub (May, July, Sep...), renewalDay=15, today=July 12
  // July box should NOT appear in eligible months → not skipped, not added to collection

  it('regression: bimonthly sub does not include July box as eligible when today=July 12 and renewalDay=15', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-12T10:00:00Z') });

    const sub = makeSub({ renewalDay: 15, renewalMonthOffset: 0, intervalMonths: 2, startingMonth: 5 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const mayMonth = makeMonth('m-may', 2026, 5);

    // Setup: selected=May, eligible months query returns [May, July] as if both exist in DB
    (prisma.userSubscriptionEntry.findFirst as jest.Mock).mockResolvedValueOnce(makeEntry());
    (prisma.subscriptionSettingsHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.subscriptionPriceChange.findMany as jest.Mock).mockResolvedValueOnce([]);
    // Selected months fetch returns May
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([mayMonth]);
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.userBookEntry.create as jest.Mock).mockResolvedValueOnce({ id: 'be-1' });
    (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValueOnce({});
    (prisma.userPurchaseGroup.create as jest.Mock).mockResolvedValueOnce({ id: 'pg-1' });
    (prisma.userPurchaseGroup.update as jest.Mock).mockResolvedValue({ id: 'pg-1' });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({ id: SUB_ID, skipPolicies: [] });
    // Eligible months query returns BOTH May and July (simulating DB has both months in its table)
    // BUT the service must send a WHERE with upper bound = June, so in a real DB only May would come back.
    // We return only May here (mirroring what the correct WHERE clause would produce).
    (prisma.subscriptionMonth.findMany as jest.Mock).mockResolvedValueOnce([mayMonth]);
    skipMock.recomputeSkipState.mockResolvedValueOnce(undefined);
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-may'] } as any);

    // The eligible months query must have upper bound = June (month 6), not July (7)
    const where = getEligibleMonthsWhere(prisma);
    const upperBound = where.AND[1];
    expect(upperBound).toEqual({
      OR: [
        { year: { lt: 2026 } },
        { year: 2026, month: { lte: 6 } },
      ],
    });

    // Since the query is bounded to June, July month record is never fetched,
    // so no skip record for July should ever be created
    expect(prisma.userSkipRecord.upsert).not.toHaveBeenCalled();
  });

  // ── Scenario 6: default renewalDay=1 (first of month) ────────────────────
  // renewalDay=1, today=July 12 → renewal happened → limitMonth=July

  it('includes current month when renewalDay=1 (always passes since 12 >= 1)', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-12T10:00:00Z') });

    const sub = makeSub({ renewalDay: 1, renewalMonthOffset: 0 });
    jest.spyOn(service, 'findBySlug').mockResolvedValue(sub as any);

    const mayMonth = makeMonth('m-may', 2026, 5);
    setupMocks(prisma, skipMock, mayMonth, []);

    await service.backfillSubscription(USER_ID, SUB_SLUG, { selectedMonthIds: ['m-may'] } as any);

    const where = getEligibleMonthsWhere(prisma);
    // renewalDay=1, today=12 → 12>=1 → currentRenewalHappened=true → limitMonth=July
    const upperBound = where.AND[1];
    expect(upperBound).toEqual({
      OR: [
        { year: { lt: 2026 } },
        { year: 2026, month: { lte: 7 } },
      ],
    });
  });
});
