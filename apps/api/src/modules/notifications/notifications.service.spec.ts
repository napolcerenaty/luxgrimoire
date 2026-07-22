/**
 * Unit tests for NotificationsService.createNotification's push side effect.
 *
 * Regression coverage for: push must be skippable via opts.skipPush so callers
 * with their own per-type push toggle (sale/renewal reminders) can send push
 * themselves without createNotification also firing a second, ungated push.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { AuditService } from '../audit/audit.service';
import { PushService } from './push.service';

describe('NotificationsService.createNotification', () => {
  let service: NotificationsService;
  let prisma: DeepMockProxy<PrismaService>;
  let pushService: { sendToUser: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    (prisma.userNotification.create as jest.Mock).mockResolvedValue({ id: 'notif-1' });
    (prisma.appSetting.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: true });
    service = new NotificationsService(prisma, {} as AuditService, pushService as unknown as PushService);
  });

  it('sends push by default when the user has push enabled', async () => {
    await service.createNotification('user-1', 'bug_report', 'Title', 'Body');
    expect(pushService.sendToUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ title: 'Title' }));
  });

  it('does NOT send push when opts.skipPush=true, even if the user has push enabled', async () => {
    await service.createNotification('user-1', 'sale_reminder', 'Title', 'Body', undefined, undefined, { skipPush: true });
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  it('still creates the in-app notification record when skipPush=true', async () => {
    await service.createNotification('user-1', 'sale_reminder', 'Title', 'Body', undefined, undefined, { skipPush: true });
    expect(prisma.userNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', title: 'Title' }) }),
    );
  });

  it('does not send push when the user has push disabled, regardless of skipPush', async () => {
    (prisma.userNotificationPreference.findUnique as jest.Mock).mockResolvedValue({ pushEnabled: false });
    await service.createNotification('user-1', 'bug_report', 'Title', 'Body');
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });
});

/**
 * Regression coverage for: admin "App Notifications" broadcasts (sendNotification)
 * created in-app records but never sent push at all — appNotifPushEnabled was
 * stored but never read on the send path. Push should now go out to whichever
 * recipients have BOTH appNotifPushEnabled (per-type opt-in, default off) AND
 * pushEnabled (device-level preference) set — in-app always goes out regardless.
 */
describe('NotificationsService.sendNotification — admin push fanout', () => {
  let service: NotificationsService;
  let prisma: DeepMockProxy<PrismaService>;
  let pushService: { sendToUser: jest.Mock };

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    (prisma.userNotification.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.userReminderSettings.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userNotificationPreference.findMany as jest.Mock).mockResolvedValue([]);
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    service = new NotificationsService(prisma, auditService, pushService as unknown as PushService);
  });

  describe('targetType=users (synchronous path)', () => {
    it('creates in-app for everyone but only pushes users opted into BOTH appNotifPushEnabled and pushEnabled', async () => {
      (prisma.userReminderSettings.findMany as jest.Mock).mockResolvedValue([
        { userId: 'u1' }, { userId: 'u2' }, // opted into appNotifPushEnabled
      ]);
      (prisma.userNotificationPreference.findMany as jest.Mock).mockResolvedValue([
        { userId: 'u1' }, // only u1 also has device push enabled
      ]);

      const result = await service.sendNotification({ targetType: 'users', userIds: ['u1', 'u2', 'u3'], title: 'Update' });
      await flush();

      expect(result).toEqual({ sent: 3 });
      expect(prisma.userNotification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 'u1' }),
            expect.objectContaining({ userId: 'u2' }),
            expect.objectContaining({ userId: 'u3' }),
          ]),
        }),
      );
      expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
      expect(pushService.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ title: 'Update' }));
    });

    it('sends no push when nobody has appNotifPushEnabled (default-off)', async () => {
      await service.sendNotification({ targetType: 'users', userIds: ['u1', 'u2'], title: 'Update' });
      await flush();

      expect(prisma.userNotification.createMany).toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('does not push a user with appNotifPushEnabled=true but pushEnabled=false', async () => {
      (prisma.userReminderSettings.findMany as jest.Mock).mockResolvedValue([{ userId: 'u1' }]);
      (prisma.userNotificationPreference.findMany as jest.Mock).mockResolvedValue([]); // device push off

      await service.sendNotification({ targetType: 'users', userIds: ['u1'], title: 'Update' });
      await flush();

      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('a push fanout failure does not throw or block the in-app send', async () => {
      (prisma.userReminderSettings.findMany as jest.Mock).mockRejectedValue(new Error('db down'));

      await expect(
        service.sendNotification({ targetType: 'users', userIds: ['u1'], title: 'Update' }),
      ).resolves.toEqual({ sent: 1 });
      await flush();

      expect(prisma.userNotification.createMany).toHaveBeenCalled();
    });
  });

  describe('targetType=all / role (background batch path)', () => {
    it('pushes only opted-in users found in the background batch', async () => {
      (prisma.user.count as jest.Mock).mockResolvedValue(2);
      (prisma.user.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }])
        .mockResolvedValueOnce([]);
      (prisma.userReminderSettings.findMany as jest.Mock).mockResolvedValue([{ userId: 'u2' }]);
      (prisma.userNotificationPreference.findMany as jest.Mock).mockResolvedValue([{ userId: 'u2' }]);

      const result = await service.sendNotification({ targetType: 'all', title: 'Big update' });
      expect(result).toEqual({ sent: 2, queued: true });

      // Let the setImmediate background fanout (and its own fire-and-forget push call) run.
      await flush();
      await flush();

      expect(prisma.userNotification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ userId: 'u1' }), expect.objectContaining({ userId: 'u2' })]),
        }),
      );
      expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
      expect(pushService.sendToUser).toHaveBeenCalledWith('u2', expect.objectContaining({ title: 'Big update' }));
    });
  });
});
