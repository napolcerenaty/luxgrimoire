import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { refreshNextRenewalDate } from '../../common/utils/renewal-date.util';

@Injectable()
export class RenewalCronService {
  private readonly logger = new Logger(RenewalCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daily at 00:01 UTC — finds all active subscription entries whose
   * nextRenewalDate has passed and processes them:
   *  1. Records the renewal (idempotent).
   *  2. Adds all books for that subscription month to the user's collection
   *     with ownershipStatus='PREORDER', unless the user skipped the month.
   *  3. Advances nextRenewalDate to the next due date.
   */
  @Cron('1 0 * * *')
  async processRenewals() {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    this.logger.log(`[RenewalCron] Running — cutoff: ${todayStart.toISOString()}`);

    const dueEntries = await this.prisma.userSubscriptionEntry.findMany({
      where: {
        active: true,
        nextRenewalDate: { lte: todayStart },
      },
      select: {
        id: true,
        userId: true,
        subscriptionId: true,
        costCurrency: true,
        nextRenewalDate: true,
      },
    });

    this.logger.log(`[RenewalCron] ${dueEntries.length} entry/entries due for renewal`);

    for (const entry of dueEntries) {
      try {
        await this.processOneRenewal(entry);
      } catch (err: any) {
        this.logger.error(`[RenewalCron] Failed for entry ${entry.id}: ${err?.message}`);
      }
    }
  }

  private async processOneRenewal(entry: {
    id: string;
    userId: string;
    subscriptionId: string;
    costCurrency: string | null;
    nextRenewalDate: Date | null;
  }) {
    const renewalDate = entry.nextRenewalDate!;
    const year = renewalDate.getUTCFullYear();
    const month = renewalDate.getUTCMonth() + 1;

    // Idempotency: if we already recorded this exact renewal date → skip book-add
    // (nextRenewalDate might not have advanced yet if the API was down)
    const existing = await this.prisma.userSubscriptionRenewal.findUnique({
      where: { entryId_renewalDate: { entryId: entry.id, renewalDate } },
    });

    if (!existing) {
      await this.prisma.userSubscriptionRenewal.create({
        data: { userId: entry.userId, entryId: entry.id, renewalDate, source: 'cron' },
      });

      await this.addBooksForSubscriptionMonth(entry, year, month, renewalDate);
    }

    // Always advance nextRenewalDate (safe if already advanced)
    await refreshNextRenewalDate(this.prisma, entry.id);
  }

  /**
   * Adds books for a subscription month to a user's collection with PREORDER status.
   * Skipped if the user has an active skip record for that month.
   * Uses upsert so re-runs are safe.
   */
  async addBooksForSubscriptionMonth(
    entry: {
      id: string;
      userId: string;
      subscriptionId: string;
      costCurrency: string | null;
    },
    year: number,
    month: number,
    renewalDate: Date,
  ) {
    const monthRecord = await this.prisma.subscriptionMonth.findUnique({
      where: { subscriptionId_year_month: { subscriptionId: entry.subscriptionId, year, month } },
      include: {
        books: { select: { bookId: true, editionId: true, signatureType: true } },
      },
    });

    if (!monthRecord || monthRecord.books.length === 0) return;

    // Check for active skip
    const skip = await this.prisma.userSkipRecord.findUnique({
      where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: monthRecord.id } },
    });
    if (skip && !skip.undoneAt) return;

    for (const mb of monthRecord.books) {
      if (!mb.bookId || !mb.editionId) continue;

      await this.prisma.userBookEntry.upsert({
        where: { userId_bookId_editionId: { userId: entry.userId, bookId: mb.bookId, editionId: mb.editionId } },
        create: {
          userId: entry.userId,
          bookId: mb.bookId,
          editionId: mb.editionId,
          ownershipStatus: 'PREORDER',
          readingStatus: 'UNREAD',
          subscriptionEntryId: entry.id,
          signatureType: mb.signatureType ?? monthRecord.signatureType ?? null,
        },
        update: {}, // no-op if already in collection
      }).catch(() => {});
    }
  }

  /**
   * Called when a new book is linked to a subscription month.
   * For every active subscriber whose renewal for that month has already been
   * recorded AND who did not skip the month, retroactively adds the book to
   * their collection with ownershipStatus='PREORDER'.
   */
  async retroactivelyAddBookForSubscribers(
    subscriptionId: string,
    monthRecord: { id: string; year: number; month: number; signatureType: $Enums.SignatureType | null },
    book: { bookId: string; editionId: string | null; signatureType: $Enums.SignatureType | null },
  ) {
    if (!book.bookId || !book.editionId) return;

    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: { subscriptionId, active: true },
      select: { id: true, userId: true, costCurrency: true },
    });

    if (entries.length === 0) return;

    const monthStart = new Date(Date.UTC(monthRecord.year, monthRecord.month - 1, 1));
    const monthEnd = new Date(Date.UTC(monthRecord.year, monthRecord.month, 1));

    for (const entry of entries) {
      // Was there a renewal in this month?
      const renewalRecord = await this.prisma.userSubscriptionRenewal.findFirst({
        where: {
          entryId: entry.id,
          renewalDate: { gte: monthStart, lt: monthEnd },
        },
        select: { renewalDate: true },
      });

      if (!renewalRecord) continue;

      // Did the user skip this month?
      const skip = await this.prisma.userSkipRecord.findUnique({
        where: { userEntryId_subscriptionMonthId: { userEntryId: entry.id, subscriptionMonthId: monthRecord.id } },
      });
      if (skip && !skip.undoneAt) continue;

      await this.prisma.userBookEntry.upsert({
        where: { userId_bookId_editionId: { userId: entry.userId, bookId: book.bookId, editionId: book.editionId! } },
        create: {
          userId: entry.userId,
          bookId: book.bookId,
          editionId: book.editionId!,
          ownershipStatus: 'PREORDER',
          readingStatus: 'UNREAD',
          subscriptionEntryId: entry.id,
          signatureType: book.signatureType ?? monthRecord.signatureType ?? null,
        },
        update: {},
      }).catch(() => {});
    }
  }
}
