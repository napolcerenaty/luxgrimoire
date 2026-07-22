import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { NewsItemStatus, NewsItemType, NewsSourceType } from '@prisma/client';
import { CreateNewsDraftDto, UpdateNewsDraftDto } from './news.dto';
import { AiService } from '../ai/ai.service';
import { AiNewsParseResult } from '../ai/ai.service';
import { UploadService } from '../upload/upload.service';
import { extractTextFromHtml } from '../../common/utils/html-to-text.util';
import { assertPublicHttpsUrl } from '../../common/utils/ssrf-guard.util';
import { looksLikeConfirmationEmail, extractActionLink, extractTrackingPixelUrls } from './email-parse.util';

const SCREENSHOT_FOLDER = 'luxgrimoire/news-sources';
const STALE_NEWSLETTER_DEFAULT_DAYS = 60;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly uploadService: UploadService,
  ) {}

  // ─── Ingestion (Phase 2 — Instagram screenshot) ────────────────────────────

  /**
   * Screenshot -> AI classification/extraction -> stored image -> draft NewsItem.
   * Its source is always CONFIRMED (it genuinely is real content) — dedup (Phase 4)
   * instead flags the resulting NewsItem itself via possibleDuplicateOfId when it
   * looks like the same event as a recent item from the same company.
   */
  async ingestScreenshot(imageBase64: string, caption?: string) {
    const [parsed, uploaded] = await Promise.all([
      this.aiService.parseNewsAnnouncement({ imageBase64, text: caption }),
      this.uploadService.uploadImageBase64(this.toDataUri(imageBase64), SCREENSHOT_FOLDER),
    ]);

    return this.createDraftFromParsed(parsed, {
      sourceType: 'INSTAGRAM_SCREENSHOT',
      rawContentRef: uploaded.url,
    });
  }

  // ─── Ingestion (Phase 3 — RSS/blog) ─────────────────────────────────────────

  /**
   * One already-fetched feed entry -> AI classification -> draft NewsItem.
   * `externalRef` (the entry's own link) is how the poller avoids re-ingesting the
   * same feed item on every cron tick — returns null (no-op) if already seen.
   */
  async ingestFromRssEntry(entry: { link: string; title: string; textContent: string }) {
    const already = await this.prisma.newsSourceRecord.findUnique({ where: { externalRef: entry.link } });
    if (already) return null;

    const parsed = await this.aiService.parseNewsAnnouncement({
      text: `${entry.title}\n\n${entry.textContent}`,
      sourceUrl: entry.link,
    });

    return this.createDraftFromParsed(parsed, {
      sourceType: 'RSS',
      rawContentRef: entry.textContent,
      externalRef: entry.link,
      fallbackOriginalSourceUrl: entry.link,
    });
  }

  // ─── Ingestion (Phase 5 — newsletter e-mail) ───────────────────────────────

  /**
   * Raw email (already MIME-parsed by the Cloudflare Worker, spec 2.2) -> either
   * (a) a "needs action" queue entry if it looks like a subscription-confirmation
   * email (spec 2.2.1 — never auto-clicked, an admin does that manually), or
   * (b) a normal draft NewsItem via the same classification path as RSS/screenshot.
   */
  async ingestEmail(input: { subject: string; html: string; messageId?: string }) {
    if (input.messageId) {
      const already = await this.prisma.newsSourceRecord.findUnique({ where: { externalRef: input.messageId } });
      if (already) return null;
    }

    if (looksLikeConfirmationEmail(input.subject, input.html)) {
      const parsed = await this.aiService.parseNewsAnnouncement({ text: extractTextFromHtml(input.html) }).catch(() => null);
      return this.prisma.newsSourceRecord.create({
        data: {
          sourceType: 'EMAIL_ACTION_REQUIRED',
          rawContentRef: input.html,
          externalRef: input.messageId,
          companyName: parsed?.companyName,
          actionUrl: extractActionLink(input.html) ?? undefined,
          mergeStatus: 'PENDING_REVIEW',
        },
      });
    }

    const textContent = extractTextFromHtml(input.html);
    const parsed = await this.aiService.parseNewsAnnouncement({ text: `${input.subject}\n\n${textContent}` });

    const created = await this.createDraftFromParsed(parsed, {
      sourceType: 'EMAIL',
      rawContentRef: input.html,
      externalRef: input.messageId,
    });

    // Best-effort "simulate open" (spec 2.2) — fire-and-forget, never blocks/fails ingestion.
    void this.simulateOpen(input.html);

    return created;
  }

  /** GETs any open-tracking pixel found in the mail, so our address doesn't look chronically unengaged to the ESP. */
  private async simulateOpen(html: string): Promise<void> {
    const pixels = extractTrackingPixelUrls(html);
    await Promise.allSettled(
      pixels.map(async (url) => {
        try {
          assertPublicHttpsUrl(url);
          await fetch(url, { signal: AbortSignal.timeout(10_000) });
        } catch (err) {
          this.logger.warn(`Failed to simulate "open" for tracking pixel ${url}: ${err}`);
        }
      }),
    );
  }

  /** The "needs action" queue (spec 2.2.1) — subscription-confirmation emails awaiting a manual click. */
  async listActionRequired() {
    return this.prisma.newsSourceRecord.findMany({
      where: { sourceType: 'EMAIL_ACTION_REQUIRED' },
      orderBy: { ingestedAt: 'desc' },
    });
  }

  /** Admin clicked the link (or dismissed it) — removes it from the queue. Nothing else references this row. */
  async resolveActionRequired(id: string) {
    const record = await this.prisma.newsSourceRecord.findUnique({ where: { id } });
    if (!record || record.sourceType !== 'EMAIL_ACTION_REQUIRED') {
      throw new NotFoundException('Action-required item not found');
    }
    await this.prisma.newsSourceRecord.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Silent-drop-off monitor (spec 2.2): companies marked as newsletter-subscribed
   * with no EMAIL-sourced ingestion in the last `thresholdDays` — either they
   * stopped sending, or our address quietly fell off their list.
   */
  async findStaleNewsletterCompanies(thresholdDays = STALE_NEWSLETTER_DEFAULT_DAYS) {
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
    const subscribed = await this.prisma.bookBoxCompany.findMany({
      where: { newsletterSubscribed: true },
      select: { id: true, name: true },
    });

    // companyName lives on the source row itself (not just the NewsItem it currently
    // points to) precisely so this survives dedup-merges and hard-deletes of the item.
    const recentSenders = await this.prisma.newsSourceRecord.findMany({
      where: { sourceType: 'EMAIL', ingestedAt: { gte: cutoff } },
      select: { companyName: true },
    });
    const recentNames = new Set(recentSenders.map((r) => r.companyName?.toLowerCase()).filter(Boolean));

    return subscribed.filter((c) => !recentNames.has(c.name.toLowerCase()));
  }

  private async createDraftFromParsed(
    parsed: AiNewsParseResult,
    source: { sourceType: NewsSourceType; rawContentRef?: string; externalRef?: string; fallbackOriginalSourceUrl?: string },
  ) {
    if (!parsed.companyName && !parsed.title) {
      throw new BadRequestException('Could not extract any usable news information from this source');
    }

    const companyName = parsed.companyName ?? 'Unknown';
    const title = parsed.title ?? `${companyName} — news`;

    const possibleDuplicateOfId = await this.findDuplicateCandidate(companyName, title, parsed.summary);

    return this.prisma.newsItem.create({
      data: {
        companyName,
        title,
        type: this.mapAiType(parsed.type),
        summary: parsed.summary,
        originalSourceUrl: parsed.originalSourceUrl ?? source.fallbackOriginalSourceUrl,
        possibleDuplicateOfId,
        sources: {
          create: {
            sourceType: source.sourceType,
            rawContentRef: source.rawContentRef,
            externalRef: source.externalRef,
            // Denormalized onto the source row too (not just the NewsItem) so the
            // stale-newsletter monitor (findStaleNewsletterCompanies) still sees
            // "we did receive an email" even if this NewsItem later gets hard-deleted.
            companyName,
            mergeStatus: 'CONFIRMED',
          },
        },
      },
      include: { sources: true },
    });
  }

  // ─── Dedup (Phase 4, spec section 5) ───────────────────────────────────────

  private static readonly DEDUP_WINDOW_MS = 48 * 60 * 60 * 1000;

  /**
   * Cheap filter (same company, 48h window) first — only the survivors are worth
   * an LLM call. Returns the matching existing item's id, or null.
   */
  private async findDuplicateCandidate(companyName: string, title: string, summary?: string): Promise<string | null> {
    const cutoff = new Date(Date.now() - NewsService.DEDUP_WINDOW_MS);
    const candidates = await this.prisma.newsItem.findMany({
      where: {
        companyName: { equals: companyName, mode: 'insensitive' },
        OR: [
          { status: NewsItemStatus.DRAFT, createdAt: { gte: cutoff } },
          { status: NewsItemStatus.PUBLISHED, publishedAt: { gte: cutoff } },
        ],
      },
      select: { id: true, title: true, summary: true },
      take: 10,
    });
    if (candidates.length === 0) return null;

    const { duplicateOfId } = await this.aiService.checkForDuplicate({ title, summary }, candidates);
    return duplicateOfId;
  }

  /** Items flagged as a possible duplicate of another, awaiting admin review (spec 5a/5b). */
  async listPossibleDuplicates() {
    return this.prisma.newsItem.findMany({
      where: { possibleDuplicateOfId: { not: null } },
      include: { sources: true, possibleDuplicateOf: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Confirm the dedup match: this item's source(s) move onto the candidate, this
   * (now-empty) duplicate is discarded. If the candidate is already PUBLISHED,
   * this is the "confirm as update" path (spec 5b) — bumps lastUpdatedAt instead
   * of creating a second visible card.
   */
  async confirmDuplicate(id: string) {
    const item = await this.getOne(id);
    if (!item.possibleDuplicateOfId) {
      throw new BadRequestException('This item is not flagged as a possible duplicate');
    }
    const candidateId = item.possibleDuplicateOfId;
    const candidate = await this.getOne(candidateId);

    await this.prisma.newsSourceRecord.updateMany({ where: { newsItemId: id }, data: { newsItemId: candidateId } });
    await this.prisma.newsItem.delete({ where: { id } });

    if (candidate.status === NewsItemStatus.PUBLISHED) {
      return this.prisma.newsItem.update({ where: { id: candidateId }, data: { lastUpdatedAt: new Date() } });
    }
    return this.getOne(candidateId);
  }

  /** The match was wrong — un-flag it, it proceeds through normal moderation as its own item (spec 5a/5b). */
  async declineDuplicate(id: string) {
    const item = await this.getOne(id);
    if (!item.possibleDuplicateOfId) {
      throw new BadRequestException('This item is not flagged as a possible duplicate');
    }
    return this.prisma.newsItem.update({ where: { id }, data: { possibleDuplicateOfId: null } });
  }

  // ─── Public ─────────────────────────────────────────────────────────────────

  /**
   * Published news, newest first, optionally filtered to a single calendar day
   * (spec 9.1 — jump-to-date). `date` is a plain YYYY-MM-DD, interpreted as UTC.
   */
  async listPublished(page = 1, pageSize = 20, date?: string) {
    const { skip, take, page: p, pageSize: ps } = parsePagination({ page, pageSize });

    const dateRange = date ? this.parseDayRange(date) : null;
    if (date && !dateRange) {
      throw new BadRequestException('Invalid date — expected YYYY-MM-DD');
    }

    const where = {
      status: NewsItemStatus.PUBLISHED,
      ...(dateRange ? { publishedAt: { gte: dateRange.start, lt: dateRange.end } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.newsItem.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.newsItem.count({ where }),
    ]);

    return { data, meta: buildPageMeta(total, p, ps) };
  }

  /** Unread count for a logged-in user (cursor on User.newsLastSeenAt, spec 8.1). */
  async getUnreadCountForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { newsLastSeenAt: true } });
    const count = await this.prisma.newsItem.count({
      where: {
        status: NewsItemStatus.PUBLISHED,
        publishedAt: user?.newsLastSeenAt ? { gt: user.newsLastSeenAt } : undefined,
      },
    });
    return { count };
  }

  /** Unread count for an anonymous visitor, given the cursor from their `news_last_seen_at` cookie (spec 8.2). */
  async getUnreadCountSince(since?: string) {
    const sinceDate = since ? new Date(since) : null;
    if (since && (!sinceDate || Number.isNaN(sinceDate.getTime()))) {
      throw new BadRequestException('Invalid `since` — expected an ISO timestamp');
    }
    const count = await this.prisma.newsItem.count({
      where: {
        status: NewsItemStatus.PUBLISHED,
        publishedAt: sinceDate ? { gt: sinceDate } : undefined,
      },
    });
    return { count };
  }

  /** Marks everything currently published as seen for a logged-in user (spec 8.1). */
  async markSeenForUser(userId: string) {
    const seenAt = new Date();
    await this.prisma.user.update({ where: { id: userId }, data: { newsLastSeenAt: seenAt } });
    return { seenAt };
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  async listDrafts(status?: NewsItemStatus, page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = parsePagination({ page, pageSize });
    const where = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.newsItem.findMany({
        where,
        include: { sources: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.newsItem.count({ where }),
    ]);
    return { data, meta: buildPageMeta(total, p, ps) };
  }

  async getOne(id: string) {
    const item = await this.prisma.newsItem.findUnique({ where: { id }, include: { sources: true } });
    if (!item) throw new NotFoundException('News item not found');
    return item;
  }

  async createDraft(dto: CreateNewsDraftDto) {
    return this.prisma.newsItem.create({
      data: {
        companyName: dto.companyName,
        title: dto.title,
        type: dto.type,
        summary: dto.summary,
        appEntityLink: dto.appEntityLink,
        originalSourceUrl: dto.originalSourceUrl,
        linkedDraftPayload: dto.linkedDraftPayload as any,
      },
    });
  }

  async updateDraft(id: string, dto: UpdateNewsDraftDto) {
    await this.assertDraftOrRejected(id);
    return this.prisma.newsItem.update({
      where: { id },
      data: {
        companyName: dto.companyName,
        title: dto.title,
        type: dto.type,
        summary: dto.summary,
        appEntityLink: dto.appEntityLink,
        originalSourceUrl: dto.originalSourceUrl,
        linkedDraftPayload: dto.linkedDraftPayload as any,
      },
    });
  }

  /** DRAFT -> PUBLISHED. Re-approving an already-published item (post-merge update, spec 5b) just bumps lastUpdatedAt. */
  async approve(id: string) {
    const item = await this.getOne(id);
    if (item.status === NewsItemStatus.PUBLISHED) {
      return this.prisma.newsItem.update({ where: { id }, data: { lastUpdatedAt: new Date() } });
    }
    if (item.status !== NewsItemStatus.DRAFT) {
      throw new BadRequestException(`Cannot approve a news item in status ${item.status}`);
    }
    return this.prisma.newsItem.update({
      where: { id },
      data: { status: NewsItemStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  /** Real signal, deliberately not publishing — row stays as an audit trail (spec 4). */
  async reject(id: string) {
    await this.assertDraftOrRejected(id);
    return this.prisma.newsItem.update({ where: { id }, data: { status: NewsItemStatus.REJECTED } });
  }

  /** Already-published item turns out to be wrong/withdrawn — disappears from the public feed (spec 5b). */
  async retract(id: string) {
    const item = await this.getOne(id);
    if (item.status !== NewsItemStatus.PUBLISHED) {
      throw new BadRequestException('Only a published news item can be retracted');
    }
    return this.prisma.newsItem.update({ where: { id }, data: { status: NewsItemStatus.RETRACTED } });
  }

  /** Hard delete for genuine garbage (spam, mis-ingested junk) — cascades to NewsSourceRecord (spec 4). */
  async remove(id: string) {
    await this.getOne(id);
    await this.prisma.newsItem.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /** AI returns a free-form type string; fall back to OTHER for anything unrecognised rather than throwing. */
  private mapAiType(type?: string): NewsItemType {
    const valid = Object.values(NewsItemType) as string[];
    return valid.includes(type ?? '') ? (type as NewsItemType) : NewsItemType.OTHER;
  }

  private toDataUri(imageBase64: string): string {
    return imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  }

  private async assertDraftOrRejected(id: string) {
    const item = await this.getOne(id);
    if (item.status === NewsItemStatus.PUBLISHED || item.status === NewsItemStatus.RETRACTED) {
      throw new BadRequestException('Cannot edit/reject a news item that is already published or retracted');
    }
    return item;
  }

  private parseDayRange(date: string): { start: Date; end: Date } | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }
}
