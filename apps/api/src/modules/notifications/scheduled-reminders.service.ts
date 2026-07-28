import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { computeChoiceDeadline } from '../subscriptions/subscription-month-choice.util';

export type ReminderType = 'renewal' | 'sale' | 'book_choice';

interface UserReminderSettingsLike {
  renewalEnabled: boolean;
  renewalDaysBefore: number;
  renewalHour: number | null;
  renewalDigest: boolean;
  saleEnabled: boolean;
  saleDaysBefore: number;
  saleMinutesBefore: number | null;
  saleDigest: boolean;
  bookChoiceEnabled: boolean;
  bookChoiceDaysBefore: number;
}

const DEFAULT_SETTINGS: UserReminderSettingsLike = {
  renewalEnabled: false,
  renewalDaysBefore: 1,
  renewalHour: null,
  renewalDigest: true,
  saleEnabled: false,
  saleDaysBefore: 0,
  saleMinutesBefore: 180,  // minutes before sale time; null also treated as 180min (3h)
  saleDigest: false,
  // Opt-in like renewal/sale — a missed choice defaults to "both books ship, user
  // self-corrects" (see resolveMonthBooksForEntry), so there's no need to force this on.
  bookChoiceEnabled: false,
  bookChoiceDaysBefore: 3,
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
   * Schedule or reschedule a sale reminder for a user + announcement + tier.
   * A tier is now a concrete SaleTier row with its own real date — no FA/EA/GS
   * fallback-chain resolution needed, and (unlike the old top-level-only fields) this
   * naturally respects per-region tiers too, since the tier row IS the region-specific one
   * when the user picked a region-scoped tier.
   */
  async scheduleSale(userId: string, announcementId: string, tierId?: string | null): Promise<void> {
    if (!tierId) return;
    const tier = await this.prisma.saleTier.findFirst({ where: { id: tierId, saleId: announcementId } });
    if (!tier) return;

    const settings = await this.getOrDefaultSettings(userId);
    if (!settings.saleEnabled) return;

    // saleMinutesBefore means "minutes before actual sale time" (0 = at sale time, 180 = 3h before)
    const minutesBefore = settings.saleMinutesBefore !== null ? settings.saleMinutesBefore : 180;

    const scheduledAt = new Date(tier.date.getTime() - minutesBefore * 60 * 1000);

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
          tierId: tier.id,
        },
      });
    });

    this.logger.debug(`[Reminders] Scheduled sale reminder for user ${userId} announcement ${announcementId} tier ${tier.name} at ${scheduledAt.toISOString()}`);
  }

  /**
   * Schedule (or reschedule) a book-choice reminder for one entry + choice group.
   * Deadline is anchored to the subscription's renewalDay (approximate — see
   * computeChoiceDeadline), not the 1st of the box month.
   */
  async scheduleBookChoice(entryId: string, choiceGroupId: string): Promise<void> {
    const entry = await this.prisma.userSubscriptionEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true, active: true },
    });
    if (!entry || !entry.active) return;

    const settings = await this.getOrDefaultSettings(entry.userId);
    if (!settings.bookChoiceEnabled) return;

    const group = await this.prisma.subscriptionMonthChoiceGroup.findUnique({
      where: { id: choiceGroupId },
      select: {
        choiceDeadlineType: true,
        choiceDeadlineDaysBefore: true,
        choiceDeadlineDayOfMonth: true,
        month: { select: { year: true, month: true, subscription: { select: { renewalDay: true } } } },
      },
    });
    if (!group) return;

    const deadline = computeChoiceDeadline(group.month.year, group.month.month, group.month.subscription.renewalDay ?? 1, group);
    const scheduledAt = new Date(deadline.getTime() - settings.bookChoiceDaysBefore * 24 * 60 * 60 * 1000);
    if (scheduledAt <= new Date()) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.scheduledReminder.updateMany({
        where: { entryId, choiceGroupId, type: 'book_choice', sentAt: null, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      await tx.scheduledReminder.create({
        data: { userId: entry.userId, type: 'book_choice', scheduledAt, entryId, choiceGroupId },
      });
    });

    this.logger.debug(`[Reminders] Scheduled book-choice reminder for entry ${entryId} group ${choiceGroupId} at ${scheduledAt.toISOString()}`);
  }

  /**
   * Cancel the pending book-choice reminder for one specific entry + choice group
   * (the choice was resolved — no need to keep nagging about that particular group;
   * other choice groups still open for the same entry are untouched).
   */
  async cancelBookChoice(entryId: string, choiceGroupId: string): Promise<void> {
    await this.prisma.scheduledReminder.updateMany({
      where: { entryId, choiceGroupId, type: 'book_choice', sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
  }

  /**
   * Cancel all pending renewal + book-choice reminders for an entry (subscription cancelled/deleted).
   */
  async cancelByEntry(entryId: string): Promise<void> {
    await this.prisma.scheduledReminder.updateMany({
      where: { entryId, type: { in: ['renewal', 'book_choice'] }, sentAt: null, cancelledAt: null },
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
   * Reschedule all pending reminders for a user (settings change, timezone change, enable/disable).
   * When renewalEnabled is turned ON, schedules reminders for ALL active subscriptions
   * (not just those that already had a pending reminder).
   */
  async recalculateForUser(userId: string): Promise<void> {
    // Cancel all pending first
    await this.prisma.scheduledReminder.updateMany({
      where: { userId, sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });

    const settings = await this.getOrDefaultSettings(userId);
    const userRecord = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const timezone = (userRecord as any)?.timezone ?? 'UTC';

    if (settings.renewalEnabled) {
      // Always pull ALL active entries — handles the first-enable case where no reminders existed yet
      const activeEntries = await this.prisma.userSubscriptionEntry.findMany({
        where: { userId, active: true, nextRenewalDate: { not: null } },
        select: { id: true, nextRenewalDate: true },
      });

      for (const entry of activeEntries) {
        if (!entry.nextRenewalDate) continue;
        const scheduledAt = this.computeScheduledAt(entry.nextRenewalDate, settings.renewalDaysBefore, settings.renewalHour, timezone);
        if (scheduledAt > new Date()) {
          await this.prisma.scheduledReminder.create({ data: { userId, type: 'renewal', scheduledAt, entryId: entry.id } });
        }
      }
    }

    if (settings.saleEnabled) {
      const interests = await this.prisma.userSaleInterest.findMany({
        where: { userId },
        select: { announcementId: true, tierId: true },
      });
      for (const interest of interests) {
        await this.scheduleSale(userId, interest.announcementId, interest.tierId);
      }
    }
  }

  /**
   * Reschedule all pending sale reminders for an announcement (admin changed a tier's date/time,
   * or removed a tier — called from AnnouncementsService's legacy-field update path and from the
   * new SaleTier CRUD endpoints alike).
   */
  async recalculateForAnnouncement(announcementId: string): Promise<void> {
    const pending = await this.prisma.scheduledReminder.findMany({
      where: { announcementId, type: 'sale', sentAt: null, cancelledAt: null },
      select: { userId: true, tierId: true },
    });

    if (pending.length === 0) return;

    // Cancel all
    await this.prisma.scheduledReminder.updateMany({
      where: { announcementId, type: 'sale', sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });

    // Reschedule each user — scheduleSale no-ops quietly if their tierId no longer resolves
    // (e.g. the tier itself was deleted, which SETs NULL on tierId via the FK).
    for (const r of pending) {
      await this.scheduleSale(r.userId, announcementId, r.tierId);
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
      saleMinutesBefore: s.saleMinutesBefore,
      saleDigest: s.saleDigest,
      bookChoiceEnabled: s.bookChoiceEnabled,
      bookChoiceDaysBefore: s.bookChoiceDaysBefore,
    };
  }
}
