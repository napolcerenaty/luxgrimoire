import { SpendingStatsComputer } from './spending-stats.computer';
import type { StatsContext, StatsEntryData, StatsSaleGroupData } from '../stats.context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** no-op converter — returns the amount unchanged (same currency scenario) */
const noopConvert = async (amount: number) => amount;

function makeCtx(overrides: Partial<StatsContext> = {}): StatsContext {
  return {
    userId: 'user-1',
    currency: 'EUR',
    year: 0,
    now: new Date('2024-03-15T12:00:00Z'),
    entries: [],
    saleGroups: [],
    convert: noopConvert as StatsContext['convert'],
    ...overrides,
  };
}

/** Creates a minimal valid StatsEntryData with a purchase group */
function makeEntry(opts: {
  amount?: number;
  currency?: string;
  purchasedAt?: string;
  shipping?: number;
  fees?: Array<{ amount: number; currency: string; date: string; category: string }>;
  discounts?: Array<{ amount: number; currency: string; date: string }>;
  refunds?: Array<{ amount: number; currency: string; date: string }>;
  entryCount?: number;
  salePrice?: number;
  saleCurrency?: string;
  saleDate?: string;
  ownershipStatus?: string;
  isWishlist?: boolean;
  signatureType?: string | null;
  readingStatus?: string;
  company?: { id: string; name: string; slug: string; brandColors: string[] } | null;
  subscriptionSlug?: string | null;
  isSecondHand?: boolean;
}): StatsEntryData {
  const {
    amount = 100,
    currency = 'EUR',
    purchasedAt = '2024-01-15T00:00:00Z',
    shipping = 0,
    fees = [],
    discounts = [],
    refunds = [],
    entryCount = 1,
    salePrice,
    saleCurrency = null,
    saleDate = null,
    ownershipStatus = 'OWNED',
    isWishlist = false,
    signatureType = null,
    readingStatus = 'UNREAD',
    company = null,
    subscriptionSlug = null,
    isSecondHand = false,
  } = opts;

  // Generate dummy sibling book entries to match entryCount
  const bookEntries = Array.from({ length: entryCount }, (_, i) => ({ id: `entry-${i}` }));

  return {
    id: `entry-${Math.random()}`,
    userId: 'user-1',
    editionId: 'ed-1',
    ownershipStatus,
    isWishlist,
    signatureType,
    readingStatus,
    salePrice: salePrice != null ? salePrice : null,
    saleCurrency,
    saleDate: saleDate ? new Date(saleDate) : null,
    purchaseGroup: {
      id: 'pg-1',
      currency,
      totalAmount: amount,
      shippingAmount: shipping || null,
      purchasedAt: new Date(purchasedAt),
      isSecondHand,
      bookEntries,
      fees: fees.map((f) => ({ amount: f.amount, currency: f.currency, date: new Date(f.date), category: f.category })),
      discounts: discounts.map((d) => ({ amount: d.amount, currency: d.currency, date: new Date(d.date) })),
      refunds: refunds.map((r) => ({ amount: r.amount, currency: r.currency, date: new Date(r.date) })),
    },
    subscriptionEntry: subscriptionSlug
      ? {
          subscription: {
            name: `Sub ${subscriptionSlug}`,
            slug: subscriptionSlug,
            company: company ?? null,
          },
        }
      : null,
    edition: {
      slug: 'edition-slug',
      bookBoxCompany: company,
      book: {
        title: 'Test Book',
        slug: 'test-book',
        authors: [{ author: { name: 'Author Name' } }],
      },
      featureTags: [],
    },
  } as unknown as StatsEntryData;
}

