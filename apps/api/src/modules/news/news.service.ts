import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { NewsItemStatus, NewsItemType } from '@prisma/client';
import { CreateNewsDraftDto, UpdateNewsDraftDto } from './news.dto';
import { AiService } from '../ai/ai.service';
import { UploadService } from '../upload/upload.service';

const SCREENSHOT_FOLDER = 'luxgrimoire/news-sources';

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
   * No dedup yet (Phase 4) — every screenshot becomes its own new draft, its single
   * source already CONFIRMED since there's nothing ambiguous to review-merge against.
   */
  async ingestScreenshot(imageBase64: string, caption?: string) {
    const [parsed, uploaded] = await Promise.all([
      this.aiService.parseNewsAnnouncement({ imageBase64, text: caption }),
      this.uploadService.uploadImageBase64(this.toDataUri(imageBase64), SCREENSHOT_FOLDER),
    ]);

    if (!parsed.companyName && !parsed.title) {
      throw new BadRequestException('Could not extract any usable news information from this screenshot');
    }

    return this.prisma.newsItem.create({
      data: {
        companyName: parsed.companyName ?? 'Unknown',
        title: parsed.title ?? `${parsed.companyName ?? 'Untitled'} — news`,
        type: this.mapAiType(parsed.type),
        summary: parsed.summary,
        originalSourceUrl: parsed.originalSourceUrl,
        sources: {
          create: {
            sourceType: 'INSTAGRAM_SCREENSHOT',
            rawContentRef: uploaded.url,
            mergeStatus: 'CONFIRMED',
          },
        },
      },
      include: { sources: true },
    });
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
