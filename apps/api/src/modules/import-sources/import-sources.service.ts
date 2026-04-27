import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CreateImportSourceDto, UpdateImportSourceDto } from './import-sources.dto';

export interface ScrapedMonthData {
  year: number | null;
  month: number | null;
  theme: string | null;
  bookTitle: string | null;
  bookAuthor: string | null;
  imageUrl: string | null;
  allImages: string[];
  sourceUrl: string;
}

const MONTH_EXTRACT_PROMPT = `You are a subscription box reveal data extractor.
Given a blog post, newsletter, or announcement about a book subscription box monthly reveal, extract structured information.

Return ONLY valid JSON matching this schema (use null for fields you cannot find):
{
  "year": 2025,
  "month": 3,
  "theme": "A Wrinkle in Time",
  "bookTitle": "Title of the main book",
  "bookAuthor": "Author Name",
  "imageUrl": "https://... (the main/hero image if you can see a URL in the text)"
}

RULES:
- year: 4-digit integer, e.g. 2025
- month: integer 1-12 (1 = January, 12 = December)
- theme: the box theme name (e.g. "Shades of Magic", "The Priory of the Orange Tree") — usually the book title or a thematic name
- bookTitle: the main featured book title
- bookAuthor: the main book's author full name
- imageUrl: the first or most prominent image URL found in the content, or null if none visible
- If the post covers multiple books, pick the main/headliner book`;

const SSRF_BLOCKED_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.0\.0\.0|::1)/i;

function validateUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException('URL must use http or https');
  }
  if (SSRF_BLOCKED_RE.test(parsed.hostname)) {
    throw new BadRequestException('URL points to a disallowed host');
  }
  return parsed;
}

/** Strip HTML tags and decode basic entities, returning plain text.
 * Tries to extract the main content area first, falls back to full body. */
function htmlToText(html: string): string {
  // Try to isolate main content (article, main, .post-content etc.)
  const contentMatch =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<div[^>]+class="[^"]*(?:post|entry|content|blog)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const source = contentMatch ? contentMatch[1] : html;

  return source
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 12000); // increased cap
}

/** Extract all image URLs from raw HTML — handles src, data-src, og:image, srcset */
function extractImages(html: string): string[] {
  const urls = new Set<string>();

  // og:image / twitter:image meta tags (highest quality, usually the hero image)
  for (const m of html.matchAll(/content=['"](https?:\/\/[^'"]+\.(jpe?g|png|webp|gif)[^'"]*)['"]/gi)) {
    urls.add(m[1]);
  }
  // <img src=...>
  for (const m of html.matchAll(/<img[^>]+src=['"](https?:\/\/[^'"]+)['"]/gi)) {
    if (!m[1].includes('data:')) urls.add(m[1]);
  }
  // <img data-src=...> (lazy loading)
  for (const m of html.matchAll(/<img[^>]+data-src=['"](https?:\/\/[^'"]+)['"]/gi)) {
    urls.add(m[1]);
  }
  // <img data-lazy-src=...>
  for (const m of html.matchAll(/<img[^>]+data-lazy-src=['"](https?:\/\/[^'"]+)['"]/gi)) {
    urls.add(m[1]);
  }
  // <img data-original=...> (another common lazy pattern)
  for (const m of html.matchAll(/<img[^>]+data-original=['"](https?:\/\/[^'"]+)['"]/gi)) {
    urls.add(m[1]);
  }
  // srcset — take the last (largest) URL from each srcset
  for (const m of html.matchAll(/srcset=['"](https?:\/\/[^'"]+)['"]/gi)) {
    const parts = m[1].split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last?.startsWith('http')) urls.add(last);
  }

  // Filter out tiny icons/trackers (very short URLs or known tracker patterns)
  return [...urls]
    .filter(u => !u.includes('gravatar') && !u.includes('avatar') && u.length > 20)
    .slice(0, 20);
}

/** Extract post/article links from a listing/archive page.
 *
 * Strategy:
 * 1. Look for links inside <article>, <main>, or common blog list containers (higher priority).
 * 2. Fall back to all same-domain links (lower priority).
 * 3. Filter out navigation, tags, categories, authors, pages, feeds, etc.
 * 4. Require paths with ≥ 2 meaningful segments (rules out /about, /contact, /category/).
 * 5. Return up to 50 results sorted by priority (content-area links first).
 */
function extractPostLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);

  // Non-post path prefixes to skip
  const SKIP_RE = /^\/(tag|tags|category|categories|author|authors|search|feed|wp-content|wp-admin|wp-json|page|pages|cdn-cgi|s=|#)/i;

  // href → priority (2 = found inside article/main, 1 = found elsewhere on page)
  const links = new Map<string, number>();

  const addLink = (href: string, priority: number) => {
    try {
      const abs = new URL(href, base.origin).href;
      const u = new URL(abs);
      if (u.hostname !== base.hostname) return;
      const path = u.pathname.replace(/\/$/, '');
      if (!path || path === base.pathname) return; // skip current page
      if (SKIP_RE.test(path)) return;
      // Require at least 2 path segments (/blog/my-post, /2024/08/reveal, etc.)
      const segments = path.split('/').filter(Boolean);
      if (segments.length < 2) return;
      const current = links.get(abs) ?? 0;
      if (priority > current) links.set(abs, priority);
    } catch {
      // ignore bad hrefs
    }
  };

  // Pass 1: extract links from <article> and <main> blocks
  for (const m of html.matchAll(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/gi)) {
    for (const a of m[1].matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
      addLink(a[1], 2);
    }
  }
  // Also try common blog list div classes (post-list, entries, etc.)
  for (const m of html.matchAll(/<div[^>]+class=["'][^"']*(?:post|entry|entries|blog-list|archive|listing)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    for (const a of m[1].matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
      addLink(a[1], 2);
    }
  }

  // Pass 2: all same-domain links (lower priority, catches any leftovers)
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    addLink(m[1], 1);
  }

  return [...links.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 50);
}

