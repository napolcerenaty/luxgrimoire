import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import { ReminderSettingsService } from '../notifications/reminder-settings.service';
import { SeriesContinuationCron } from './series-continuation.cron';

const USER_ID = 'user-1';
const SALE_ID = 'sale-1';

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pending-1',
  userId: USER_ID,
  saleAnnouncementId: SALE_ID,
  editionIds: ['edition-1'],
  ...overrides,
});

const makeSettings = (overrides: Record<string, unknown> = {}) => ({
  seriesContinuationInAppEnabled: true,
  seriesContinuationPushEnabled: true,
  ...overrides,
});

describe('SeriesContinuationCron', () => {
  let cron: SeriesContinuationCron;
  let prisma: DeepMockProxy<PrismaService>;
  let notificationsService: DeepMockProxy<NotificationsService>;
  let pushService: DeepMockProxy<PushService>;
  let reminderSettingsService: DeepMockProxy<ReminderSettingsService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    notificationsService = mockDeep<NotificationsService>();
    pushService = mockDeep<PushService>();
    reminderSettingsService = mockDeep<ReminderSettingsService>();
    cron = new SeriesContinuationCron(prisma, notificationsService, pushService, reminderSettingsService);

    (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValue({
      id: SALE_ID,
      company: { name: 'Acme Books' },
    });
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([
      { bookBoxCompanyId: 'company-1', variantLabel: null, book: { id: 'book-2', title: 'Volume Two', seriesId: 'series-1', series: null } },
    ]);
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.pendingSeriesContinuationNotification.delete as jest.Mock).mockResolvedValue({});
  });

  it('does nothing when no rows are due', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([]);
    await cron.processPendingNotifications();
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('creates an in-app notification and sends push when both toggles are on and device push is enabled', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockResolvedValue(makeSettings() as any);
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: true });

    await cron.processPendingNotifications();

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      USER_ID,
      'series_continuation',
      expect.stringContaining('Acme Books'),
      expect.stringContaining('Volume Two'),
      'sale-announcements',
      SALE_ID,
      { skipPush: true },
    );
    expect(pushService.sendToUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ type: 'series_continuation', link: `/sale-announcements/${SALE_ID}` }),
    );
    expect(prisma.pendingSeriesContinuationNotification.delete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('skips in-app when in-app is disabled but still sends push', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockResolvedValue(makeSettings({ seriesContinuationInAppEnabled: false }) as any);
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: true });

    await cron.processPendingNotifications();

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(pushService.sendToUser).toHaveBeenCalled();
  });

  it('skips push when the per-type toggle is off, even if device push is enabled', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockResolvedValue(makeSettings({ seriesContinuationPushEnabled: false }) as any);
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: true });

    await cron.processPendingNotifications();

    expect(notificationsService.createNotification).toHaveBeenCalled();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  it('skips push when the global device push toggle is off, even if the per-type toggle is on', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockResolvedValue(makeSettings() as any);
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: false });

    await cron.processPendingNotifications();

    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  it('does nothing at all when both toggles are off, but still deletes the row', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockResolvedValue(
      makeSettings({ seriesContinuationInAppEnabled: false, seriesContinuationPushEnabled: false }) as any,
    );

    await cron.processPendingNotifications();

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
    expect(prisma.pendingSeriesContinuationNotification.delete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('dedupes book titles when multiple editionIds belong to the same book (variants added together)', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([
      makeRow({ editionIds: ['edition-1', 'edition-2'] }),
    ]);
    reminderSettingsService.getSettings.mockResolvedValue(makeSettings() as any);
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([
      { bookBoxCompanyId: 'company-1', variantLabel: null, book: { id: 'book-2', title: 'Volume Two', seriesId: 'series-1', series: null } },
      { bookBoxCompanyId: 'company-1', variantLabel: null, book: { id: 'book-2', title: 'Volume Two', seriesId: 'series-1', series: null } },
    ]);
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: false });

    await cron.processPendingNotifications();

    const body = (notificationsService.createNotification as jest.Mock).mock.calls[0][3];
    expect(body).toBe('Volume Two from Acme Books has been announced. Tap to view.');
  });

  it('names the series in the title when the book has one', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockResolvedValue(makeSettings() as any);
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([
      { bookBoxCompanyId: 'company-1', variantLabel: null, book: { id: 'book-2', title: 'Volume Two', seriesId: 'series-1', series: { name: 'The Fallen' } } },
    ]);
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: false });

    await cron.processPendingNotifications();

    const title = (notificationsService.createNotification as jest.Mock).mock.calls[0][2];
    expect(title).toBe('New volume of The Fallen');
  });

  it('appends the variant label to titles, and references the owned book the same way', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockResolvedValue(makeSettings() as any);
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([
      { bookBoxCompanyId: 'company-1', variantLabel: 'Black Edition', book: { id: 'book-2', title: 'Volume Two', seriesId: 'series-1', series: null } },
    ]);
    (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue({ book: { title: 'Volume One' } });
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: false });

    await cron.processPendingNotifications();

    const body = (notificationsService.createNotification as jest.Mock).mock.calls[0][3];
    expect(body).toBe('You have Volume One (Black Edition) — Volume Two (Black Edition) from Acme Books has been announced. Tap to view.');
  });

  it('deletes the row even if processing throws, so a permanently-bad row does not block future runs', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockRejectedValue(new Error('boom'));

    await cron.processPendingNotifications();

    expect(prisma.pendingSeriesContinuationNotification.delete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('skips a row whose announcement no longer exists', async () => {
    (prisma.pendingSeriesContinuationNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    reminderSettingsService.getSettings.mockResolvedValue(makeSettings() as any);
    (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValue(null);

    await cron.processPendingNotifications();

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(prisma.pendingSeriesContinuationNotification.delete).toHaveBeenCalled();
  });
});
