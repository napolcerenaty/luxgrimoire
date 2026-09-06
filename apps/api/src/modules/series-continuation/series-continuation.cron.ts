import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { formatEditionDisplayTitle } from '@luxgrimoire/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import { ReminderSettingsService } from '../notifications/reminder-settings.service';

type PendingRow = {
  id: string;
  userId: string;
  saleAnnouncementId: string;
  editionIds: string[];
};

type BookRef = { id: string; title: string; volumeNumbers: number[] };

function uniqueBooksById(books: BookRef[]): BookRef[] {
  const map = new Map<string, BookRef>();
  for (const b of books) map.set(b.id, b);
  return [...map.values()];
}

function uniqueSortedNumbers(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** "1" / "1 & 2" / "1, 2 & 3" / "1, 2, 3 & 5" (handles non-contiguous gaps as-is). */
function formatNumberList(nums: number[]): string {
  if (nums.length <= 1) return `${nums[0] ?? ''}`;
  return `${nums.slice(0, -1).join(', ')} & ${nums[nums.length - 1]}`;
}

@Injectable()
export class SeriesContinuationCron {
  private readonly logger = new Logger(SeriesContinuationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
    private readonly reminderSettingsService: ReminderSettingsService,
  ) {}

  /** Runs every 30 minutes — not time-sensitive, the 5-min debounce already caps latency floor */
  @Cron('*/30 * * * *')
  async processPendingNotifications() {
    const now = new Date();
    const due = await this.prisma.pendingSeriesContinuationNotification.findMany({
      where: { scheduledFor: { lte: now } },
    });
    if (!due.length) return;

    this.logger.log(`[SeriesContinuationCron] ${due.length} pending notifications due`);

    for (const row of due) {
      try {
        await this.processRow(row);
      } catch (err) {
        this.logger.error(`Failed to process series-continuation notification ${row.id}`, err as Error);
      }
      // Always remove the row after an attempt — a permanently-bad row (e.g. announcement
      // deleted since) must not block the batch on every future run, same as the backfill
      // per-item convention elsewhere in this codebase.
      await this.prisma.pendingSeriesContinuationNotification.delete({ where: { id: row.id } }).catch(() => {});
    }
  }

  private async processRow(row: PendingRow) {
    const settings = await this.reminderSettingsService.getSettings(row.userId);
    if (!settings.seriesContinuationInAppEnabled && !settings.seriesContinuationPushEnabled) return;

    const [announcement, editions] = await Promise.all([
      this.prisma.saleAnnouncement.findUnique({
        where: { id: row.saleAnnouncementId },
        select: { id: true, company: { select: { name: true } } },
      }),
      this.prisma.bookEdition.findMany({
        where: { id: { in: row.editionIds } },
        select: {
          bookBoxCompanyId: true,
          variantLabel: true,
          book: { select: { id: true, title: true, volumeNumbers: true, seriesId: true, series: { select: { name: true } } } },
        },
      }),
    ]);
    if (!announcement || !editions.length) return;

    const titles = Array.from(new Set(editions.map((e) => formatEditionDisplayTitle(e.book, e))));
    if (!titles.length) return;

    const newBooks = uniqueBooksById(editions.map((e) => e.book));
    const companyName = announcement.company?.name ?? 'a company you follow';
    const seriesName = editions[0].book.series?.name;
    const isPluralNew = newBooks.length > 1;

    // Every book the user already owns from this same series+company+variant profile —
    // not just one — so someone with several prior volumes gets a message reflecting
    // that, instead of an arbitrary single pick. Mirrors SeriesContinuationService's
    // own matching filter (using the first new edition's company/variant as the profile —
    // a debounced batch spanning different variants is a rare edge case, not handled here).
    const ownedEntries = await this.prisma.userBookEntry.findMany({
      where: {
        userId: row.userId,
        isWishlist: false,
        ownershipStatus: { notIn: ['SOLD', 'GIFTED_AWAY', 'BORROWED'] },
        bookId: { notIn: newBooks.map((b) => b.id) },
        book: { seriesId: editions[0].book.seriesId },
        edition: { bookBoxCompanyId: editions[0].bookBoxCompanyId, variantLabel: editions[0].variantLabel },
      },
      select: { bookId: true, book: { select: { id: true, title: true, volumeNumbers: true } } },
      distinct: ['bookId'],
    });
    const ownedBooks = ownedEntries.map((e) => e.book);

    const title = seriesName
      ? `New volume${isPluralNew ? 's' : ''} of ${seriesName} from ${companyName}`
      : `New volume${isPluralNew ? 's' : ''} from ${companyName}`;
    const newTitlesStr = titles.join(', ');

    const ownedNums = uniqueSortedNumbers(ownedBooks.flatMap((b) => b.volumeNumbers));
    const newNums = uniqueSortedNumbers(newBooks.flatMap((b) => b.volumeNumbers));

    let body: string;
    if (ownedBooks.length > 1 && ownedNums.length > 0 && newNums.length > 0) {
      // Several owned volumes — name them by number, compactly, rather than every title.
      const newIsPlural = newNums.length > 1;
      body =
        `You already own volume${ownedNums.length > 1 ? 's' : ''} ${formatNumberList(ownedNums)} - ` +
        `volume${newIsPlural ? 's' : ''} ${formatNumberList(newNums)} ${newIsPlural ? 'have' : 'has'} been announced. Tap to view.`;
    } else if (ownedBooks.length === 1) {
      // Exactly one owned volume — name it (and the new one(s)) by title for a more personal touch.
      const ownedTitle = formatEditionDisplayTitle(ownedBooks[0], { variantLabel: editions[0].variantLabel });
      body = `You have ${ownedTitle} - ${newTitlesStr} ${isPluralNew ? 'have' : 'has'} been announced. Tap to view.`;
    } else {
      // Defensive fallback — shouldn't normally happen (enqueue already requires a match),
      // but volumeNumbers could be empty or the matching row could be gone by send time.
      body = `${newTitlesStr} ${isPluralNew ? 'have' : 'has'} been announced. Tap to view.`;
    }

    if (settings.seriesContinuationInAppEnabled) {
      await this.notificationsService.createNotification(
        row.userId,
        'series_continuation',
        title,
        body,
        'sale-announcements',
        announcement.id,
        { skipPush: true },
      );
    }
    if (settings.seriesContinuationPushEnabled) {
      await this.sendPush(row.userId, 'series_continuation', title, body, 'sale-announcements', announcement.id);
    }
  }

  /** Same global-device-toggle gate notification-reminders.cron.ts's sendPush uses — the
   *  per-type toggle only controls whether THIS type sends push, not push on the device. */
  private async sendPush(userId: string, type: string, title: string, body: string, entityType: string, entityId: string) {
    const pref = await this.prisma.userNotificationPreference.findUnique({ where: { userId } });
    if (!pref?.pushEnabled) return;
    await this.pushService.sendToUser(userId, { title, body, link: `/${entityType}/${entityId}`, type });
  }
}
