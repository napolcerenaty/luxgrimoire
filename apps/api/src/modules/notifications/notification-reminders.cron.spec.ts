/**
 * Unit tests for NotificationRemindersCron (hourly scheduled reminders processor)
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationRemindersCron } from './notification-reminders.cron';
import { NotificationsService } from './notifications.service';

const USER_ID = 'user-cron-1';
const ENTRY_ID = 'entry-cron-1';
const ANN_ID = 'ann-cron-1';

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: ENTRY_ID,
  nextRenewalDate: new Date('2025-08-15T00:00:00Z'),
  basePrice: { toString: () => '20.00' },
  costCurrency: 'GBP',
  subscription: {
    name: 'Test Sub',
    slug: 'test-sub',
    company: { name: 'Test Company' },
  },
  ...overrides,
});

const makeReminderSettings = (overrides: Record<string, unknown> = {}) => ({
  renewalEnabled: true,
  renewalInAppEnabled: true,
  renewalPushEnabled: false,
  renewalDigest: true,
  saleEnabled: true,
  saleInAppEnabled: true,
  salePushEnabled: false,
  ...overrides,
});

describe('NotificationRemindersCron', () => {
  let cron: NotificationRemindersCron;
  let prisma: DeepMockProxy<PrismaService>;
  let notificationsService: { createNotification: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    notificationsService = { createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
    cron = new NotificationRemindersCron(prisma, notificationsService as any);
  });

  describe('processScheduledReminders', () => {
    it('does nothing when no reminders are due', async () => {
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue([]);

      await cron.processScheduledReminders();

      expect(notificationsService.createNotification).not.toHaveBeenCalled();
    });

    it('sends in-app renewal reminder for single due renewal', async () => {
      const due = [{ id: 'rem-1', userId: USER_ID, type: 'renewal', entryId: ENTRY_ID, announcementId: null, tier: null }];
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue(due);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeReminderSettings({ renewalDigest: false }));
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ timezone: 'UTC' });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([makeEntry()]);
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await cron.processScheduledReminders();

      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        USER_ID,
        'renewal_reminder',
        expect.any(String),
        expect.stringContaining('Test Company'),
        'subscriptions',
        expect.anything(),
      );
    });

    it('sends digest renewal notification when digest=true and multiple renewals', async () => {
      const entry2Id = 'entry-cron-2';
      const due = [
        { id: 'rem-1', userId: USER_ID, type: 'renewal', entryId: ENTRY_ID, announcementId: null, tier: null },
        { id: 'rem-2', userId: USER_ID, type: 'renewal', entryId: entry2Id, announcementId: null, tier: null },
      ];
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue(due);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeReminderSettings({ renewalDigest: true }));
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ timezone: 'UTC' });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([
        makeEntry(),
        makeEntry({ id: entry2Id, subscription: { name: 'Sub 2', slug: 'sub-2', company: { name: 'Company 2' } } }),
      ]);
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      await cron.processScheduledReminders();

      // Only ONE digest notification instead of two individual ones
      expect(notificationsService.createNotification).toHaveBeenCalledTimes(1);
      const [, , title, body] = notificationsService.createNotification.mock.calls[0];
      expect(title).toMatch(/renewal reminder/i);
      // Body should contain both subscription lines
      expect(body).toContain('Test Company');
    });

    it('marks reminders as sent after processing', async () => {
      const due = [{ id: 'rem-1', userId: USER_ID, type: 'renewal', entryId: ENTRY_ID, announcementId: null, tier: null }];
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue(due);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeReminderSettings({ renewalDigest: false }));
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ timezone: 'UTC' });
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([makeEntry()]);
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await cron.processScheduledReminders();

      expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['rem-1'] } }),
          data: expect.objectContaining({ sentAt: expect.any(Date) }),
        }),
      );
    });

    it('sends sale reminder for due sale', async () => {
      const due = [{ id: 'rem-s1', userId: USER_ID, type: 'sale', entryId: null, announcementId: ANN_ID, tier: 'GS' }];
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue(due);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeReminderSettings());
      (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValue({
        id: ANN_ID,
        title: 'Test SA',
        earlyAccessDate: null,
        firstAccessDate: null,
        generalSaleDate: new Date('2025-08-15T00:00:00Z'),
        saleTimezone: null,
        basePrice: { toString: () => '45.00' },
        currency: 'GBP',
        company: { name: 'SA Company' },
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ timezone: 'UTC' });
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await cron.processScheduledReminders();

      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        USER_ID,
        'sale_reminder',
        expect.stringContaining('Test SA'),
        expect.stringContaining('SA Company'),
        'sale-announcements',
        ANN_ID,
      );
    });

    it('skips renewal reminder when renewalEnabled is false', async () => {
      const due = [{ id: 'rem-1', userId: USER_ID, type: 'renewal', entryId: ENTRY_ID, announcementId: null, tier: null }];
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue(due);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(
        makeReminderSettings({ renewalEnabled: false }),
      );
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await cron.processScheduledReminders();

      expect(notificationsService.createNotification).not.toHaveBeenCalled();
      // Still marks as sent (skipped because disabled)
      expect(prisma.scheduledReminder.updateMany).toHaveBeenCalled();
    });

    it('sends separate sale reminders (not digest) for multiple sale reminders', async () => {
      const ann2 = 'ann-cron-2';
      const due = [
        { id: 'rem-s1', userId: USER_ID, type: 'sale', entryId: null, announcementId: ANN_ID, tier: 'GS' },
        { id: 'rem-s2', userId: USER_ID, type: 'sale', entryId: null, announcementId: ann2, tier: 'GS' },
      ];
      (prisma.scheduledReminder.findMany as jest.Mock).mockResolvedValue(due);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeReminderSettings());
      const saleDate = new Date('2025-08-15T00:00:00Z');
      (prisma.saleAnnouncement.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          id: ANN_ID, title: 'Sale 1', earlyAccessDate: null, firstAccessDate: null,
          generalSaleDate: saleDate, saleTimezone: null, basePrice: null, currency: null, company: null,
        })
        .mockResolvedValueOnce({
          id: ann2, title: 'Sale 2', earlyAccessDate: null, firstAccessDate: null,
          generalSaleDate: saleDate, saleTimezone: null, basePrice: null, currency: null, company: null,
        });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ timezone: 'UTC' });
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await cron.processScheduledReminders();

      // Two separate sale notifications
      expect(notificationsService.createNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('formatDateLabel', () => {
    it('formats today as "today"', () => {
      const now = new Date();
      // Access private method via any
      const label = (cron as any).formatDateLabel(now, 'UTC');
      expect(label).toBe('today');
    });

    it('formats tomorrow as "tomorrow"', () => {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      const label = (cron as any).formatDateLabel(tomorrow, 'UTC');
      expect(label).toBe('tomorrow');
    });

    it('formats future date with day and month', () => {
      const future = new Date('2025-12-25T00:00:00Z');
      const label = (cron as any).formatDateLabel(future, 'UTC');
      expect(label).toMatch(/25/);
      expect(label).toMatch(/Dec/i);
    });
  });
});
