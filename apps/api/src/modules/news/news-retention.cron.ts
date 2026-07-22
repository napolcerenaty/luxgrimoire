import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NewsItemStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const REJECTED_RETENTION_DAYS = 14;
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Nulls out NewsSourceRecord.rawContentRef once it's served its audit purpose
 * (spec section 7) — the extracted/published data on the NewsItem itself is
 * kept forever, only the bulky raw blob (screenshot URL / raw HTML) is culled.
 * Rejected items are cleaned sooner (14 days) since there's less reason to
 * keep re-verifying a deliberately-unpublished item long-term; everything
 * else gets a longer window (90 days) to allow for later dispute/audit.
 */
@Injectable()
export class NewsRetentionCronService {
  private readonly logger = new Logger(NewsRetentionCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *') // daily at 04:00 UTC
  async cleanupRawContent() {
    const rejectedCutoff = new Date(Date.now() - REJECTED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const defaultCutoff = new Date(Date.now() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const [rejected, everythingElse] = await Promise.all([
      this.prisma.newsSourceRecord.updateMany({
        where: {
          rawContentRef: { not: null },
          ingestedAt: { lte: rejectedCutoff },
          newsItem: { status: NewsItemStatus.REJECTED },
        },
        data: { rawContentRef: null },
      }),
      this.prisma.newsSourceRecord.updateMany({
        where: {
          rawContentRef: { not: null },
          ingestedAt: { lte: defaultCutoff },
          OR: [{ newsItem: null }, { newsItem: { status: { not: NewsItemStatus.REJECTED } } }],
        },
        data: { rawContentRef: null },
      }),
    ]);

    const total = rejected.count + everythingElse.count;
    if (total > 0) this.logger.log(`Cleared rawContentRef on ${total} news source record(s) (${rejected.count} rejected, ${everythingElse.count} other)`);
    return { cleared: total };
  }
}
