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
