/**
 * Focused tests for CollectionService's cost-snapshot refresh-on-write hook, added alongside
 * the "expected shipping/fees, based on your past purchases" feature. Not a full-service spec
 * (none existed for CollectionService before this) — scoped to removeFromCollection's handling
 * of an emptied UserPurchaseGroup: it must call
 * UserCostSnapshotCronService.refreshSnapshotForSale with that group's saleAnnouncementId, and
 * must NOT do so when the entry's group still has other book entries (nothing was emptied).
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { CrowdStatsService } from '../crowd-stats/crowd-stats.service';
import { StatsService } from '../stats/stats.service';
import { UserCostSnapshotCronService } from '../user-cost-snapshots/user-cost-snapshot.cron';
import { CollectionService } from './collection.service';

describe('CollectionService.removeFromCollection — cost snapshot refresh', () => {
  let service: CollectionService;
  let prisma: DeepMockProxy<PrismaService>;
  let userCostSnapshotService: DeepMockProxy<UserCostSnapshotCronService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const crowdStatsService = mockDeep<CrowdStatsService>();
    const statsService = mockDeep<StatsService>();
    userCostSnapshotService = mockDeep<UserCostSnapshotCronService>();
    userCostSnapshotService.refreshSnapshotForSale.mockResolvedValue(undefined);
    service = new CollectionService(prisma, crowdStatsService, statsService, userCostSnapshotService);
  });

  it('refreshes the snapshot for the group\'s sale when removing the last entry empties it', async () => {
    (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'entry-1', userId: 'user-1', editionId: null, isWishlist: false,
      purchaseGroupId: 'pg-1', saleEntries: [],
    });
    (prisma.userBookEntry.count as jest.Mock).mockResolvedValueOnce(0); // now empty
    (prisma.userPurchaseGroup.findUnique as jest.Mock).mockResolvedValueOnce({ saleAnnouncementId: 'sale-1' });
    (prisma.userPurchaseGroup.delete as jest.Mock).mockResolvedValueOnce({});

    await service.removeFromCollection('user-1', 'entry-1');

    expect(prisma.userPurchaseGroup.delete).toHaveBeenCalledWith({ where: { id: 'pg-1' } });
    expect(userCostSnapshotService.refreshSnapshotForSale).toHaveBeenCalledWith('user-1', 'sale-1');
  });

  it('does not refresh (or delete the group) when other entries still remain in it', async () => {
    (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'entry-1', userId: 'user-1', editionId: null, isWishlist: false,
      purchaseGroupId: 'pg-1', saleEntries: [],
    });
    (prisma.userBookEntry.count as jest.Mock).mockResolvedValueOnce(2); // still has entries

    await service.removeFromCollection('user-1', 'entry-1');

    expect(prisma.userPurchaseGroup.delete).not.toHaveBeenCalled();
    expect(userCostSnapshotService.refreshSnapshotForSale).not.toHaveBeenCalled();
  });

  it('does not touch the snapshot service at all when the entry was never in a purchase group', async () => {
    (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'entry-1', userId: 'user-1', editionId: null, isWishlist: false,
      purchaseGroupId: null, saleEntries: [],
    });

    await service.removeFromCollection('user-1', 'entry-1');

    expect(prisma.userBookEntry.count).not.toHaveBeenCalled();
    expect(userCostSnapshotService.refreshSnapshotForSale).not.toHaveBeenCalled();
  });
});
