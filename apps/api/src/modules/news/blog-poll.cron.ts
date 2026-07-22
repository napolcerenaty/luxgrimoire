import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BlogCheckFrequency, BlogFeedType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NewsService } from './news.service';
import { extractTextFromHtml } from '../../common/utils/html-to-text.util';
import { assertPublicHttpsUrl } from '../../common/utils/ssrf-guard.util';
import { guessFeedCandidates, parseFeedXml, FeedEntry } from './blog-feed.util';

const FREQUENCY_MS: Record<BlogCheckFrequency, number> = {
  HOURLY: 60 * 60 * 1000,
  EVERY_6H: 6 * 60 * 60 * 1000,
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
};

// Only look at entries from the last 30 days on a company's very first check —
// otherwise a newly-configured company with years of blog history would flood
// the moderation queue with one draft per historical post.
const FIRST_CHECK_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class BlogPollCronService {
  private readonly logger = new Logger(BlogPollCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly newsService: NewsService,
  ) {}

  /**
   * Ticks every 15 min; each tick only touches companies whose blogCheckFrequency
   * interval has actually elapsed since blogLastCheckedAt (spec 10.1/2.1) — not a
   * separate cron schedule per company.
   */
  @Cron('*/15 * * * *')
  async pollDueCompanies() {
    const companies = await this.prisma.bookBoxCompany.findMany({
      where: { blogUrl: { not: null } },
      select: {
        id: true, name: true, blogUrl: true, rssUrlOverride: true,
        blogCheckFrequency: true, blogLastCheckedAt: true, blogFeedType: true,
      },
    });

    const due = companies.filter((c) => {
      if (!c.blogLastCheckedAt) return true;
      const intervalMs = FREQUENCY_MS[c.blogCheckFrequency];
      return Date.now() - c.blogLastCheckedAt.getTime() >= intervalMs;
    });

    for (const company of due) {
      try {
        await this.pollOne(company);
      } catch (err) {
        this.logger.error(`Blog poll failed for "${company.name}" (${company.blogUrl}): ${err}`);
      }
    }

    return { checked: due.length };
  }

  private async pollOne(company: {
    id: string; name: string; blogUrl: string | null; rssUrlOverride: string | null;
    blogCheckFrequency: BlogCheckFrequency; blogLastCheckedAt: Date | null; blogFeedType: BlogFeedType | null;
  }) {
    if (!company.blogUrl) return;
    const isFirstCheck = !company.blogLastCheckedAt;

    const { entries, resolvedFeedType } = await this.fetchEntries(company.blogUrl, company.rssUrlOverride, company.blogFeedType);

    const cutoff = isFirstCheck ? new Date(Date.now() - FIRST_CHECK_LOOKBACK_MS) : company.blogLastCheckedAt!;
    const newEntries = entries.filter((e) => !e.publishedAt || e.publishedAt > cutoff);

    for (const entry of newEntries) {
      const created = await this.newsService.ingestFromRssEntry({
        link: entry.link,
        title: entry.title,
        textContent: extractTextFromHtml(entry.contentHtml),
      });
      if (created) {
        this.logger.log(`Ingested RSS draft "${created.title}" for ${company.name}`);
      }
    }

    await this.prisma.bookBoxCompany.update({
      where: { id: company.id },
      data: { blogLastCheckedAt: new Date(), ...(resolvedFeedType ? { blogFeedType: resolvedFeedType } : {}) },
    });
  }

  /**
   * Resolves and fetches the feed for one company: explicit override first, else
   * the already-known feed type (skip re-probing once we've confirmed one works),
   * else try the known conventions in order (spec 2.1), else fall back to scraping
   * the blog page's raw HTML as a single pseudo-entry.
   */
  private async fetchEntries(
    blogUrl: string,
    rssUrlOverride: string | null,
    knownFeedType: BlogFeedType | null,
  ): Promise<{ entries: FeedEntry[]; resolvedFeedType: BlogFeedType | null }> {
    if (rssUrlOverride) {
      const xml = await this.fetchText(rssUrlOverride);
      return { entries: parseFeedXml(xml), resolvedFeedType: null };
    }

    const candidates = knownFeedType === 'HTML_SCRAPE'
      ? []
      : knownFeedType
        ? [{ feedType: knownFeedType, feedUrl: guessFeedCandidates(blogUrl).find((c) => c.feedType === knownFeedType)?.feedUrl ?? blogUrl }]
        : guessFeedCandidates(blogUrl);

    for (const candidate of candidates) {
      try {
        const xml = await this.fetchText(candidate.feedUrl);
        const entries = parseFeedXml(xml);
        if (entries.length > 0) {
          return { entries, resolvedFeedType: candidate.feedType };
        }
      } catch {
        // try the next convention
      }
    }

    // Fallback: scrape the blog page itself as one pseudo-entry (spec 2.1, HTML_SCRAPE).
    const html = await this.fetchText(blogUrl);
    return {
      entries: [{ title: 'Blog update', link: blogUrl, publishedAt: null, contentHtml: html }],
      resolvedFeedType: 'HTML_SCRAPE',
    };
  }

  private async fetchText(url: string): Promise<string> {
    assertPublicHttpsUrl(url);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LuxGrimoire/1.0; +https://luxgrimoire.com)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  }
}
