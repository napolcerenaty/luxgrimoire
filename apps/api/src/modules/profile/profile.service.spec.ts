import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';
import { ProfileService } from './profile.service';

const USER = 'user-1';
const OTHER = 'user-2';

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: DeepMockProxy<PrismaService>;
  let scheduledReminders: { recalculateForUser: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    scheduledReminders = { recalculateForUser: jest.fn().mockResolvedValue(undefined) };
    service = new ProfileService(prisma, scheduledReminders as unknown as ScheduledRemindersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getProfile', () => {
    it('throws NotFoundException for an unknown username', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getProfile('ghost')).rejects.toThrow(NotFoundException);
    });

    it('returns the public profile projection', async () => {
      const row = { id: USER, username: 'jane', bio: null, avatarUrl: null, createdAt: new Date(0), role: 'USER', _count: { bookEntries: 3 } };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(row);
      await expect(service.getProfile('jane')).resolves.toBe(row);
    });
  });

  describe('updateProfile', () => {
    it('writes only the fields present in the DTO', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: USER });

      await service.updateProfile(USER, { bio: 'hi' } as any);

      expect((prisma.user.update as jest.Mock).mock.calls[0][0].data).toEqual({ bio: 'hi' });
    });

    it('upper-cases the shipping country', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: USER });

      await service.updateProfile(USER, { shippingCountry: 'pl' } as any);

      expect((prisma.user.update as jest.Mock).mock.calls[0][0].data).toEqual({ shippingCountry: 'PL' });
    });

    it('recalculates scheduled reminders only when the timezone changes', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: USER });

      await service.updateProfile(USER, { displayName: 'Jane' } as any);
      expect(scheduledReminders.recalculateForUser).not.toHaveBeenCalled();

      await service.updateProfile(USER, { timezone: 'Europe/Warsaw' } as any);
      expect(scheduledReminders.recalculateForUser).toHaveBeenCalledWith(USER);
    });

    it('does not crash when the optional ScheduledRemindersService is absent', async () => {
      const bare = new ProfileService(prisma);
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: USER });

      await expect(bare.updateProfile(USER, { timezone: 'Europe/Warsaw' } as any)).resolves.toBeDefined();
    });
  });

  describe('deleteAccount', () => {
    it('hard-deletes the user row', async () => {
      (prisma.user.delete as jest.Mock).mockResolvedValue({ id: USER });

      await service.deleteAccount(USER);

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: USER } });
    });
  });

  describe('changeUsername', () => {
    it('throws ConflictException when the name is taken by another user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: OTHER, username: 'taken' });
      await expect(service.changeUsername(USER, { username: 'taken' } as any)).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows re-submitting the caller\'s own current username', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: USER, username: 'jane' });
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: USER, username: 'jane' });

      await expect(service.changeUsername(USER, { username: 'jane' } as any)).resolves.toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER }, data: { username: 'jane' } }),
      );
    });

    it('updates when the username is free', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.update as jest.Mock).mockResolvedValue({ id: USER, username: 'newname' });

      await service.changeUsername(USER, { username: 'newname' } as any);

      expect((prisma.user.update as jest.Mock).mock.calls[0][0].data).toEqual({ username: 'newname' });
    });
  });
});
