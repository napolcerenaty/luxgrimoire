import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEBOUNCE_MS = 5 * 60_000;

@Injectable()
export class SeriesContinuationService {
  private readonly logger = new Logger(SeriesContinuationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called when an edition is linked to a SaleAnnouncement. Matches users who already own a
   * different book in the same series, via an edition from the same company **and the exact
   * same variantLabel** (both null counts as a match — a plain, no-variant line continuing with
   * another plain edition; never mixed, a variant edition only continues the same variant, not
   * every edition of the book), and enqueues a per-[userId, saleAnnouncementId] pending row for
   * the cron to send later — merging into an existing row (within its debounce window) rather
   * than creating a duplicate.
   *
   * ownershipStatus excludes SOLD/GIFTED_AWAY (no longer have it) and BORROWED (never actually
   * theirs — someone else's copy they're holding, not a purchase signal for this company).
   * LENDED still counts: that's their own copy, just temporarily out with someone else.
   */
  async notifyOnEditionAddedToSale(editionId: string, saleAnnouncementId: string) {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { id: editionId },
      select: { bookId: true, bookBoxCompanyId: true, variantLabel: true, book: { select: { seriesId: true } } },
    });
    if (!edition?.bookBoxCompanyId || !edition.book.seriesId) return;

    const matches = await this.prisma.userBookEntry.findMany({
      where: {
        isWishlist: false,
        ownershipStatus: { notIn: ['SOLD', 'GIFTED_AWAY', 'BORROWED'] },
        bookId: { not: edition.bookId },
        book: { seriesId: edition.book.seriesId },
        edition: { bookBoxCompanyId: edition.bookBoxCompanyId, variantLabel: edition.variantLabel },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    if (!matches.length) return;

    const scheduledFor = new Date(Date.now() + DEBOUNCE_MS);

    for (const { userId } of matches) {
      try {
        await this.enqueue(userId, saleAnnouncementId, editionId, scheduledFor);
      } catch (err) {
        this.logger.error(
          `Failed to enqueue series-continuation notification for user ${userId}, sale ${saleAnnouncementId}`,
          err as Error,
        );
      }
    }
  }

  private async enqueue(userId: string, saleAnnouncementId: string, editionId: string, scheduledFor: Date) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pendingSeriesContinuationNotification.findUnique({
        where: { userId_saleAnnouncementId: { userId, saleAnnouncementId } },
      });

      if (!existing) {
        await tx.pendingSeriesContinuationNotification.create({
          data: { userId, saleAnnouncementId, editionIds: [editionId], scheduledFor },
        });
        return;
      }

      // First event already set the clock — later editions added within the window just
      // join the same batch, they don't push scheduledFor back out.
      if (!existing.editionIds.includes(editionId)) {
        await tx.pendingSeriesContinuationNotification.update({
          where: { id: existing.id },
          data: { editionIds: { push: editionId } },
        });
      }
    });
  }
}
