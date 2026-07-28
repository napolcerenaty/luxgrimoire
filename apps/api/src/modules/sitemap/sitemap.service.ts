import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';

export interface SitemapEntry {
  slug: string;
  updatedAt: Date;
}

export interface SitemapData {
  books: SitemapEntry[];
  editions: SitemapEntry[];
  authors: SitemapEntry[];
  artists: SitemapEntry[];
  companies: SitemapEntry[];
  series: SitemapEntry[];
  subscriptions: SitemapEntry[];
  saleAnnouncements: { id: string; updatedAt: Date }[];
}

@Injectable()
export class SitemapService {
  // The web app's sitemap.ts is deliberately request-time only (no build-time prerendering —
  // see its own comment for why), so it hits this endpoint on every crawl. Cache the assembled
  // result here instead, at the requested weekly cadence, rather than fighting Next.js's fetch
  // caching semantics on the client side.
  private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000;
  private readonly CACHE_KEY = 'sitemap:data';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getAll(): Promise<SitemapData> {
    const cached = await this.cache.get<SitemapData>(this.CACHE_KEY);
    if (cached) return cached;

    const result = await this.computeAll();
    await this.cache.set(this.CACHE_KEY, result, this.TTL_MS);
    return result;
  }

  /**
   * Every URL this returns must genuinely 200 on its public detail page — these mirror the
   * exact `where` filters (or lack thereof) each page's own findBySlug/findById uses, not
   * whatever "should" be indexable in the abstract. See sitemap.ts on the web app for how
   * this feeds the generated sitemap.
   */
  private async computeAll(): Promise<SitemapData> {
    const [books, editions, authors, artists, companies, series, subscriptions, saleAnnouncements] = await Promise.all([
      this.prisma.book.findMany({
        where: { status: 'approved' },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.bookEdition.findMany({
        where: { verifiedAt: { not: null } },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.author.findMany({
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.artist.findMany({
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.bookBoxCompany.findMany({
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.bookSeries.findMany({
        where: { entries: { some: { book: { status: 'approved' } } } },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.subscription.findMany({
        where: { isHidden: false },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.saleAnnouncement.findMany({
        where: { OR: [{ editions: { some: {} } }, { saleType: { in: ['OVERSTOCK', 'SALE'] } }] },
        select: { id: true, updatedAt: true },
      }),
    ]);

    return {
      books,
      editions,
      authors,
      artists,
      companies,
      series,
      subscriptions,
      saleAnnouncements,
    };
  }
}
