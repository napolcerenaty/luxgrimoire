import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';
import { SaleInterestsService } from './sale-interests.service';

const USER = 'user-1';
const ANN = 'ann-1';

describe('SaleInterestsService', () => {
  let service: SaleInterestsService;
  let prisma: DeepMockProxy<PrismaService>;
  let reminders: { cancelBySaleInterest: jest.Mock; scheduleSale: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    reminders = {
      cancelBySaleInterest: jest.fn().mockResolvedValue(undefined),
      scheduleSale: jest.fn().mockResolvedValue(undefined),
    };
    service = new SaleInterestsService(prisma, reminders as unknown as ScheduledRemindersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upsert', () => {
    it('throws NotFoundException when the tier is not on that announcement', async () => {
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.upsert(USER, ANN, 'tier-x')).rejects.toThrow(NotFoundException);
    });

    it('upserts the interest keyed by (user, announcement) carrying the tier region and price', async () => {
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue({ id: 'tier-1', regionId: 'reg-1' });
      (prisma.userSaleInterest.upsert as jest.Mock).mockResolvedValue({ id: 'int-1' });

      await service.upsert(USER, ANN, 'tier-1', 42, 'EUR');

      const arg = (prisma.userSaleInterest.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.where).toEqual({ userId_announcementId: { userId: USER, announcementId: ANN } });
      expect(arg.create).toMatchObject({ userId: USER, announcementId: ANN, tierId: 'tier-1', regionId: 'reg-1', selectedPrice: 42, selectedPriceCurrency: 'EUR' });
      expect(arg.update).toMatchObject({ tierId: 'tier-1', regionId: 'reg-1', selectedPrice: 42 });
    });

    it('nulls the price fields when they are omitted', async () => {
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue({ id: 'tier-1', regionId: null });
      (prisma.userSaleInterest.upsert as jest.Mock).mockResolvedValue({ id: 'int-1' });

      await service.upsert(USER, ANN, 'tier-1');

      const arg = (prisma.userSaleInterest.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.create.selectedPrice).toBeNull();
      expect(arg.create.selectedPriceCurrency).toBeNull();
    });

    it('reschedules the sale reminder: cancel then schedule for the chosen tier', async () => {
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue({ id: 'tier-1', regionId: null });
      (prisma.userSaleInterest.upsert as jest.Mock).mockResolvedValue({ id: 'int-1' });

      await service.upsert(USER, ANN, 'tier-1');
      await new Promise((r) => setImmediate(r));

      expect(reminders.cancelBySaleInterest).toHaveBeenCalledWith(USER, ANN);
      expect(reminders.scheduleSale).toHaveBeenCalledWith(USER, ANN, 'tier-1');
    });

    it('works without the optional ScheduledRemindersService', async () => {
      const bare = new SaleInterestsService(prisma);
      (prisma.saleTier.findFirst as jest.Mock).mockResolvedValue({ id: 'tier-1', regionId: null });
      (prisma.userSaleInterest.upsert as jest.Mock).mockResolvedValue({ id: 'int-1' });

      await expect(bare.upsert(USER, ANN, 'tier-1')).resolves.toEqual({ id: 'int-1' });
    });
  });

  describe('remove', () => {
    it('deletes every interest row for (user, announcement) and cancels the reminder', async () => {
      (prisma.userSaleInterest.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const res = await service.remove(USER, ANN);

      expect(prisma.userSaleInterest.deleteMany).toHaveBeenCalledWith({ where: { userId: USER, announcementId: ANN } });
      expect(reminders.cancelBySaleInterest).toHaveBeenCalledWith(USER, ANN);
      expect(res).toEqual({ ok: true });
    });
  });

  describe('findAll / findOne / findBatch', () => {
    it('findAll scopes to the user, newest first', async () => {
      (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValue([]);
      await service.findAll(USER);
      const arg = (prisma.userSaleInterest.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.where).toEqual({ userId: USER });
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('findBatch short-circuits on an empty id list', async () => {
      const res = await service.findBatch(USER, []);
      expect(res).toEqual([]);
      expect(prisma.userSaleInterest.findMany).not.toHaveBeenCalled();
    });

    it('findBatch queries the given announcement ids for the user', async () => {
      (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValue([]);
      await service.findBatch(USER, ['a', 'b']);
      expect((prisma.userSaleInterest.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        userId: USER,
        announcementId: { in: ['a', 'b'] },
      });
    });
  });

  describe('getUpcoming', () => {
    it('returns only future-tier interests, soonest first, capped to the limit', async () => {
      (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValue([]);

      await service.getUpcoming(USER);

      const arg = (prisma.userSaleInterest.findMany as jest.Mock).mock.calls[0][0];
      expect(arg.where.userId).toBe(USER);
      expect(arg.where.saleTier.date.gte).toBeInstanceOf(Date);
      expect((arg.where.saleTier.date.gte as Date).getHours()).toBe(0); // normalised to local midnight
      expect(arg.orderBy).toEqual({ saleTier: { date: 'asc' } });
      expect(arg.take).toBe(3);
    });

    it('honours an explicit limit', async () => {
      (prisma.userSaleInterest.findMany as jest.Mock).mockResolvedValue([]);
      await service.getUpcoming(USER, 10);
      expect((prisma.userSaleInterest.findMany as jest.Mock).mock.calls[0][0].take).toBe(10);
    });
  });
});
