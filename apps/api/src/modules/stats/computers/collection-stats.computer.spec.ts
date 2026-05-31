import { CollectionStatsComputer } from './collection-stats.computer';
import type { StatsContext, StatsEntryData } from '../stats.context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const noopConvert = async (amount: number) => amount;

function makeCtx(overrides: Partial<StatsContext> = {}): StatsContext {
  return {
    userId: 'user-1',
    currency: 'EUR',
    year: null,
    now: new Date('2024-03-15T12:00:00Z'),
    entries: [],
    saleGroups: [],
    convert: noopConvert as StatsContext['convert'],
    ...overrides,
  };
}

function makeEntry(opts: {
  ownershipStatus?: string;
  readingStatus?: string;
  isWishlist?: boolean;
  signatureType?: string | null;
  amount?: number;
  currency?: string;
  purchasedAt?: string;
  company?: { id: string; name: string; slug: string; brandColors: string[] } | null;
  subscriptionSlug?: string | null;
  isSecondHand?: boolean;
}): StatsEntryData {
  const {
    ownershipStatus = 'OWNED',
    readingStatus = 'UNREAD',
    isWishlist = false,
    signatureType = null,
    amount = 100,
    currency = 'EUR',
    purchasedAt = '2024-01-10T00:00:00Z',
    company = null,
    subscriptionSlug = null,
    isSecondHand = false,
  } = opts;

  return {
    id: `entry-${Math.random()}`,
    userId: 'user-1',
    ownershipStatus,
    readingStatus,
    isWishlist,
    signatureType,
    salePrice: null,
    saleCurrency: null,
    saleDate: null,
    purchaseGroup: amount > 0
      ? {
          id: 'pg-1',
          currency,
          totalAmount: amount,
          shippingAmount: null,
          purchasedAt: new Date(purchasedAt),
          isSecondHand,
          bookEntries: [{ id: 'entry-id' }],
          fees: [],
          discounts: [],
          refunds: [],
        }
      : null,
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
      bookBoxCompany: subscriptionSlug ? null : company,
      book: {
        title: 'Test Book',
        slug: 'test-book',
        authors: [],
      },
      featureTags: [],
    },
  } as unknown as StatsEntryData;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CollectionStatsComputer', () => {
  let computer: CollectionStatsComputer;

  beforeEach(() => {
    computer = new CollectionStatsComputer();
  });

  it('has key "collection" and version 4', () => {
    expect(computer.key).toBe('collection');
    expect(computer.version).toBe(4);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('returns zero totals for empty entries', async () => {
    const result = await computer.compute(makeCtx());
    expect(result.totalBooks).toBe(0);
    expect(result.ownedCount).toBe(0);
    expect(result.signedCount).toBe(0);
    expect(result.unreadCount).toBe(0);
    expect(result.firstHandCount).toBe(0);
    expect(result.secondHandCount).toBe(0);
  });

  // ── Ownership status ───────────────────────────────────────────────────────

  describe('ownership status counts', () => {
    it('counts OWNED entries', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ ownershipStatus: 'OWNED' })] });
      const result = await computer.compute(ctx);
      expect(result.totalBooks).toBe(1);
      expect(result.ownedCount).toBe(1);
    });

    it('counts PREORDER entries', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ ownershipStatus: 'PREORDER' })] });
      const result = await computer.compute(ctx);
      expect(result.preorderCount).toBe(1);
    });

    it('counts SHIPPING entries', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ ownershipStatus: 'SHIPPING' })] });
      const result = await computer.compute(ctx);
      expect(result.shippingCount).toBe(1);
    });

    it('counts SOLD entries', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ ownershipStatus: 'SOLD' })] });
      const result = await computer.compute(ctx);
      expect(result.soldCount).toBe(1);
    });

    it('counts TO_SELL entries', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ ownershipStatus: 'TO_SELL' })] });
      const result = await computer.compute(ctx);
      expect(result.toSellCount).toBe(1);
    });

    it('counts wishlist entries separately', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ isWishlist: true })] });
      const result = await computer.compute(ctx);
      expect(result.wishlistCount).toBe(1);
    });
  });

  // ── Reading status ─────────────────────────────────────────────────────────

  describe('reading status counts', () => {
    it('counts UNREAD for OWNED books', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({ ownershipStatus: 'OWNED', readingStatus: 'UNREAD' }),
          makeEntry({ ownershipStatus: 'PREORDER', readingStatus: 'UNREAD' }), // not counted
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.unreadCount).toBe(1);
    });

    it('counts READ entries', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ readingStatus: 'READ' })] });
      const result = await computer.compute(ctx);
      expect(result.readCount).toBe(1);
    });

    it('counts READING entries', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ readingStatus: 'READING' })] });
      const result = await computer.compute(ctx);
      expect(result.readingCount).toBe(1);
    });

    it('calculates unreadPercent as unread/owned*100', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({ ownershipStatus: 'OWNED', readingStatus: 'UNREAD' }),
          makeEntry({ ownershipStatus: 'OWNED', readingStatus: 'READ' }),
          makeEntry({ ownershipStatus: 'OWNED', readingStatus: 'UNREAD' }),
          makeEntry({ ownershipStatus: 'OWNED', readingStatus: 'UNREAD' }),
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.unreadPercent).toBe(75); // 3/4 * 100
    });
  });

  // ── Signed ────────────────────────────────────────────────────────────────

  it('counts signed books (any signatureType)', async () => {
    const ctx = makeCtx({
      entries: [
        makeEntry({ signatureType: 'BOOKPLATE' }),
        makeEntry({ signatureType: null }),
        makeEntry({ signatureType: 'SIGNED' }),
      ],
    });
    const result = await computer.compute(ctx);
    expect(result.signedCount).toBe(2);
    expect(result.signedPercent).toBeCloseTo(66.7, 0);
  });

  // ── Acquisition breakdown ──────────────────────────────────────────────────

  describe('acquisitionBreakdown', () => {
    it('counts subscription entries', async () => {
      const ctx = makeCtx({
        entries: [makeEntry({ subscriptionSlug: 'fairyloot', amount: 0 })],
      });
      const result = await computer.compute(ctx);
      expect((result.acquisitionBreakdown as { subscription: number }).subscription).toBe(1);
    });

    it('counts direct purchase entries (has purchaseGroup, no subscription)', async () => {
      const ctx = makeCtx({
        entries: [makeEntry({ amount: 80 })],
      });
      const result = await computer.compute(ctx);
      expect((result.acquisitionBreakdown as { direct: number }).direct).toBe(1);
    });

    it('counts unknown when no purchaseGroup and no subscription', async () => {
      const ctx = makeCtx({
        entries: [makeEntry({ amount: 0 })], // amount 0 → purchaseGroup null
      });
      const result = await computer.compute(ctx);
      expect((result.acquisitionBreakdown as { unknown: number }).unknown).toBe(1);
    });
  });

  // ── First-hand / second-hand ───────────────────────────────────────────────

  describe('market source', () => {
    it('counts firstHand when isSecondHand is false', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ isSecondHand: false })] });
      const result = await computer.compute(ctx);
      expect(result.firstHandCount).toBe(1);
      expect(result.secondHandCount).toBe(0);
    });

    it('counts secondHand when isSecondHand is true', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ isSecondHand: true })] });
      const result = await computer.compute(ctx);
      expect(result.secondHandCount).toBe(1);
      expect(result.firstHandCount).toBe(0);
    });

    it('does not count when no purchaseGroup', async () => {
      const ctx = makeCtx({ entries: [makeEntry({ amount: 0 })] }); // no purchaseGroup
      const result = await computer.compute(ctx);
      expect(result.firstHandCount).toBe(0);
      expect(result.secondHandCount).toBe(0);
    });
  });

  // ── byCompanyAll ──────────────────────────────────────────────────────────

  describe('byCompanyAll', () => {
    it('aggregates books by company', async () => {
      const company = { id: 'c1', name: 'Fairyloot', slug: 'fairyloot', brandColors: ['#6B21A8'] };
      const ctx = makeCtx({
        entries: [
          makeEntry({ company }),
          makeEntry({ company }),
          makeEntry({ company: { id: 'c2', name: 'Illumicrate', slug: 'illumicrate', brandColors: [] } }),
        ],
      });
      const result = await computer.compute(ctx);
      const byCompanyAll = result.byCompanyAll as Array<{ slug: string; books: number; primaryColor: string | null }>;
      const fairyloot = byCompanyAll.find((c) => c.slug === 'fairyloot');
      expect(fairyloot?.books).toBe(2);
      expect(fairyloot?.primaryColor).toBe('#6B21A8');
    });

    it('sets primaryColor to null when brandColors is empty', async () => {
      const company = { id: 'c2', name: 'NoColor', slug: 'nocolor', brandColors: [] };
      const ctx = makeCtx({ entries: [makeEntry({ company })] });
      const result = await computer.compute(ctx);
      const byCompanyAll = result.byCompanyAll as Array<{ slug: string; primaryColor: string | null }>;
      expect(byCompanyAll.find((c) => c.slug === 'nocolor')?.primaryColor).toBeNull();
    });

    it('uses subscription company when no direct bookBoxCompany', async () => {
      const company = { id: 'c3', name: 'OwlCrate', slug: 'owlcrate', brandColors: ['#0EA5E9'] };
      const ctx = makeCtx({
        entries: [makeEntry({ subscriptionSlug: 'owlcrate-standard', company, amount: 0 })],
      });
      const result = await computer.compute(ctx);
      const byCompanyAll = result.byCompanyAll as Array<{ slug: string; books: number }>;
      // subscription company slug won't appear since we check edition.bookBoxCompany first;
      // entry has subscriptionEntry with company
      expect(byCompanyAll.some((c) => c.slug === 'owlcrate')).toBe(true);
    });
  });

  // ── Pipeline values ────────────────────────────────────────────────────────

  describe('pipeline values', () => {
    it('accumulates unreadShelfValue for OWNED+UNREAD books', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({ ownershipStatus: 'OWNED', readingStatus: 'UNREAD', amount: 80 }),
          makeEntry({ ownershipStatus: 'OWNED', readingStatus: 'READ', amount: 50 }), // not counted
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.unreadShelfValue).toBe(80);
    });

    it('accumulates preorderValue for PREORDER books', async () => {
      const ctx = makeCtx({
        entries: [
          makeEntry({ ownershipStatus: 'PREORDER', amount: 60 }),
          makeEntry({ ownershipStatus: 'OWNED', amount: 40 }),
        ],
      });
      const result = await computer.compute(ctx);
      expect(result.preorderValue).toBe(60);
    });

    it('accumulates shippingValue for SHIPPING books', async () => {
      const ctx = makeCtx({
        entries: [makeEntry({ ownershipStatus: 'SHIPPING', amount: 55 })],
      });
      const result = await computer.compute(ctx);
      expect(result.shippingValue).toBe(55);
    });
  });

  // ── percent calculations ───────────────────────────────────────────────────

  it('returns zero signedPercent when no books', async () => {
    const result = await computer.compute(makeCtx());
    expect(result.signedPercent).toBe(0);
  });

  it('returns zero unreadPercent when no owned books', async () => {
    const ctx = makeCtx({ entries: [makeEntry({ ownershipStatus: 'PREORDER' })] });
    const result = await computer.compute(ctx);
    expect(result.unreadPercent).toBe(0);
  });
});