/** Creates a minimal StatsSaleGroupData */
function makeSaleGroup(opts: {
  totalAmount?: number;
  currency?: string;
  soldAt?: string;
  platform?: string;
  entries?: Array<{ allocatedAmount: number; company?: { id: string; name: string; slug: string; brandColors: string[] } | null }>;
}): StatsSaleGroupData {
  const { totalAmount = 150, currency = 'EUR', soldAt = '2024-02-20T00:00:00Z', platform = 'ebay', entries = [] } = opts;
  return {
    id: `sg-${Math.random()}`,
    userId: 'user-1',
    currency,
    totalAmount,
    soldAt: new Date(soldAt),
    platform,
    entries: entries.map((e) => ({
      id: `sge-${Math.random()}`,
      allocatedAmount: e.allocatedAmount,
      userBookEntry: {
        id: 'ube-1',
        edition: {
          bookBoxCompany: e.company ?? null,
        },
        subscriptionEntry: null,
      },
    })),
  } as unknown as StatsSaleGroupData;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SpendingStatsComputer', () => {
  let computer: SpendingStatsComputer;

  beforeEach(() => {
    computer = new SpendingStatsComputer();
  });

  it('has key "spending" and version 4', () => {
    expect(computer.key).toBe('spending');
    expect(computer.version).toBe(5);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty entries', () => {
    it('returns zero totals when no entries', async () => {
      const result = await computer.compute(makeCtx());
      expect(result.totalAllTime).toBe(0);
      expect(result.totalThisYear).toBe(0);
      expect(result.totalThisMonth).toBe(0);
      expect(result.booksWithCost).toBe(0);
      expect(result.totalSalesRevenue).toBe(0);
      expect(result.totalBooksSold).toBe(0);
    });
  });

  // ── Basic spending totals ──────────────────────────────────────────────────

  describe('basic spending', () => {
    it('accumulates totalAllTime from entry base amount', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ amount: 100 })] });
      const result = await computer.compute(ctx);
      expect(result.totalAllTime).toBe(100);
      expect(result.booksWithCost).toBe(1);
    });

    it('adds shipping amount to total', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ amount: 80, shipping: 20 })] });
      const result = await computer.compute(ctx);
      expect(result.totalAllTime).toBe(100);
      expect(result.totalShipping).toBeCloseTo(20, 2);
    });

    it('adds fees to total', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({
            amount: 80,
            fees: [{ amount: 10, currency: 'EUR', date: '2024-01-15T00:00:00Z', category: 'OTHER' }],
          }),
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.totalAllTime).toBe(90);
      expect(result.totalOtherFees).toBeCloseTo(10, 2);
    });

    it('subtracts discounts from total', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({
            amount: 100,
            discounts: [{ amount: 15, currency: 'EUR', date: '2024-01-15T00:00:00Z' }],
          }),
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.totalAllTime).toBe(85);
      expect(result.totalDiscounts).toBeCloseTo(15, 2);
    });

    it('subtracts refunds from total', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({
            amount: 100,
            refunds: [{ amount: 20, currency: 'EUR', date: '2024-01-15T00:00:00Z' }],
          }),
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.totalAllTime).toBe(80);
      expect(result.totalRefunds).toBeCloseTo(20, 2);
    });

    it('skips entry with zero net cost', async () => {
      const ctx = makeCtx({
        entries: [makeEntry({ amount: 0 })],
      });
      const result = await computer.compute(ctx);
      expect(result.totalAllTime).toBe(0);
      expect(result.booksWithCost).toBe(0);
    });
  });

  // ── entryCount splitting ────────────────────────────────────────────────────

  describe('purchase group with multiple entries', () => {
    it('splits group total evenly across book entries', async () => {
      const ctx = makeCtx({
        entries: [makeEntry({ amount: 200, entryCount: 2 })],
      });
      const result = await computer.compute(ctx);
      expect(result.totalAllTime).toBe(100); // 200 / 2 per-entry
    });
  });

  // ── Year / month bucketing ─────────────────────────────────────────────────

  describe('year and month bucketing', () => {
    it('buckets spending into byYear', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({ amount: 100, purchasedAt: '2023-06-01T00:00:00Z' }),
          makeEntry({ amount: 50, purchasedAt: '2024-01-15T00:00:00Z' }),
        ],
      });
      const result = await computer.compute(ctx);
      const y2023 = (result.byYear as Array<{ year: number; amount: number }>).find((y) => y.year === 2023);
      const y2024 = (result.byYear as Array<{ year: number; amount: number }>).find((y) => y.year === 2024);
      expect(y2023?.amount).toBe(100);
      expect(y2024?.amount).toBe(50);
    });

    it('counts booksThisYear for current year entries', async () => {
      const ctx = makeCtx({
        now: new Date('2024-03-15'),
        entries: [
          makeEntry({ amount: 40, purchasedAt: '2024-02-01T00:00:00Z' }),
          makeEntry({ amount: 40, purchasedAt: '2023-02-01T00:00:00Z' }),
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.booksThisYear).toBe(1);
    });

    it('counts booksThisMonth for current month entries', async () => {
      const ctx = makeCtx({
        now: new Date('2024-03-15'),
        entries: [
          makeEntry({ amount: 40, purchasedAt: '2024-03-05T00:00:00Z' }),
          makeEntry({ amount: 40, purchasedAt: '2024-02-01T00:00:00Z' }),
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.booksThisMonth).toBe(1);
    });
  });

  // ── byCompany ──────────────────────────────────────────────────────────────

  describe('byCompany aggregation', () => {
    it('aggregates spending by company', async () => {
      const company = { id: 'c1', name: 'Fairyloot', slug: 'fairyloot', brandColors: ['#6B21A8'] };
      const ctx = makeCtx({
        entries: [
          makeEntry({ amount: 80, company }),
          makeEntry({ amount: 60, company }),
        ],
      });
      const result = await computer.compute(ctx);
      const byCompany = result.byCompany as Array<{ slug: string; amount: number; books: number; primaryColor: string | null }>;
      const fairyloot = byCompany.find((c) => c.slug === 'fairyloot');
      expect(fairyloot?.amount).toBe(140);
      expect(fairyloot?.books).toBe(2);
      expect(fairyloot?.primaryColor).toBe('#6B21A8');
    });

    it('uses null primaryColor when company has no brandColors', async () => {
      const company = { id: 'c2', name: 'NoColor', slug: 'nocolor', brandColors: [] };
      const ctx = makeCtx({ entries: [makeEntry({ amount: 50, company })] });
      const result = await computer.compute(ctx);
      const byCompany = result.byCompany as Array<{ slug: string; primaryColor: string | null }>;
      expect(byCompany.find((c) => c.slug === 'nocolor')?.primaryColor).toBeNull();
    });
  });

  // ── Sales / P&L ────────────────────────────────────────────────────────────

  describe('sales and P&L from entry.salePrice', () => {
    it('computes profit entry in topProfit', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({
            amount: 100,
            salePrice: 180,
            saleDate: '2024-02-10T00:00:00Z',
          }),
        ],
      });
      const result = await computer.compute(ctx);
      const topProfit = result.topProfit as Array<{ amount: number }>;
      expect(topProfit[0].amount).toBe(80); // 180 - 100
    });

    it('computes loss entry in topLoss', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({
            amount: 100,
            salePrice: 60,
            saleDate: '2024-02-10T00:00:00Z',
          }),
        ],
      });
      const result = await computer.compute(ctx);
      const topLoss = result.topLoss as Array<{ amount: number }>;
      expect(topLoss[0].amount).toBe(-40); // 60 - 100
    });

    it('calculates ROI and holdDays in salesWithROI', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({
            amount: 100,
            purchasedAt: '2024-01-01T00:00:00Z',
            salePrice: 150,
            saleDate: '2024-04-01T00:00:00Z', // 91 days later
          }),
        ],
      });
      const result = await computer.compute(ctx);
      const salesWithROI = result.salesWithROI as Array<{ roi: number; holdDays: number; pl: number }>;
      expect(salesWithROI[0].roi).toBe(50); // (50/100)*100
      expect(salesWithROI[0].holdDays).toBe(91);
      expect(salesWithROI[0].pl).toBe(50);
    });

    it('tracks plByMonth keyed by sale month', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({ amount: 100, salePrice: 130, saleDate: '2024-02-15T00:00:00Z' }),
          makeEntry({ amount: 50, salePrice: 40, saleDate: '2024-02-20T00:00:00Z' }),
        ],
      });
      const result = await computer.compute(ctx);
      const plByMonth = result.plByMonth as Array<{ month: string; pl: number }>;
      const feb = plByMonth.find((m) => m.month === '2024-02');
      expect(feb?.pl).toBe(20); // 30 + (-10)
    });

    it('tracks plByCompany with primaryColor', async () => {
      const company = { id: 'c1', name: 'Bookish', slug: 'bookish', brandColors: ['#FF6347'] };
      const ctx = makeCtx({
        entries: [
          makeEntry({ amount: 100, salePrice: 160, saleDate: '2024-03-01T00:00:00Z', company }),
        ],
      });
      const result = await computer.compute(ctx);
      const plByCompany = result.plByCompany as Array<{ slug: string; pl: number; primaryColor: string | null }>;
      const bookish = plByCompany.find((c) => c.slug === 'bookish');
      expect(bookish?.pl).toBe(60);
      expect(bookish?.primaryColor).toBe('#FF6347');
    });
  });

  // ── SaleGroups (UserSaleGroup) ─────────────────────────────────────────────

  describe('saleGroups revenue', () => {
    it('accumulates totalSalesRevenue from saleGroups', async () => {
      const ctx = makeCtx({
        saleGroups: [
          makeSaleGroup({ totalAmount: 200, soldAt: '2024-02-01T00:00:00Z' }),
          makeSaleGroup({ totalAmount: 100, soldAt: '2024-03-05T00:00:00Z' }),
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.totalSalesRevenue).toBe(300);
    });

    it('buckets salesByYear from saleGroups', async () => {
      const ctx = makeCtx({
        saleGroups: [
          makeSaleGroup({ totalAmount: 200, soldAt: '2023-11-01T00:00:00Z' }),
          makeSaleGroup({ totalAmount: 100, soldAt: '2024-01-15T00:00:00Z' }),
        ],
      });
      const result = await computer.compute(ctx);
      const salesByYear = result.salesByYear as Array<{ year: number; amount: number }>;
      expect(salesByYear.find((y) => y.year === 2023)?.amount).toBe(200);
      expect(salesByYear.find((y) => y.year === 2024)?.amount).toBe(100);
    });

    it('aggregates salesByCompany with primaryColor from saleGroup entries', async () => {
      const company = { id: 'c1', name: 'Illumicrate', slug: 'illumicrate', brandColors: ['#7C3AED'] };
      const ctx = makeCtx({
        saleGroups: [
          makeSaleGroup({
            totalAmount: 120,
            entries: [{ allocatedAmount: 60, company }, { allocatedAmount: 60, company }],
          }),
        ],
      });
      const result = await computer.compute(ctx);
      const salesByCompany = result.salesByCompany as Array<{ slug: string; amount: number; primaryColor: string | null }>;
      const illumicrate = salesByCompany.find((c) => c.slug === 'illumicrate');
      expect(illumicrate?.amount).toBe(120);
      expect(illumicrate?.primaryColor).toBe('#7C3AED');
    });
  });

  // ── avgCostPerBook ─────────────────────────────────────────────────────────

  it('calculates avgCostPerBook correctly', async () => {
    const ctx = makeCtx({
      entries: [
        makeEntry({ amount: 80 }),
        makeEntry({ amount: 120 }),
      ],
    });
    const result = await computer.compute(ctx);
    expect(result.avgCostPerBook).toBe(100);
    expect(result.booksWithCost).toBe(2);
  });

  // ── Currency conversion ────────────────────────────────────────────────────

  it('applies currency conversion via convert function', async () => {
    const doubleCurrency = async (amount: number) => amount * 2;
    const ctx = makeCtx({
      entries: [makeEntry({ amount: 100, currency: 'USD' })],
      convert: doubleCurrency as StatsContext['convert'],
    });
    const result = await computer.compute(ctx);
    expect(result.totalAllTime).toBe(200);
  });
});
