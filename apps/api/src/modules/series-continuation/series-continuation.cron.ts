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
          book: { select: { id: true, title: true, seriesId: true, series: { select: { name: true } } } },
        },
      }),
    ]);
    if (!announcement || !editions.length) return;

    const titles = Array.from(new Set(editions.map((e) => formatEditionDisplayTitle(e.book, e))));
    if (!titles.length) return;

    const companyName = announcement.company?.name ?? 'a company you follow';
    const seriesName = editions[0].book.series?.name;
    const isPlural = titles.length > 1;

    // Re-derive one representative book the user already owns from this same series+
    // company+variant profile — purely for message copy ("you have X"), so the
    // notification explains *why* it's showing up instead of reading like a generic
    // "new stuff" blast. Mirrors SeriesContinuationService's own matching filter.
    const owned = await this.prisma.userBookEntry.findFirst({
      where: {
        userId: row.userId,
        isWishlist: false,
        ownershipStatus: { notIn: ['SOLD', 'GIFTED_AWAY', 'BORROWED'] },
        bookId: { notIn: editions.map((e) => e.book.id) },
        book: { seriesId: editions[0].book.seriesId },
        edition: { bookBoxCompanyId: editions[0].bookBoxCompanyId, variantLabel: editions[0].variantLabel },
      },
      select: { book: { select: { title: true } } },
    });

    const title = seriesName ? `New volume${isPlural ? 's' : ''} of ${seriesName}` : `New from ${companyName}`;
    const newTitlesStr = titles.join(', ');
    const ownedTitle = owned ? formatEditionDisplayTitle(owned.book, { variantLabel: editions[0].variantLabel }) : null;
    const body = ownedTitle
      ? `You have ${ownedTitle} — ${newTitlesStr} from ${companyName} ${isPlural ? 'have' : 'has'} been announced. Tap to view.`
      : `${newTitlesStr} from ${companyName} ${isPlural ? 'have' : 'has'} been announced. Tap to view.`;

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
