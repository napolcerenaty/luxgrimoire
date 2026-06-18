import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { toZonedTime } from 'date-fns-tz';

@Injectable()
export class NotificationRemindersCron {
  private readonly logger = new Logger(NotificationRemindersCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Runs hourly — sends all scheduled reminders that are due */
  @Cron('0 * * * *')
  async processScheduledReminders() {
    const now = new Date();
    this.logger.log(`[RemindersCron] Running at ${now.toISOString()}`);

    const due = await this.prisma.scheduledReminder.findMany({
      where: { scheduledAt: { lte: now }, sentAt: null, cancelledAt: null },
      select: {
        id: true,
        userId: true,
        type: true,
        entryId: true,
        announcementId: true,
        tier: true,
      },
    });

    if (!due.length) {
      this.logger.log('[RemindersCron] No reminders due');
      return;
    }

    this.logger.log(`[RemindersCron] ${due.length} reminders due`);

    // Group renewal reminders by userId for digest logic
    const renewalsByUser = new Map<string, typeof due>();
    const saleReminders: typeof due = [];

    for (const r of due) {
      if (r.type === 'renewal') {
        const list = renewalsByUser.get(r.userId) ?? [];
        list.push(r);
        renewalsByUser.set(r.userId, list);
      } else {
        saleReminders.push(r);
      }
    }

    // Process renewal reminders
    for (const [userId, reminders] of renewalsByUser) {
      await this.processRenewalReminders(userId, reminders);
    }

    // Process sale reminders
    for (const reminder of saleReminders) {
      await this.processSaleReminder(reminder);
    }
  }

  private async processRenewalReminders(
    userId: string,
    reminders: { id: string; entryId: string | null }[],
  ) {
    const settings = await this.prisma.userReminderSettings.findUnique({
      where: { userId },
      select: { renewalEnabled: true, renewalInAppEnabled: true, renewalPushEnabled: true, renewalDigest: true },
    });

    if (!settings?.renewalEnabled) {
      await this.markSent(reminders.map((r) => r.id));
      return;
    }

    const userRecord = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = (userRecord as any)?.timezone ?? 'UTC';

    // Load entry details for all reminders
    const entryIds = reminders.map((r) => r.entryId).filter(Boolean) as string[];
    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: { id: { in: entryIds }, active: true },
      select: {
        id: true,
        nextRenewalDate: true,
        basePrice: true,
        costCurrency: true,
        subscription: {
          select: {
            name: true,
            slug: true,
            company: { select: { name: true } },
          },
        },
      },
    });

    const entryMap = new Map(entries.map((e) => [e.id, e]));

    if (settings.renewalDigest && reminders.length > 1) {
      // Send one digest notification
      const lines: string[] = [];
      for (const reminder of reminders) {
        const entry = reminder.entryId ? entryMap.get(reminder.entryId) : null;
        if (!entry) continue;
        lines.push(this.formatRenewalLine(entry, timezone));
      }

      if (lines.length > 0) {
        const title = `Renewal reminder${lines.length > 1 ? 's' : ''}`;
        const body = lines.join('\n');

        if (settings.renewalInAppEnabled) {
          await this.notificationsService.createNotification(userId, 'renewal_reminder', title, body, 'subscriptions', undefined);
        }
        if (settings.renewalPushEnabled) {
          await this.sendPushIfEnabled(userId, title, body);
        }
      }
    } else {
      // Send individual notifications
      for (const reminder of reminders) {
        const entry = reminder.entryId ? entryMap.get(reminder.entryId) : null;
        if (!entry) continue;

        const line = this.formatRenewalLine(entry, timezone);
        const title = 'Renewal reminder';

        if (settings.renewalInAppEnabled) {
          await this.notificationsService.createNotification(userId, 'renewal_reminder', title, line, 'subscriptions', entry.subscription?.slug);
        }
        if (settings.renewalPushEnabled) {
          await this.sendPushIfEnabled(userId, title, line);
        }
      }
    }

