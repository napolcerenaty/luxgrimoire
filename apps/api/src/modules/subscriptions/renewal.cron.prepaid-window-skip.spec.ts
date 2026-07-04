/**
 * Tests for PREPAID_WINDOW_SKIP handling inside the renewal cron.
 *
 * When a prepaid entry governed by a PREPAID_WINDOW_SKIP policy has ALL months in the
 * current renewal window skipped, the cron must NOT create PREORDER entries and must
 * advance nextRenewalDate by the whole window. Otherwise renewal proceeds normally.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { RenewalCronService } from './renewal.cron';

jest.mock('../../common/utils/renewal-date.util', () => ({
  refreshNextRenewalDate: jest.fn().mockResolvedValue(undefined),
  renewalMonthFromBoxMonth: jest.requireActual('../../common/utils/renewal-date.util').renewalMonthFromBoxMonth,
  computeNextRenewalDate: jest.requireActual('../../common/utils/renewal-date.util').computeNextRenewalDate,
  computePastRenewalDates: jest.requireActual('../../common/utils/renewal-date.util').computePastRenewalDates,
}));

const RENEWAL_DATE = new Date(Date.UTC(2025, 2, 1)); // March 1 2025 → box month March

function prepaidEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    costCurrency: 'USD' as string | null,
    basePrice: { toString: () => '30' },
    shippingCost: { toString: () => '5' },
    nextRenewalDate: RENEWAL_DATE,
    prepaidMonths: 3,
    scheduledPrepayOptionId: null,
    scheduledPrepayOption: null,
    subscription: { renewalMonthOffset: 0, isBundleSubscription: false, intervalMonths: 1 },
    ...overrides,
  };
}

const WINDOW_POLICY_SUB = {
  parentSubscriptionId: null,
  isCombo: false,
  comboComponents: [],
  skipPolicies: [{ billingType: 'PREPAID', type: 'PREPAID_WINDOW_SKIP' }],
};

describe('RenewalCronService — PREPAID_WINDOW_SKIP', () => {
  let service: RenewalCronService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new RenewalCronService(prisma, { markStatsStale: jest.fn() } as any);
    jest.clearAllMocks();
  });

  it('all window months skipped → no renewal, advances nextRenewalDate by prepaidMonths', async () => {
    (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
    // Guard loads the subscription + policies
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(WINDOW_POLICY_SUB);
    // Every month exists and has an active skip
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValue({ id: 'sm-x' });
    (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValue({ undoneAt: null });
    // advanceRenewalByMonths
    (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValueOnce({ nextRenewalDate: RENEWAL_DATE });
    (prisma.userSubscriptionEntry.update as jest.Mock).mockResolvedValueOnce({});

    await (service as any).processOneRenewal(prepaidEntry());

    // No PREORDER entries created and no renewal record created
    expect(prisma.userSubscriptionRenewal.create).not.toHaveBeenCalled();
    expect(prisma.userPurchaseGroup.create).not.toHaveBeenCalled();
    // nextRenewalDate advanced by 3 months: March 1 → June 1
    const updateCall = (prisma.userSubscriptionEntry.update as jest.Mock).mock.calls[0][0];
    expect(new Date(updateCall.data.nextRenewalDate).getUTCMonth()).toBe(5); // June (0-indexed)
  });

  it('not all window months skipped → normal renewal proceeds', async () => {
    (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
    // Guard subscription load, then addBooksForSubscriptionMonth subscription load
    (prisma.subscription.findUnique as jest.Mock)
      .mockResolvedValueOnce(WINDOW_POLICY_SUB)
      .mockResolvedValueOnce({ isCombo: false, comboComponents: [], parentSubscriptionId: null });
    // Month exists but has NO active skip → guard returns false at first month
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValue({ id: 'sm-x', books: [], signatureType: null });
    (prisma.userSkipRecord.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValueOnce({ id: 'r-1' });

    await (service as any).processOneRenewal(prepaidEntry());

    // Renewal record IS created (normal path)
    expect(prisma.userSubscriptionRenewal.create).toHaveBeenCalled();
  });

  it('monthly entry with MONTHLY policy alongside PREPAID_WINDOW → normal renewal unaffected', async () => {
    (prisma.userSubscriptionRenewal.findUnique as jest.Mock).mockResolvedValueOnce(null);
    // prepaidMonths=1 → guard short-circuits before any subscription load; addBooks loads subscription once
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      isCombo: false, comboComponents: [], parentSubscriptionId: null,
    });
    (prisma.subscriptionMonth.findUnique as jest.Mock).mockResolvedValue({ id: 'sm-x', books: [], signatureType: null });
    (prisma.userSubscriptionRenewal.create as jest.Mock).mockResolvedValueOnce({ id: 'r-2' });

    await (service as any).processOneRenewal(prepaidEntry({ prepaidMonths: 1 }));

    expect(prisma.userSubscriptionRenewal.create).toHaveBeenCalled();
    // Guard never advanced the renewal date via a window skip
    expect(prisma.userSubscriptionEntry.update).not.toHaveBeenCalled();
  });
});
