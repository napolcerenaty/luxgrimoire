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
    const dateStr = date.toISOString().slice(0, 10);
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
    const rate = await this.fetchAndCache(from, to, targetDate);
    this.setCache(cacheKey, rate, dateStr);
    return rate;
  }

  /** Convert amount between currencies on a given date. */
  async convert(amount: number, fromCurrency: string, toCurrency: string, date: Date): Promise<number> {
    const rate = await this.getRateForDate(fromCurrency, toCurrency, date);
    return Math.round(amount * rate * 100) / 100;
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

  // ─── Private ────────────────────────────────────────────────────────────────

  private setCache(key: string, rate: number, dateStr: string): void {
    const today = new Date().toISOString().slice(0, 10);
    // Today's rate expires in 1 hour (may update); past rates expire in 24 hours
    const ttl = dateStr === today ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    this.rateCache.set(key, { rate, expiresAt: Date.now() + ttl });
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
