import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import type { EditionFollowReason } from './follow-notifications.service';

@Injectable()
export class EditionFollowNotificationsCron {
  private readonly logger = new Logger(EditionFollowNotificationsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  /** Runs every minute — sends any pending edition-follow batches whose 5-minute debounce has elapsed. */
  @Cron('* * * * *')
  async processDue() {
    const due = await this.prisma.pendingEditionNotification.findMany({
      where: { scheduledFor: { lte: new Date() } },
    });
    if (!due.length) return;

    for (const row of due) {
      try {
        await this.send(row.userId, row.editionId, row.reasons as unknown as EditionFollowReason[]);
      } catch (err) {
        this.logger.error(`Failed to send edition-follow notification ${row.id}: ${err}`);
        continue; // leave the row in place — retried on the next run instead of losing it
      }
      await this.prisma.pendingEditionNotification.delete({ where: { id: row.id } }).catch(() => {});
    }
  }

  private async send(userId: string, editionId: string, reasons: EditionFollowReason[]) {
    const settings = await this.prisma.userReminderSettings.findUnique({
      where: { userId },
      select: { newEditionFollowInAppEnabled: true, newEditionFollowPushEnabled: true },
    });
    // Column defaults are both true — a user who has never touched this setting behaves as if
    // both channels are on, same as the schema default.
    const inAppEnabled = settings?.newEditionFollowInAppEnabled ?? true;
    const pushEnabled = settings?.newEditionFollowPushEnabled ?? true;
    if (!inAppEnabled && !pushEnabled) return;

    const edition = await this.prisma.bookEdition.findUnique({
      where: { id: editionId },
      select: { book: { select: { slug: true, title: true } } },
    });
    if (!edition) return;

    const title = `New edition: ${edition.book.title}`;
    const body = this.formatReasons(reasons);

    if (inAppEnabled) {
      await this.notificationsService.createNotification(
        userId,
        'new_edition_follow',
        title,
        body,
        'books',
        edition.book.slug,
        { skipPush: true },
      );
    }
    if (pushEnabled) {
      await this.sendPush(userId, title, body, edition.book.slug);
    }
  }

  private formatReasons(reasons: EditionFollowReason[]): string {
    const unique = [...new Set(reasons.map((r) => r.name))];
    if (unique.length === 1) return `You follow ${unique[0]}`;
    if (unique.length === 2) return `You follow ${unique[0]} and ${unique[1]}`;
    return `You follow ${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
  }

  /** Mirrors NotificationRemindersCron.sendPush — gated by the device-level push preference,
   *  independent of whether the in-app notification was also created. */
  private async sendPush(userId: string, title: string, body: string, bookSlug: string) {
    const pref = await this.prisma.userNotificationPreference.findUnique({ where: { userId } });
    if (!pref?.pushEnabled) return;
    await this.pushService.sendToUser(userId, { title, body, link: `/books/${bookSlug}`, type: 'new_edition_follow' });
  }
}
