import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from './currency.service';

function mockRes(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

const NOW = new Date('2026-09-06T12:00:00.000Z');
const d = (iso: string) => new Date(iso + 'T00:00:00.000Z');

describe('CurrencyService', () => {
  let service: CurrencyService;
  let prisma: DeepMockProxy<PrismaService>;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    service = new CurrencyService(prisma);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('getRateForDate', () => {
    it('returns 1 for the same currency (case-insensitive) without touching DB or network', async () => {
      const rate = await service.getRateForDate('usd', 'USD', d('2026-09-01'));
      expect(rate).toBe(1);
      expect(prisma.exchangeRateHistory.findFirst).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uses a DB history rate that is within 7 days of the target and skips the network', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue({
        rate: 4.1,
        date: d('2026-09-02'),
      });

      const rate = await service.getRateForDate('USD', 'PLN', d('2026-09-06'));

      expect(rate).toBe(4.1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('caches the DB rate in memory — a second call does not re-query the DB', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue({
        rate: 4.1,
        date: d('2026-09-02'),
      });

      await service.getRateForDate('USD', 'PLN', d('2026-09-06'));
      await service.getRateForDate('USD', 'PLN', d('2026-09-06'));

      expect(prisma.exchangeRateHistory.findFirst).toHaveBeenCalledTimes(1);
    });

    it('falls through to the Frankfurter fetch when the DB rate is older than 7 days', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue({
        rate: 3.9,
        date: d('2026-08-20'),
      });
      fetchMock.mockResolvedValue(mockRes({ date: '2026-09-06', rates: { PLN: 4.25 } }));

      const rate = await service.getRateForDate('USD', 'PLN', d('2026-09-06'));

      expect(rate).toBe(4.25);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(prisma.exchangeRateHistory.upsert).toHaveBeenCalledTimes(1);
    });

    it('fetches, persists and returns the rate when there is no DB history at all', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue(null);
      fetchMock.mockResolvedValue(mockRes({ date: '2026-09-06', rates: { PLN: 4.3 } }));

      const rate = await service.getRateForDate('USD', 'PLN', d('2026-09-06'));

      expect(rate).toBe(4.3);
      const upsertArg = (prisma.exchangeRateHistory.upsert as jest.Mock).mock.calls[0][0];
      expect(upsertArg.create).toMatchObject({ fromCurrency: 'USD', toCurrency: 'PLN', rate: 4.3 });
    });

    it('caps a future date to today when querying the DB', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue({
        rate: 4.0,
        date: d('2026-09-05'),
      });

      await service.getRateForDate('USD', 'PLN', d('2027-01-01'));

      const whereArg = (prisma.exchangeRateHistory.findFirst as jest.Mock).mock.calls[0][0];
      expect(whereArg.where.date.lte).toEqual(d('2026-09-06'));
    });

    it('falls back to a stale DB rate (without persisting it) when the fetch fails', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue({
        rate: 3.5,
        date: d('2026-01-01'),
      });
      fetchMock.mockResolvedValue(mockRes({}, false, 503));

      const rate = await service.getRateForDate('USD', 'PLN', d('2026-09-06'));

      expect(rate).toBe(3.5);
      expect(prisma.exchangeRateHistory.upsert).not.toHaveBeenCalled();
    });

    it('throws when the fetch fails and there is no DB rate to fall back to', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue(null);
      fetchMock.mockResolvedValue(mockRes({}, false, 503));

      await expect(service.getRateForDate('USD', 'PLN', d('2026-09-06'))).rejects.toThrow();
    });

    it('throws when the API response has no rate for the target currency', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue(null);
      fetchMock.mockResolvedValue(mockRes({ date: '2026-09-06', rates: {} }));

      await expect(service.getRateForDate('USD', 'PLN', d('2026-09-06'))).rejects.toThrow();
    });
  });

  describe('convert', () => {
    it('multiplies by the rate and rounds to 2 decimals', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue({
        rate: 4.1234,
        date: d('2026-09-06'),
      });

      const out = await service.convert(10, 'USD', 'PLN', d('2026-09-06'));
      expect(out).toBe(41.23);
    });

    it('returns the amount unchanged for the same currency', async () => {
      const out = await service.convert(12.5, 'PLN', 'PLN', d('2026-09-06'));
      expect(out).toBe(12.5);
    });
  });

  describe('convertSyncFromCache', () => {
    it('returns the amount for the same currency even with an empty cache', () => {
      expect(service.convertSyncFromCache(9, 'USD', 'USD', d('2026-09-06'))).toBe(9);
    });

    it('returns null when the rate is not cached', () => {
      expect(service.convertSyncFromCache(9, 'USD', 'PLN', d('2026-09-06'))).toBeNull();
    });

    it('returns a rounded conversion once the rate has been cached', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue({
        rate: 4.0,
        date: d('2026-09-01'),
      });
      await service.getRateForDate('USD', 'PLN', d('2026-09-01'));

      expect(service.convertSyncFromCache(3, 'USD', 'PLN', d('2026-09-01'))).toBe(12);
    });

    it('returns null once the cached entry has expired', async () => {
      (prisma.exchangeRateHistory.findFirst as jest.Mock).mockResolvedValue({
        rate: 4.0,
        date: d('2026-09-01'),
      });
      await service.getRateForDate('USD', 'PLN', d('2026-09-01'));

      jest.advanceTimersByTime(25 * 60 * 60 * 1000); // past the 24h TTL for past-dated rates

      expect(service.convertSyncFromCache(3, 'USD', 'PLN', d('2026-09-01'))).toBeNull();
    });
  });

  describe('warmCacheBatch', () => {
    it('runs one DB query per unique source currency and caches rates within 7 days', async () => {
      (prisma.exchangeRateHistory.findMany as jest.Mock).mockImplementation(({ where }: any) => {
        if (where.fromCurrency === 'USD') {
          return Promise.resolve([{ date: d('2026-08-31'), rate: 4.0 }]);
        }
        return Promise.resolve([{ date: d('2026-08-15'), rate: 4.5 }]); // EUR — >7 days stale
      });

      await service.warmCacheBatch(
        [
          { from: 'USD', date: d('2026-09-01') },
          { from: 'EUR', date: d('2026-09-01') },
          { from: 'PLN', date: d('2026-09-01') }, // same as target — skipped
        ],
        'PLN',
      );

      expect(prisma.exchangeRateHistory.findMany).toHaveBeenCalledTimes(2);
      expect(service.convertSyncFromCache(1, 'USD', 'PLN', d('2026-09-01'))).toBe(4);
      expect(service.convertSyncFromCache(1, 'EUR', 'PLN', d('2026-09-01'))).toBeNull();
    });

    it('does not query the DB when every requested pair is already cached', async () => {
      (prisma.exchangeRateHistory.findMany as jest.Mock).mockResolvedValue([
        { date: d('2026-08-31'), rate: 4.0 },
      ]);
      await service.warmCacheBatch([{ from: 'USD', date: d('2026-09-01') }], 'PLN');
      (prisma.exchangeRateHistory.findMany as jest.Mock).mockClear();

      await service.warmCacheBatch([{ from: 'USD', date: d('2026-09-01') }], 'PLN');

      expect(prisma.exchangeRateHistory.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentRate', () => {
    it('delegates to getRateForDate with the current time', async () => {
      const spy = jest.spyOn(service, 'getRateForDate').mockResolvedValue(3.9);

      const rate = await service.getCurrentRate('USD', 'PLN');

      expect(rate).toBe(3.9);
      expect(spy).toHaveBeenCalledWith('USD', 'PLN', expect.any(Date));
      expect((spy.mock.calls[0][2] as Date).getTime()).toBe(NOW.getTime());
    });
  });

  describe('prefetchRates', () => {
    it('upserts every day in the range, warms the cache and returns the count', async () => {
      fetchMock.mockResolvedValue(
        mockRes({ rates: { '2026-09-01': { PLN: 4.1 }, '2026-09-02': { PLN: 4.2 } } }),
      );

      const count = await service.prefetchRates('USD', 'PLN', d('2026-09-01'), d('2026-09-02'));

      expect(count).toBe(2);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.exchangeRateHistory.upsert).toHaveBeenCalledTimes(2);
      expect(service.convertSyncFromCache(1, 'USD', 'PLN', d('2026-09-01'))).toBe(4.1);
    });

    it('throws when the Frankfurter range endpoint returns a non-OK response', async () => {
      fetchMock.mockResolvedValue(mockRes('rate limited', false, 429));

      await expect(
        service.prefetchRates('USD', 'PLN', d('2026-09-01'), d('2026-09-02')),
      ).rejects.toThrow(/Frankfurter API error 429/);
    });
  });

  describe('upsertCurrentRates', () => {
    it('skips identical pairs and continues past a pair whose fetch fails', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('from=USD')) {
          return Promise.resolve(mockRes({ date: '2026-09-06', rates: { PLN: 4.25 } }));
        }
        return Promise.resolve(mockRes({}, false, 500)); // GBP fails
      });

      await service.upsertCurrentRates([
        { from: 'USD', to: 'PLN' },
        { from: 'EUR', to: 'EUR' }, // skipped
        { from: 'GBP', to: 'PLN' }, // fails, must not abort the loop
      ]);

      expect(prisma.exchangeRateCache.upsert).toHaveBeenCalledTimes(1);
      const arg = (prisma.exchangeRateCache.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.where.fromCurrency_toCurrency).toEqual({ fromCurrency: 'USD', toCurrency: 'PLN' });
    });
  });
});
