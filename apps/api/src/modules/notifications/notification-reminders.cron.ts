import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationRemindersCron {
  private readonly logger = new Logger(NotificationRemindersCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Runs daily at 08:00 UTC */
  @Cron('0 8 * * *')
  async sendRenewalReminders() {
    this.logger.log('[RenewalReminders] Starting');

    // Get all users with renewal reminders enabled
    const prefs = await this.prisma.userNotificationPreference.findMany({
      where: { renewalReminderEnabled: true },
      select: { userId: true, renewalReminderDays: true },
    });

    if (!prefs.length) return;

    let sent = 0;
    for (const pref of prefs) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + pref.renewalReminderDays);
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);

      const entries = await this.prisma.userSubscriptionEntry.findMany({
        where: {
          userId: pref.userId,
          active: true,
          nextRenewalDate: { gte: dayStart, lte: dayEnd },
        },
        include: {
          subscription: { select: { name: true, slug: true } },
        },
      });

      for (const entry of entries) {
        const alreadySent = await this.prisma.userNotification.findFirst({
          where: {
            userId: pref.userId,
            type: 'renewal_reminder',
            link: `subscriptions/${entry.subscription.slug}`,
            createdAt: { gte: dayStart },
          },
        });
        if (alreadySent) continue;

        await this.notificationsService.createNotification(
          pref.userId,
          'renewal_reminder',
          `Renewal in ${pref.renewalReminderDays} day${pref.renewalReminderDays === 1 ? '' : 's'}: ${entry.subscription.name}`,
          `Your subscription renews on ${entry.nextRenewalDate!.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`,
          'subscriptions',
          entry.subscription.slug,
        );
        sent++;
      }
    }

    this.logger.log(`[RenewalReminders] Sent ${sent} reminders`);
  }

  /** Runs daily at 08:30 UTC */
  @Cron('30 8 * * *')
  async sendSaleReminders() {
    this.logger.log('[SaleReminders] Starting');

    const prefs = await this.prisma.userNotificationPreference.findMany({
      where: { saleReminderEnabled: true },
      select: { userId: true, saleReminderDays: true },
    });

    if (!prefs.length) return;

    let sent = 0;
    for (const pref of prefs) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + pref.saleReminderDays);
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Find sale interests where the relevant date tier falls within the target day
      const interests = await this.prisma.userSaleInterest.findMany({
        where: {
          userId: pref.userId,
          announcement: {
            OR: [
              { generalSaleDate: { gte: dayStart, lte: dayEnd } },
              { earlyAccessDate: { gte: dayStart, lte: dayEnd } },
              { firstAccessDate: { gte: dayStart, lte: dayEnd } },
            ],
          },
        },
        include: {
          announcement: {
            select: {
              id: true,
              title: true,
              generalSaleDate: true,
              earlyAccessDate: true,
              firstAccessDate: true,
            },
          },
        },
      });

      for (const interest of interests) {
        const ann = interest.announcement;
        // Find the relevant date for this user's tier
        const relevantDate =
          (interest.tier === 'EA' && ann.earlyAccessDate) ||
          (interest.tier === 'FA' && ann.firstAccessDate) ||
          ann.generalSaleDate;

        if (!relevantDate) continue;

        const alreadySent = await this.prisma.userNotification.findFirst({
          where: {
            userId: pref.userId,
            type: 'sale_reminder',
            link: `sale-announcements/${ann.id}`,
            createdAt: { gte: dayStart },
          },
        });
        if (alreadySent) continue;

        await this.notificationsService.createNotification(
          pref.userId,
          'sale_reminder',
          `Sale in ${pref.saleReminderDays} day${pref.saleReminderDays === 1 ? '' : 's'}: ${ann.title}`,
          `Your tracked sale opens on ${relevantDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`,
          'sale-announcements',
          ann.id,
        );
        sent++;
      }
    }

    this.logger.log(`[SaleReminders] Sent ${sent} reminders`);
  }
}
