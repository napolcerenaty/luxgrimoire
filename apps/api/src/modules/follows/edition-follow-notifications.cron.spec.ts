/**
 * Unit tests for EditionFollowNotificationsCron — consumes PendingEditionNotification rows
 * once their 5-minute debounce window has elapsed, sending one combined notification per row
 * (in-app and/or push, per the user's newEditionFollowInAppEnabled/PushEnabled toggles) and
 * then deleting the row.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { EditionFollowNotificationsCron } from './edition-follow-notifications.cron';

const USER_ID = 'user-1';
const EDITION_ID = 'edition-1';

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pending-1',
  userId: USER_ID,
  editionId: EDITION_ID,
  reasons: [{ type: 'book', id: 'book-1', name: 'This Poison Heart' }],
  scheduledFor: new Date('2026-01-01T00:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const EDITION = { slug: 'this-poison-heart', book: { title: 'This Poison Heart' } };

describe('EditionFollowNotificationsCron', () => {
  let cron: EditionFollowNotificationsCron;
  let prisma: DeepMockProxy<PrismaService>;
  let notificationsService: { createNotification: jest.Mock };
  let pushService: { sendToUser: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    notificationsService = { createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: true });
    (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue(EDITION);
    (prisma.pendingEditionNotification.delete as jest.Mock).mockResolvedValue(undefined);
    cron = new EditionFollowNotificationsCron(prisma, notificationsService as any, pushService as any);
  });

  it('does nothing when no rows are due', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([]);

    await cron.processDue();

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
    expect(prisma.pendingEditionNotification.delete).not.toHaveBeenCalled();
  });

  it('only queries rows whose scheduledFor is due', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([]);

    await cron.processDue();

    expect(prisma.pendingEditionNotification.findMany).toHaveBeenCalledWith({
      where: { scheduledFor: { lte: expect.any(Date) } },
    });
  });

  it('sends in-app only when newEditionFollowInAppEnabled=true, PushEnabled=false', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue({
      newEditionFollowInAppEnabled: true,
      newEditionFollowPushEnabled: false,
    });

    await cron.processDue();

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      USER_ID,
      'new_edition_follow',
      'New edition: This Poison Heart',
      'You follow This Poison Heart',
      'editions',
      'this-poison-heart',
      { skipPush: true },
    );
    expect(pushService.sendToUser).not.toHaveBeenCalled();
    expect(prisma.pendingEditionNotification.delete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('sends push only when newEditionFollowInAppEnabled=false, PushEnabled=true', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue({
      newEditionFollowInAppEnabled: false,
      newEditionFollowPushEnabled: true,
    });

    await cron.processDue();

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(pushService.sendToUser).toHaveBeenCalledWith(USER_ID, {
      title: 'New edition: This Poison Heart',
      body: 'You follow This Poison Heart',
      link: '/editions/this-poison-heart',
      type: 'new_edition_follow',
    });
  });

  it('sends both in-app and push independently when both toggles are on', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue({
      newEditionFollowInAppEnabled: true,
      newEditionFollowPushEnabled: true,
    });

    await cron.processDue();

    expect(notificationsService.createNotification).toHaveBeenCalledTimes(1);
    expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('sends neither channel when both toggles are off, but still cleans up the row', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue({
      newEditionFollowInAppEnabled: false,
      newEditionFollowPushEnabled: false,
    });

    await cron.processDue();

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
    expect(prisma.pendingEditionNotification.delete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('defaults to both channels on when the user has no reminder-settings row yet', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(null);

    await cron.processDue();

    expect(notificationsService.createNotification).toHaveBeenCalledTimes(1);
    expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('never sends push when the device-level push preference is off, even if newEditionFollowPushEnabled=true', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue({
      newEditionFollowInAppEnabled: true,
      newEditionFollowPushEnabled: true,
    });
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: false });

    await cron.processDue();

    expect(notificationsService.createNotification).toHaveBeenCalledTimes(1);
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  it('skips notifying but still deletes the row when the edition no longer exists', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue({
      newEditionFollowInAppEnabled: true,
      newEditionFollowPushEnabled: true,
    });
    (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue(null);

    await cron.processDue();

    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
    expect(prisma.pendingEditionNotification.delete).toHaveBeenCalledWith({ where: { id: 'pending-1' } });
  });

  it('leaves the row in place (no delete) when sending throws, so it is retried next run', async () => {
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([makeRow()]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue({
      newEditionFollowInAppEnabled: true,
      newEditionFollowPushEnabled: false,
    });
    notificationsService.createNotification.mockRejectedValueOnce(new Error('db down'));

    await cron.processDue();

    expect(prisma.pendingEditionNotification.delete).not.toHaveBeenCalled();
  });

  it('processes remaining due rows even when an earlier one fails', async () => {
    const row1 = makeRow({ id: 'pending-1', userId: 'user-1' });
    const row2 = makeRow({ id: 'pending-2', userId: 'user-2' });
    (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([row1, row2]);
    (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue({
      newEditionFollowInAppEnabled: true,
      newEditionFollowPushEnabled: false,
    });
    notificationsService.createNotification
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ id: 'notif-2' });

    await cron.processDue();

    expect(notificationsService.createNotification).toHaveBeenCalledTimes(2);
    // Only the successful second row gets cleaned up
    expect(prisma.pendingEditionNotification.delete).toHaveBeenCalledTimes(1);
    expect(prisma.pendingEditionNotification.delete).toHaveBeenCalledWith({ where: { id: 'pending-2' } });
  });

  describe('reason formatting', () => {
    const settings = { newEditionFollowInAppEnabled: true, newEditionFollowPushEnabled: false };

    it('formats a single reason as "You follow X"', async () => {
      (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([
        makeRow({ reasons: [{ type: 'book', id: 'book-1', name: 'This Poison Heart' }] }),
      ]);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(settings);

      await cron.processDue();

      const body = notificationsService.createNotification.mock.calls[0][3];
      expect(body).toBe('You follow This Poison Heart');
    });

    it('formats two reasons as "You follow X and Y"', async () => {
      (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([
        makeRow({
          reasons: [
            { type: 'book', id: 'book-1', name: 'This Poison Heart' },
            { type: 'author', id: 'author-1', name: 'Ilona Andrews' },
          ],
        }),
      ]);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(settings);

      await cron.processDue();

      const body = notificationsService.createNotification.mock.calls[0][3];
      expect(body).toBe('You follow This Poison Heart and Ilona Andrews');
    });

    it('formats three+ reasons as an Oxford-comma list', async () => {
      (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([
        makeRow({
          reasons: [
            { type: 'book', id: 'book-1', name: 'This Poison Heart' },
            { type: 'author', id: 'author-1', name: 'Ilona Andrews' },
            { type: 'artist', id: 'artist-1', name: 'Maggie' },
          ],
        }),
      ]);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(settings);

      await cron.processDue();

      const body = notificationsService.createNotification.mock.calls[0][3];
      expect(body).toBe('You follow This Poison Heart, Ilona Andrews, and Maggie');
    });

    it('de-duplicates repeated names across reasons', async () => {
      (prisma.pendingEditionNotification.findMany as jest.Mock).mockResolvedValue([
        makeRow({
          reasons: [
            { type: 'book', id: 'book-1', name: 'Same Name' },
            { type: 'author', id: 'author-1', name: 'Same Name' },
          ],
        }),
      ]);
      (prisma.userReminderSettings.findUnique as jest.Mock).mockResolvedValue(settings);

      await cron.processDue();

      const body = notificationsService.createNotification.mock.calls[0][3];
      expect(body).toBe('You follow Same Name');
    });
  });
});
