/**
 * Unit tests for ScheduledRemindersService
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduledRemindersService } from './scheduled-reminders.service';

const USER_ID = 'user-reminder-1';
const ENTRY_ID = 'entry-reminder-1';
const ANN_ID = 'ann-reminder-1';

const makeSettings = (overrides: Record<string, unknown> = {}) => ({
  renewalEnabled: true,
  renewalDaysBefore: 1,
  renewalHour: 18,
  renewalDigest: true,
  saleEnabled: true,
  saleDaysBefore: 0,
  saleMinutesBefore: null,
  saleDigest: false,
  ...overrides,
});

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: ENTRY_ID,
  userId: USER_ID,
  active: true,
  nextRenewalDate: new Date('2025-08-15T00:00:00Z'),
  user: { timezone: 'Europe/Warsaw' },
  subscription: {
    name: 'Test Sub',
    slug: 'test-sub',
    company: { name: 'Test Company' },
  },
  ...overrides,
});

describe('ScheduledRemindersService', () => {
  let service: ScheduledRemindersService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new ScheduledRemindersService(prisma);
  });

  describe('computeScheduledAt', () => {
    it('computes correct UTC time for Europe/Warsaw in summer (UTC+2)', () => {
      // August 15 2025 renewal, 1 day before at 18:00 Warsaw = Aug 14 16:00 UTC
      const targetDate = new Date('2025-08-15T00:00:00Z');
      const result = service.computeScheduledAt(targetDate, 1, 18, 'Europe/Warsaw');
      // Warsaw is UTC+2 in summer, so 18:00 local = 16:00 UTC
      expect(result.getUTCHours()).toBe(16);
      expect(result.getUTCDate()).toBe(14);
    });

    it('computes correct UTC time for Europe/Warsaw in winter (UTC+1)', () => {
      // Jan 15 2025 renewal, 1 day before at 18:00 Warsaw = Jan 14 17:00 UTC
      const targetDate = new Date('2025-01-15T00:00:00Z');
      const result = service.computeScheduledAt(targetDate, 1, 18, 'Europe/Warsaw');
      expect(result.getUTCHours()).toBe(17);
      expect(result.getUTCDate()).toBe(14);
    });

    it('handles daysBefore=0 (day of event)', () => {
      const targetDate = new Date('2025-08-15T00:00:00Z');
      const result = service.computeScheduledAt(targetDate, 0, 10, 'UTC');
      expect(result.getUTCDate()).toBe(15);
      expect(result.getUTCHours()).toBe(10);
    });

    it('uses default 18:00 when hour is null', () => {
      const targetDate = new Date('2025-08-15T00:00:00Z');
      const result = service.computeScheduledAt(targetDate, 1, null, 'UTC');
      expect(result.getUTCHours()).toBe(18);
    });
  });

  describe('scheduleRenewal', () => {
    it('creates a scheduled reminder for active entry with future renewalDate', async () => {
      const entry = makeEntry({ nextRenewalDate: new Date(Date.now() + 2 * 24 * 3600 * 1000) });
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(entry);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeSettings());
      (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: any) => Promise<void>) =>
        fn({
          scheduledReminder: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn().mockResolvedValue({ id: 'new-reminder' }),
          },
        }),
      );

      await service.scheduleRenewal(ENTRY_ID);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('does nothing when renewalEnabled is false', async () => {
      const entry = makeEntry({ nextRenewalDate: new Date(Date.now() + 2 * 24 * 3600 * 1000) });
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(entry);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeSettings({ renewalEnabled: false }));

      await service.scheduleRenewal(ENTRY_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing when entry is inactive', async () => {
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(
        makeEntry({ active: false }),
      );

      await service.scheduleRenewal(ENTRY_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing when scheduledAt is in the past', async () => {
      // nextRenewalDate is tomorrow but daysBefore=2, so scheduledAt would be yesterday
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      const entry = makeEntry({ nextRenewalDate: tomorrow });
      (prisma.userSubscriptionEntry.findUnique as jest.Mock).mockResolvedValue(entry);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(
        makeSettings({ renewalDaysBefore: 2 }),
      );

      await service.scheduleRenewal(ENTRY_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('scheduleSale', () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const GS_TIER_ID = 'tier-gs-1';
    const EA_TIER_ID = 'tier-ea-1';

    it('does nothing when tierId is not provided', async () => {
      await service.scheduleSale(USER_ID, ANN_ID);
      expect(prisma.saleTier.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a reminder for a concrete sale tier', async () => {
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue({
        id: GS_TIER_ID,
        saleId: ANN_ID,
        name: 'General Sale',
        date: futureDate,
      });
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeSettings());
      (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: any) => Promise<void>) =>
        fn({
          scheduledReminder: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn().mockResolvedValue({ id: 'sale-reminder' }),
          },
        }),
      );

      await service.scheduleSale(USER_ID, ANN_ID, GS_TIER_ID);

      expect(prisma.saleTier.findFirst).toHaveBeenCalledWith({ where: { id: GS_TIER_ID, saleId: ANN_ID } });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('does nothing when the tier does not belong to this announcement', async () => {
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue(null);

      await service.scheduleSale(USER_ID, ANN_ID, GS_TIER_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing when saleEnabled is false', async () => {
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue({
        id: GS_TIER_ID,
        saleId: ANN_ID,
        name: 'General Sale',
        date: futureDate,
      });
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(
        makeSettings({ saleEnabled: false }),
      );

      await service.scheduleSale(USER_ID, ANN_ID, GS_TIER_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('schedules off the tier\'s own date regardless of which tier it is', async () => {
      const eaDate = new Date(Date.now() + 5 * 24 * 3600 * 1000);
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue({
        id: EA_TIER_ID,
        saleId: ANN_ID,
        name: 'Early Access',
        date: eaDate,
      });
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeSettings());
      const createMock = jest.fn().mockResolvedValue({ id: 'ea-reminder' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: any) => Promise<void>) =>
        fn({
          scheduledReminder: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: createMock,
          },
        }),
      );

      await service.scheduleSale(USER_ID, ANN_ID, EA_TIER_ID);

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tierId: EA_TIER_ID }),
      }));
    });
  });

  describe('cancelByEntry', () => {
    it('cancels all pending renewal and book-choice reminders for an entry', async () => {
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.cancelByEntry(ENTRY_ID);

      expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entryId: ENTRY_ID, type: { in: ['renewal', 'book_choice'] }, sentAt: null, cancelledAt: null }),
        }),
      );
    });
  });

  describe('cancelBySaleInterest', () => {
    it('cancels pending sale reminder for user + announcement', async () => {
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.cancelBySaleInterest(USER_ID, ANN_ID);

      expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, announcementId: ANN_ID, type: 'sale' }),
        }),
      );
    });
  });

  describe('recalculateForUser', () => {
    it('cancels all pending reminders and reschedules renewals', async () => {
      (prisma.scheduledReminder.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(makeSettings({ saleEnabled: false }));
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ timezone: 'UTC' });
      const futureRenewal = new Date(Date.now() + 5 * 24 * 3600 * 1000);
      (prisma.userSubscriptionEntry.findMany as jest.Mock).mockResolvedValue([
        { id: ENTRY_ID, nextRenewalDate: futureRenewal },
      ]);
      (prisma.scheduledReminder.create as jest.Mock).mockResolvedValue({ id: 'rescheduled' });

      await service.recalculateForUser(USER_ID);

      expect(prisma.scheduledReminder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, sentAt: null, cancelledAt: null }),
        }),
      );
      expect(prisma.scheduledReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID, type: 'renewal', entryId: ENTRY_ID }) }),
      );
    });
  });
});