    await this.markSent(reminders.map((r) => r.id));
  }

  private formatRenewalLine(
    entry: {
      nextRenewalDate: Date | null;
      basePrice: { toString(): string } | null;
      costCurrency: string | null;
      subscription: { name: string; company: { name: string } | null } | null;
    },
    timezone: string,
  ): string {
    const companyName = entry.subscription?.company?.name ?? '';
    const subName = entry.subscription?.name ?? '';
    const price = entry.basePrice ? `${entry.costCurrency ?? ''} ${entry.basePrice}`.trim() : '';
    const dateLabel = entry.nextRenewalDate ? this.formatDateLabel(entry.nextRenewalDate, timezone) : '';
    return [companyName, subName, price, dateLabel].filter(Boolean).join(' · ');
  }

  private formatDateLabel(date: Date, timezone: string): string {
    const now = new Date();
    const localNow = toZonedTime(now, timezone);
    const localDate = toZonedTime(date, timezone);

    const todayStart = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate());
    const targetStart = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate());
    const diffDays = Math.round((targetStart.getTime() - todayStart.getTime()) / 86_400_000);

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    return localDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  private async processSaleReminder(reminder: {
    id: string;
    userId: string;
    announcementId: string | null;
    tier: string | null;
  }) {
    if (!reminder.announcementId) {
      await this.markSent([reminder.id]);
      return;
    }

    const settings = await this.prisma.userReminderSettings.findUnique({
      where: { userId: reminder.userId },
      select: { saleEnabled: true, saleInAppEnabled: true, salePushEnabled: true },
    });

    if (!settings?.saleEnabled) {
      await this.markSent([reminder.id]);
      return;
    }

    const ann = await this.prisma.saleAnnouncement.findUnique({
      where: { id: reminder.announcementId },
      select: {
        id: true,
        title: true,
        earlyAccessDate: true,
        firstAccessDate: true,
        generalSaleDate: true,
        saleTimezone: true,
        basePrice: true,
        currency: true,
        company: { select: { name: true } },
      },
    });

    if (!ann) {
      await this.markSent([reminder.id]);
      return;
    }

    const userRecord = await this.prisma.user.findUnique({
      where: { id: reminder.userId },
      select: { timezone: true },
    });
    const timezone = (userRecord as any)?.timezone ?? 'UTC';

    const effectiveTier = reminder.tier ?? 'GS';
    const saleDate =
      (effectiveTier === 'EA' && ann.earlyAccessDate) ||
      (effectiveTier === 'FA' && ann.firstAccessDate) ||
      ann.generalSaleDate;

    const priceStr = ann.basePrice ? `${ann.currency ?? ''} ${ann.basePrice}`.trim() : '';
    const dateLabel = saleDate ? this.formatSaleDateLabel(saleDate, ann.saleTimezone ?? null, timezone) : '';

    const title = `Sale reminder: ${ann.title}`;
    const body = [ann.company?.name, priceStr, dateLabel].filter(Boolean).join(' · ');

    if (settings.saleInAppEnabled) {
      await this.notificationsService.createNotification(
        reminder.userId,
        'sale_reminder',
        title,
        body,
        'sale-announcements',
        ann.id,
      );
    }
    if (settings.salePushEnabled) {
      await this.sendPushIfEnabled(reminder.userId, title, body);
    }

    await this.markSent([reminder.id]);
  }

  private formatSaleDateLabel(date: Date, saleTimezone: string | null, userTimezone: string): string {
    const now = new Date();
    const localNow = toZonedTime(now, userTimezone);
    const localDate = toZonedTime(date, userTimezone);

    const todayStart = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate());
    const targetStart = new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate());
    const diffDays = Math.round((targetStart.getTime() - todayStart.getTime()) / 86_400_000);

    const dateStr = diffDays === 0 ? 'today' : diffDays === 1 ? 'tomorrow' : localDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    // If there's a saleTimezone, show time of day in user's timezone
    if (saleTimezone) {
      // date is midnight UTC for the sale day — show the date in user's timezone without time
      return dateStr;
    }
    return dateStr;
  }

  private async sendPushIfEnabled(userId: string, title: string, body: string) {
    const pref = await this.prisma.userNotificationPreference.findUnique({ where: { userId } });
    if (pref?.pushEnabled) {
      // NotificationsService already fires push in createNotification when pushEnabled,
      // but for reminder-specific push we check salePushEnabled / renewalPushEnabled separately.
      // We reach here only when those are true, so we can call push directly.
    }
    // Push is sent by NotificationsService.createNotification when pushEnabled is true.
    // For dedicated push-only (no in-app), we'd call PushService directly.
    // For now, push is triggered via createNotification's pref check.
  }

  /** Runs daily at 03:00 — purges processed reminders older than 90 days */
  @Cron('0 3 * * *')
  async purgeOldReminders() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const { count } = await this.prisma.scheduledReminder.deleteMany({
      where: {
        OR: [
          { sentAt: { lte: cutoff } },
          { cancelledAt: { lte: cutoff } },
        ],
      },
    });

    if (count > 0) {
      this.logger.log(`[RemindersCron] Purged ${count} old reminder records (>90 days)`);
    }
  }

  private async markSent(ids: string[]) {
    if (!ids.length) return;
    await this.prisma.scheduledReminder.updateMany({
      where: { id: { in: ids } },
      data: { sentAt: new Date() },
    });
  }
}

