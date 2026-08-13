import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CacheEntry { rate: number; expiresAt: number }

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  /** In-memory cache: key = `FROM:TO:YYYY-MM-DD`, TTL = 1h for today, 24h for past */
  private readonly rateCache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get exchange rate for a specific date.
   * Checks in-memory cache first, then DB (ExchangeRateHistory), then Frankfurter API.
   * ECB only publishes on business days — weekend dates fall back to the last available rate.
   */
  async getRateForDate(fromCurrency: string, toCurrency: string, date: Date): Promise<number> {
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return 1;

    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    // Cap future dates to today — ECB/Frankfurter doesn't publish future rates
    const today = new Date();
    const effectiveDate = date > today ? today : date;

    const dateStr = effectiveDate.toISOString().slice(0, 10);
    const targetDate = new Date(dateStr + 'T00:00:00.000Z');
    const cacheKey = `${from}:${to}:${dateStr}`;

    // 0. In-memory cache
    const mem = this.rateCache.get(cacheKey);
    if (mem && Date.now() < mem.expiresAt) return mem.rate;

    // 1. Check local DB history — closest record on or before target date
    const cached = await this.prisma.exchangeRateHistory.findFirst({
      where: { fromCurrency: from, toCurrency: to, date: { lte: targetDate } },
      orderBy: { date: 'desc' },
    });

    // Use cached rate if it's within 7 days (handles weekends + short gaps)
    if (cached) {
      const diffDays = (targetDate.getTime() - cached.date.getTime()) / 86_400_000;
      if (diffDays <= 7) {
        const rate = Number(cached.rate);
        this.setCache(cacheKey, rate, dateStr);
        return rate;
      }
    }

    // 2. Fetch from Frankfurter API
    try {
      const rate = await this.fetchAndCache(from, to, targetDate);
      this.setCache(cacheKey, rate, dateStr);
      return rate;
    } catch (err) {
      // 3. Frankfurter unreachable — fall back to the last known rate on file,
      // however old, rather than a hard failure. Not written to ExchangeRateHistory
      // (that stays reserved for real fetched rates) and cached only briefly so the
      // next request retries the real fetch instead of getting stuck on stale data.
      if (cached) {
        const rate = Number(cached.rate);
        this.logger.warn(
          `Falling back to stale rate for ${from}→${to} (from ${cached.date.toISOString().slice(0, 10)}) after fetch failure for ${dateStr}`,
        );
        this.setFallbackCache(cacheKey, rate);
        return rate;
      }
      throw err;
    }
  }

  /**
   * Pre-warm the in-memory rate cache for a batch of conversions.
   * Reduces N+1 DB queries to one per unique currency pair.
   * Key optimisation for stats endpoints that process many entries.
   */
  async warmCacheBatch(
    entries: Array<{ from: string; date: Date }>,
    toCurrency: string,
  ): Promise<void> {
    const to = toCurrency.toUpperCase()
    const today = new Date()

    // Collect unique (from, dateStr) pairs not already in-memory cache
    const needed = new Map<string, Set<string>>() // from → Set<dateStr>

    for (const { from, date } of entries) {
      const f = from.toUpperCase()
      if (f === to) continue
      const effectiveDate = date > today ? today : date
      const dateStr = effectiveDate.toISOString().slice(0, 10)
      const cached = this.rateCache.get(`${f}:${to}:${dateStr}`)
      if (cached && Date.now() < cached.expiresAt) continue
      if (!needed.has(f)) needed.set(f, new Set())
      needed.get(f)!.add(dateStr)
    }

    if (needed.size === 0) return

    // One DB query per unique source currency, covering the full date range needed
    await Promise.all(
      [...needed.entries()].map(async ([from, dates]) => {
        const dateStrs = [...dates].sort()
        const minDate = new Date(dateStrs[0] + 'T00:00:00.000Z')
        minDate.setDate(minDate.getDate() - 7) // 7-day lookback for weekend/holiday gaps
        const maxDate = new Date(dateStrs[dateStrs.length - 1] + 'T00:00:00.000Z')

        const rates = await this.prisma.exchangeRateHistory.findMany({
          where: { fromCurrency: from, toCurrency: to, date: { gte: minDate, lte: maxDate } },
          orderBy: { date: 'asc' },
          select: { date: true, rate: true },
        })

        for (const dateStr of dateStrs) {
          const cacheKey = `${from}:${to}:${dateStr}`
          if (this.rateCache.get(cacheKey)) continue
          const target = new Date(dateStr + 'T00:00:00.000Z').getTime()
          const best = [...rates].reverse().find(r => r.date.getTime() <= target)
          if (best && (target - best.date.getTime()) / 86_400_000 <= 7) {
            this.setCache(cacheKey, Number(best.rate), dateStr)
          }
        }
      }),
    )
  }

  /** Convert amount between currencies on a given date. */
  async convert(amount: number, fromCurrency: string, toCurrency: string, date: Date): Promise<number> {
    const rate = await this.getRateForDate(fromCurrency, toCurrency, date);
    return Math.round(amount * rate * 100) / 100;
  }

  /**
   * Synchronous convert using only the in-memory cache (populated by warmCacheBatch).
   * Returns null if the rate is not already cached — caller must fall back to async convert().
   * Use this in tight loops after warmCacheBatch to avoid microtask overhead.
   */
  convertSyncFromCache(amount: number, fromCurrency: string, toCurrency: string, date: Date): number | null {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) return amount;

    const today = new Date();
    const effectiveDate = date > today ? today : date;
    const dateStr = effectiveDate.toISOString().slice(0, 10);
    const entry = this.rateCache.get(`${from}:${to}:${dateStr}`);
    if (!entry || Date.now() >= entry.expiresAt) return null;
    return Math.round(amount * entry.rate * 100) / 100;
  }

  /** Get the latest available rate (uses today's date). */
  async getCurrentRate(fromCurrency: string, toCurrency: string): Promise<number> {
    return this.getRateForDate(fromCurrency, toCurrency, new Date());
  }

  /**
   * Prefetch all daily rates for a date range and currency pair.
   * Useful for backfilling history or warming up cache.
   */
  async prefetchRates(fromCurrency: string, toCurrency: string, startDate: Date, endDate: Date): Promise<number> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    const start = startDate.toISOString().slice(0, 10);
    const end = endDate.toISOString().slice(0, 10);

    const url = `https://api.frankfurter.app/${start}..${end}?from=${from}&to=${to}`;
    this.logger.log(`Prefetching ${from}→${to} from ${start} to ${end}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Frankfurter API error ${response.status}: ${await response.text()}`);

    const data = (await response.json()) as {
      rates: Record<string, Record<string, number>>;
    };

    const entries = Object.entries(data.rates).map(([dateStr, rates]) => ({
      fromCurrency: from,
      toCurrency: to,
      rate: rates[to],
      date: new Date(dateStr + 'T00:00:00.000Z'),
    }));

    await this.prisma.$transaction(
      entries.map((r) =>
        this.prisma.exchangeRateHistory.upsert({
          where: { fromCurrency_toCurrency_date: { fromCurrency: r.fromCurrency, toCurrency: r.toCurrency, date: r.date } },
          create: r,
          update: { rate: r.rate, fetchedAt: new Date() },
        }),
      ),
    );

    // Warm up in-memory cache
    for (const e of entries) {
      const ds = e.date.toISOString().slice(0, 10);
      this.setCache(`${from}:${to}:${ds}`, e.rate, ds);
    }

    return entries.length;
  }

  /**
   * Fetch and store today's rate for a specific pair.
   * Updates both ExchangeRateHistory (dated) and ExchangeRateCache (latest).
   */
  async upsertCurrentRates(pairs: Array<{ from: string; to: string }>): Promise<void> {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const results: string[] = [];

    for (const { from, to } of pairs) {
      const f = from.toUpperCase();
      const t = to.toUpperCase();
      if (f === t) continue;
      try {
        const rate = await this.fetchAndCache(f, t, today);
        // Upsert into ExchangeRateCache (latest rate, one row per pair)
        await this.prisma.exchangeRateCache.upsert({
          where: { fromCurrency_toCurrency: { fromCurrency: f, toCurrency: t } },
          create: { fromCurrency: f, toCurrency: t, rate },
          update: { rate, fetchedAt: new Date() },
        });
        this.setCache(`${f}:${t}:${todayStr}`, rate, todayStr);
        results.push(`${f}→${t}: ${rate}`);
      } catch (err) {
        this.logger.warn(`[Cron] Failed to fetch ${f}→${t}: ${err}`);
      }
    }
    this.logger.log(`[Cron] Rates updated: ${results.join(', ')}`);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private setCache(key: string, rate: number, dateStr: string): void {
    const today = new Date().toISOString().slice(0, 10);
    // Today's rate expires in 1 hour (may update); past rates expire in 24 hours
    const ttl = dateStr === today ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    this.rateCache.set(key, { rate, expiresAt: Date.now() + ttl });
  }

  /** Short-lived cache entry for a stale fallback rate — retries the real fetch again in 3 minutes. */
  private setFallbackCache(key: string, rate: number): void {
    this.rateCache.set(key, { rate, expiresAt: Date.now() + 3 * 60 * 1000 });
  }

  private async fetchAndCache(from: string, to: string, date: Date): Promise<number> {
    const dateStr = date.toISOString().slice(0, 10);
    const url = `https://api.frankfurter.app/${dateStr}?from=${from}&to=${to}`;
    this.logger.log(`Fetching exchange rate ${from}→${to} for ${dateStr}`);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { date: string; rates: Record<string, number> };
      const rate = data.rates[to];
      if (!rate) throw new Error(`No rate for ${to} in response`);

      const actualDate = new Date(data.date + 'T00:00:00.000Z');

      await this.prisma.exchangeRateHistory.upsert({
        where: { fromCurrency_toCurrency_date: { fromCurrency: from, toCurrency: to, date: actualDate } },
        create: { fromCurrency: from, toCurrency: to, rate, date: actualDate },
        update: { rate, fetchedAt: new Date() },
      });

      return Number(rate);
    } catch (err) {
      this.logger.warn(`Failed to fetch rate ${from}→${to} for ${dateStr}: ${err}`);
      throw new Error(`Exchange rate unavailable for ${from}→${to} on ${dateStr}`);
    }
  }
}