@Injectable()
export class ImportSourcesService {
  private readonly logger = new Logger(ImportSourcesService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  // ---------------------------------------------------------------------------
  // Import Sources CRUD
  // ---------------------------------------------------------------------------

  findAll(subscriptionId?: string) {
    return this.prisma.importSource.findMany({
      where: subscriptionId ? { subscriptionId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const source = await this.prisma.importSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Import source not found');
    return source;
  }

  create(dto: CreateImportSourceDto) {
    return this.prisma.importSource.create({ data: dto });
  }

  async update(id: string, dto: UpdateImportSourceDto) {
    await this.findOne(id);
    return this.prisma.importSource.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.importSource.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Scraping
  // ---------------------------------------------------------------------------

  async scrapeUrl(url: string, subscriptionId?: string, companyId?: string): Promise<ScrapedMonthData> {
    validateUrl(url);
    const html = await this.fetchHtml(url);
    const text = htmlToText(html);
    const allImages = extractImages(html);

    const extracted = await this.aiExtractMonth(text, url);
    return {
      ...extracted,
      allImages,
      imageUrl: extracted.imageUrl ?? allImages[0] ?? null,
      sourceUrl: url,
    };
  }

  async scrapeParent(url: string): Promise<{ links: string[] }> {
    validateUrl(url);
    const html = await this.fetchHtml(url);
    const links = extractPostLinks(html, url);
    return { links };
  }

  // ---------------------------------------------------------------------------
  // Pending Month Imports
  // ---------------------------------------------------------------------------

  findPending(subscriptionId?: string, status?: string) {
    return this.prisma.pendingMonthImport.findMany({
      where: {
        ...(subscriptionId ? { subscriptionId } : {}),
        status: status ?? 'PENDING',
      },
      include: { subscription: { select: { id: true, slug: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPending(data: {
    subscriptionId?: string;
    importSourceId?: string;
    year: number;
    month: number;
    theme?: string;
    coverImageUrl?: string;
    bookTitle?: string;
    bookAuthor?: string;
    sourceUrl: string;
    allImages?: string[];
  }) {
    return this.prisma.pendingMonthImport.create({ data });
  }

  async approvePending(id: string, adminNote?: string) {
    const pending = await this.prisma.pendingMonthImport.findUnique({ where: { id } });
    if (!pending) throw new NotFoundException('Pending import not found');
    if (pending.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING imports can be approved');
    }

    // Create the actual subscription month
    let month = null;
    if (pending.subscriptionId) {
      month = await this.prisma.subscriptionMonth.create({
        data: {
          subscriptionId: pending.subscriptionId,
          year: pending.year,
          month: pending.month,
          theme: pending.theme ?? undefined,
          coverImage: pending.coverImageUrl ?? undefined,
        },
      });
    }

    await this.prisma.pendingMonthImport.update({
      where: { id },
      data: { status: 'APPROVED', adminNote },
    });

    return { ok: true, month };
  }

  async rejectPending(id: string, adminNote?: string) {
    const pending = await this.prisma.pendingMonthImport.findUnique({ where: { id } });
    if (!pending) throw new NotFoundException('Pending import not found');
    await this.prisma.pendingMonthImport.update({
      where: { id },
      data: { status: 'REJECTED', adminNote },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Cron: auto-check enabled sources
  // ---------------------------------------------------------------------------

  @Cron(CronExpression.EVERY_HOUR)
  async runScheduledChecks() {
    const now = new Date();
    const hour = now.getUTCHours();
    const dayOfWeek = now.getUTCDay(); // 0=Sun
    const dayOfMonth = now.getUTCDate();

    const sources = await this.prisma.importSource.findMany({
      where: { enabled: true },
    });

    for (const source of sources) {
      try {
        const shouldRun = this.shouldRunNow(source, hour, dayOfWeek, dayOfMonth);
        if (!shouldRun) continue;

        this.logger.log(`Checking import source: ${source.name} (${source.id})`);
        await this.checkSource(source);
        await this.prisma.importSource.update({
          where: { id: source.id },
          data: { lastCheckedAt: now },
        });
      } catch (err) {
        this.logger.error(`Error checking source ${source.id}: ${err}`);
      }
    }
  }

  /** Trigger immediate check for a single source */
  async triggerCheck(id: string) {
    const source = await this.findOne(id);
    await this.checkSource(source);
    await this.prisma.importSource.update({
      where: { id },
      data: { lastCheckedAt: new Date() },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private shouldRunNow(
    source: { checkFrequency: string; checkHour: number; checkDayOfWeek: number | null; checkDayOfMonth: number | null },
    hour: number,
    dayOfWeek: number,
    dayOfMonth: number,
  ): boolean {
    if (source.checkHour !== hour) return false;
    if (source.checkFrequency === 'DAILY') return true;
    if (source.checkFrequency === 'WEEKLY') {
      return source.checkDayOfWeek !== null ? dayOfWeek === source.checkDayOfWeek : dayOfWeek === 1;
    }
    if (source.checkFrequency === 'MONTHLY') {
      return source.checkDayOfMonth !== null ? dayOfMonth === source.checkDayOfMonth : dayOfMonth === 1;
    }
    return false;
  }

  private async checkSource(source: { id: string; url: string; sourceType: string; subscriptionId: string | null; companyId: string | null; monthThemeKeywords: string | null }) {
    let urls: string[] = [];
    if (source.sourceType === 'BLOG_LISTING') {
      const { links } = await this.scrapeParent(source.url);
      urls = links.slice(0, 10); // process at most 10 new posts per run
    } else {
      urls = [source.url];
    }

    for (const url of urls) {
      // Skip if we already have a pending/approved import from this URL
      const existing = await this.prisma.pendingMonthImport.findFirst({
        where: { sourceUrl: url, status: { in: ['PENDING', 'APPROVED'] } },
      });
      if (existing) continue;

      try {
        const data = await this.scrapeUrl(url, source.subscriptionId ?? undefined, source.companyId ?? undefined);
        if (!data.year || !data.month) continue; // skip if AI couldn't determine date

        await this.createPending({
          subscriptionId: source.subscriptionId ?? undefined,
          importSourceId: source.id,
          year: data.year,
          month: data.month,
          theme: data.theme ?? undefined,
          coverImageUrl: data.imageUrl ?? undefined,
          bookTitle: data.bookTitle ?? undefined,
          bookAuthor: data.bookAuthor ?? undefined,
          sourceUrl: url,
          allImages: data.allImages,
        });
        this.logger.log(`Created pending import ${data.year}/${data.month} from ${url}`);
      } catch (err) {
        this.logger.warn(`Failed to scrape ${url}: ${err}`);
      }
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LuxgrimoireBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new BadRequestException(`Failed to fetch URL: HTTP ${response.status}`);
    }
    return response.text();
  }

  private async aiExtractMonth(text: string, sourceUrl: string): Promise<Omit<ScrapedMonthData, 'allImages' | 'sourceUrl'>> {
    if (!this.openai) {
      // No AI configured — return empty result
      return { year: null, month: null, theme: null, bookTitle: null, bookAuthor: null, imageUrl: null };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: MONTH_EXTRACT_PROMPT },
          { role: 'user', content: `Extract subscription box reveal data from this content:\n\nURL: ${sourceUrl}\n\n${text}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 400,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return { year: null, month: null, theme: null, bookTitle: null, bookAuthor: null, imageUrl: null };

      const parsed = JSON.parse(content);
      return {
        year: typeof parsed.year === 'number' ? parsed.year : null,
        month: typeof parsed.month === 'number' ? parsed.month : null,
        theme: parsed.theme ?? null,
        bookTitle: parsed.bookTitle ?? null,
        bookAuthor: parsed.bookAuthor ?? null,
        imageUrl: parsed.imageUrl ?? null,
      };
    } catch (err) {
      this.logger.warn(`AI month extraction failed: ${err}`);
      return { year: null, month: null, theme: null, bookTitle: null, bookAuthor: null, imageUrl: null };
    }
  }
}
