/**
 * Focused tests for FeesService's cost-snapshot refresh-on-write hook, added alongside the
 * "expected shipping/fees, based on your past purchases" feature. Not a full-service spec
 * (none existed for FeesService before this) — scoped to the new behavior only:
 * createPurchaseFee/updatePurchaseFee/deletePurchaseFee must call
 * UserCostSnapshotCronService.refreshSnapshotForPurchaseGroup with the fee's purchaseGroupId,
 * fire-and-forget.
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { UserCostSnapshotCronService } from '../user-cost-snapshots/user-cost-snapshot.cron';
import { FeesService } from './fees.service';
import { CreatePurchaseFeeDto, UpdatePurchaseFeeDto } from './fees.dto';

describe('FeesService — cost snapshot refresh', () => {
  let service: FeesService;
  let prisma: DeepMockProxy<PrismaService>;
  let statsService: DeepMockProxy<StatsService>;
  let userCostSnapshotService: DeepMockProxy<UserCostSnapshotCronService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    statsService = mockDeep<StatsService>();
    userCostSnapshotService = mockDeep<UserCostSnapshotCronService>();
    userCostSnapshotService.refreshSnapshotForPurchaseGroup.mockResolvedValue(undefined);
    service = new FeesService(prisma, statsService, userCostSnapshotService);
  });

  describe('createPurchaseFee', () => {
    it('refreshes the snapshot for the fee\'s purchase group', async () => {
      const dto: CreatePurchaseFeeDto = {
        name: 'Customs', amount: 5, currency: 'USD', date: '2026-01-01', purchaseGroupId: 'pg-1',
      } as CreatePurchaseFeeDto;
      (prisma.userPurchaseFee.create as jest.Mock).mockResolvedValueOnce({ id: 'fee-1', ...dto });

      await service.createPurchaseFee('user-1', dto);

      expect(userCostSnapshotService.refreshSnapshotForPurchaseGroup).toHaveBeenCalledWith('user-1', 'pg-1');
    });

    it('passes null through when the fee has no purchase group', async () => {
      const dto: CreatePurchaseFeeDto = {
        name: 'Customs', amount: 5, currency: 'USD', date: '2026-01-01',
      } as CreatePurchaseFeeDto;
      (prisma.userPurchaseFee.create as jest.Mock).mockResolvedValueOnce({ id: 'fee-1', ...dto });

      await service.createPurchaseFee('user-1', dto);

      expect(userCostSnapshotService.refreshSnapshotForPurchaseGroup).toHaveBeenCalledWith('user-1', null);
    });
  });

  describe('updatePurchaseFee', () => {
    it('refreshes using the existing fee\'s purchaseGroupId (not user-suppliable via update)', async () => {
      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'fee-1', userId: 'user-1', purchaseGroupId: 'pg-1', date: new Date('2026-01-01'),
      });
      (prisma.userPurchaseFee.update as jest.Mock).mockResolvedValueOnce({ id: 'fee-1' });
      const dto: UpdatePurchaseFeeDto = { amount: 7 };

      await service.updatePurchaseFee('user-1', 'fee-1', dto);

      expect(userCostSnapshotService.refreshSnapshotForPurchaseGroup).toHaveBeenCalledWith('user-1', 'pg-1');
    });

    it('throws and never refreshes when the fee does not exist', async () => {
      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.updatePurchaseFee('user-1', 'missing', { amount: 7 })).rejects.toThrow(NotFoundException);
      expect(userCostSnapshotService.refreshSnapshotForPurchaseGroup).not.toHaveBeenCalled();
    });
  });

  describe('deletePurchaseFee', () => {
    it('refreshes the snapshot for the deleted fee\'s purchase group', async () => {
      (prisma.userPurchaseFee.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'fee-1', userId: 'user-1', purchaseGroupId: 'pg-1', date: new Date('2026-01-01'),
      });

      await service.deletePurchaseFee('user-1', 'fee-1');

      expect(prisma.userPurchaseFee.delete).toHaveBeenCalledWith({ where: { id: 'fee-1' } });
      expect(userCostSnapshotService.refreshSnapshotForPurchaseGroup).toHaveBeenCalledWith('user-1', 'pg-1');
    });
  });
});
