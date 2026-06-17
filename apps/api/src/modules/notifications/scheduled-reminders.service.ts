import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export type ReminderType = 'renewal' | 'sale';

interface UserReminderSettingsLike {
  renewalEnabled: boolean;
  renewalDaysBefore: number;
  renewalHour: number | null;
  renewalDigest: boolean;
  saleEnabled: boolean;
  saleDaysBefore: number;
  saleHour: number | null;
  saleDigest: boolean;
}

const DEFAULT_SETTINGS: UserReminderSettingsLike = {
  renewalEnabled: false,
  renewalDaysBefore: 1,
  renewalHour: null,
  renewalDigest: true,
  saleEnabled: false,
  saleDaysBefore: 0,
  saleHour: 3,  // hours before sale time; null also treated as 3h
  saleDigest: false,
};

@Injectable()
export class ScheduledRemindersService {
  private readonly logger = new Logger(ScheduledRemindersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes the UTC DateTime at which a reminder should fire.
   * @param targetDate   The date of the event (renewal date or sale date in UTC)
   * @param daysBefore   How many days before the event (0 = day of)
   * @param hour         Hour in the user's local time (0-23), null = default (18 for renewal, null means "use eventHourUtc - 3h" for sale)
   * @param timezone     IANA timezone string (e.g. "Europe/Warsaw")
   * @param eventHourUtc For sale reminders when hour is null: use saleDateTime UTC hour minus 3h
   */
  computeScheduledAt(
    targetDate: Date,
    daysBefore: number,
    hour: number | null,
    timezone: string,
    eventHourUtc?: number,
  ): Date {
    const effectiveHour = hour !== null ? hour : 18;

    // Calculate the reminder date (targetDate - daysBefore days) at noon UTC to get the right local date
    const reminderDateUtcNoon = new Date(targetDate);
    reminderDateUtcNoon.setUTCDate(reminderDateUtcNoon.getUTCDate() - daysBefore);
    reminderDateUtcNoon.setUTCHours(12, 0, 0, 0);

    // Convert to user's local date to find the correct day
    const localDate = toZonedTime(reminderDateUtcNoon, timezone);
    const localYear = localDate.getFullYear();
    const localMonth = localDate.getMonth();
    const localDay = localDate.getDate();

    let localHour = effectiveHour;

    // Sale with no explicit hour: use eventHourUtc - 3, but in user's timezone
    if (hour === null && eventHourUtc !== undefined) {
      // Build event datetime in user TZ then subtract 3 hours
      const eventLocalDate = toZonedTime(targetDate, timezone);
      const tentativeHour = eventLocalDate.getHours() - 3;
      localHour = tentativeHour < 0 ? 0 : tentativeHour;
    }

    // Construct the reminder instant in user's local time, then convert to UTC
    const localReminderDate = new Date(localYear, localMonth, localDay, localHour, 0, 0, 0);
    return fromZonedTime(localReminderDate, timezone);
  }

  /**
   * Schedule or reschedule a renewal reminder for an entry.
   * Cancels existing pending renewal reminder for this entry, then creates new one.
   */
  async scheduleRenewal(entryId: string): Promise<void> {
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        userId: true,
        nextRenewalDate: true,
        active: true,
        user: { select: { timezone: true } },
        subscription: { select: { name: true, slug: true, company: { select: { name: true } } } },
      },
    });

    if (!entry || !entry.active || !entry.nextRenewalDate) return;

    const settings = await this.getOrDefaultSettings(entry.userId);
    if (!settings.renewalEnabled) return;

    const timezone = (entry.user as any)?.timezone ?? 'UTC';
    const scheduledAt = this.computeScheduledAt(
      entry.nextRenewalDate,
      settings.renewalDaysBefore,
      settings.renewalHour,
      timezone,
    );

    // Don't schedule in the past
    if (scheduledAt <= new Date()) return;

    await this.prisma.$transaction(async (tx) => {
      // Cancel existing pending renewal reminders for this entry
      await tx.scheduledReminder.updateMany({
        where: { entryId, type: 'renewal', sentAt: null, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });

      await tx.scheduledReminder.create({
        data: {
          userId: entry.userId,
          type: 'renewal',
          scheduledAt,
          entryId,
        },
      });
    });

    this.logger.debug(`[Reminders] Scheduled renewal reminder for entry ${entryId} at ${scheduledAt.toISOString()}`);
  }

  /**
   * Schedule or reschedule a sale reminder for a user + announcement.
   */
  async scheduleSale(userId: string, announcementId: string, tier?: string): Promise<void> {
    const announcement = await this.prisma.saleAnnouncement.findUnique({
      where: { id: announcementId },
      select: {
        id: true,
        earlyAccessDate: true,
        firstAccessDate: true,
        generalSaleDate: true,
        saleTimezone: true,
      },
    });

    if (!announcement) return;

    // Resolve the date for the user's tier (GS = general, EA = early access, FA = first access)
    const effectiveTier = tier ?? 'GS';
    const saleDate =
      (effectiveTier === 'EA' && announcement.earlyAccessDate) ||
      (effectiveTier === 'FA' && announcement.firstAccessDate) ||
      announcement.generalSaleDate;

    if (!saleDate) return;

    const settings = await this.getOrDefaultSettings(userId);
    if (!settings.saleEnabled) return;

    const saleTimezone = announcement.saleTimezone ?? 'UTC';

    // saleHour now means "hours before sale time" (0 = at sale time, 3 = 3h before, null = default 3h before)
    const hoursBefore = settings.saleHour !== null ? settings.saleHour : 3;

    // Compute the anchor sale datetime in UTC: saleDate is stored as a date-only (UTC midnight for the day).
    // Convert to start-of-day in the sale's timezone, then subtract hoursBefore hours.
    const saleDayStart = fromZonedTime(
      new Date(new Date(saleDate).toISOString().slice(0, 10) + 'T00:00:00'),
      saleTimezone,
    );
    const scheduledAt = new Date(saleDayStart.getTime() - hoursBefore * 60 * 60 * 1000);

    if (scheduledAt <= new Date()) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.scheduledReminder.updateMany({
        where: { userId, announcementId, type: 'sale', sentAt: null, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });

      await tx.scheduledReminder.create({
        data: {
          userId,
          type: 'sale',
          scheduledAt,
          announcementId,
          tier: effectiveTier,
        },
      });
    });

    this.logger.debug(`[Reminders] Scheduled sale reminder for user ${userId} announcement ${announcementId} at ${scheduledAt.toISOString()}`);
  }

  /**
   * Cancel all pending renewal reminders for an entry (subscription cancelled/deleted).
   */
  async cancelByEntry(entryId: string): Promise<void> {
    await this.prisma.scheduledReminder.updateMany({
      where: { entryId, type: 'renewal', sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
  }

  /**
   * Cancel pending sale reminder for a user + announcement (interest removed).
   */
  async cancelBySaleInterest(userId: string, announcementId: string): Promise<void> {
    await this.prisma.scheduledReminder.updateMany({
      where: { userId, announcementId, type: 'sale', sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
  }

  /**
   * Reschedule all pending reminders for a user (timezone change or settings change).
   */
  async recalculateForUser(userId: string): Promise<void> {
    // Renewal reminders
    const pendingRenewals = await this.prisma.scheduledReminder.findMany({
      where: { userId, type: 'renewal', sentAt: null, cancelledAt: null },
      select: { entryId: true },
    });
    const entryIds = [...new Set(pendingRenewals.map((r) => r.entryId).filter(Boolean) as string[])];

    // Cancel all pending, then reschedule
    await this.prisma.scheduledReminder.updateMany({
      where: { userId, sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });

    const settings = await this.getOrDefaultSettings(userId);
    const userRecord = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const timezone = (userRecord as any)?.timezone ?? 'UTC';

    if (settings.renewalEnabled) {
      for (const entryId of entryIds) {
        const entry = await this.prisma.userSubscriptionEntry.findUnique({
          where: { id: entryId },
          select: { nextRenewalDate: true, active: true },
        });
        if (!entry?.active || !entry.nextRenewalDate) continue;

        const scheduledAt = this.computeScheduledAt(entry.nextRenewalDate, settings.renewalDaysBefore, settings.renewalHour, timezone);
        if (scheduledAt > new Date()) {
          await this.prisma.scheduledReminder.create({ data: { userId, type: 'renewal', scheduledAt, entryId } });
        }
      }
    }

    if (settings.saleEnabled) {
      // Reschedule sale reminders for active interests
      const interests = await this.prisma.userSaleInterest.findMany({
        where: { userId },
        select: { announcementId: true, tier: true },
      });
      for (const interest of interests) {
        await this.scheduleSale(userId, interest.announcementId, interest.tier);
      }
    }
  }

  /**
   * Reschedule all pending sale reminders for an announcement (admin changed the date).
   */
  async recalculateForAnnouncement(announcementId: string): Promise<void> {
    const pending = await this.prisma.scheduledReminder.findMany({
      where: { announcementId, type: 'sale', sentAt: null, cancelledAt: null },
      select: { userId: true, tier: true },
    });

    if (pending.length === 0) return;

    // Cancel all
    await this.prisma.scheduledReminder.updateMany({
      where: { announcementId, type: 'sale', sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });

    // Reschedule each user
    for (const r of pending) {
      await this.scheduleSale(r.userId, announcementId, r.tier ?? undefined);
    }
  }

  private async getOrDefaultSettings(userId: string): Promise<UserReminderSettingsLike> {
    const s = await this.prisma.userReminderSettings.findUnique({ where: { userId } });
    if (!s) return DEFAULT_SETTINGS;
    return {
      renewalEnabled: s.renewalEnabled,
      renewalDaysBefore: s.renewalDaysBefore,
      renewalHour: s.renewalHour,
      renewalDigest: s.renewalDigest,
      saleEnabled: s.saleEnabled,
      saleDaysBefore: s.saleDaysBefore,
      saleHour: s.saleHour,
      saleDigest: s.saleDigest,
    };
  }
}
