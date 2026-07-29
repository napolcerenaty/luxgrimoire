/**
 * Regression tests for AnnouncementsService.findTrending().
 *
 * Bug: the query used to rank ALL announcements by all-time interest count, take the
 * top N, and only afterward filter that top-N down to ones with an upcoming tier date.
 * Once the earliest (and therefore most-followed) announcements sold out, they'd crowd
 * out newer upcoming ones from the top-N entirely, and the post-filter would zero out
 * the whole result — even when other upcoming announcements had qualifying interest.
 * Fixed by resolving upcoming announcement ids first, then ranking interest only among
 * those, with an explicit minimum of 2 interested users to count as "trending".
 */

import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementsService } from './announcements.service';

function makeService(prisma: DeepMockProxy<PrismaService>) {
  return new AnnouncementsService(
    prisma,
    {} as any, // TypesenseService
    {} as any, // UploadService
    {} as any, // MediaAssetsService
  );
}

describe('AnnouncementsService — findTrending', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AnnouncementsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = makeService(prisma);
  });

  it('does not let a sold-out, heavily-followed announcement crowd out an upcoming one with fewer follows', async () => {
    // PAST-1 has 10 follows but no upcoming tier; UPCOMING-1 has only 2 follows but is upcoming.
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'upcoming-1' }]);
    (prisma.userSaleInterest.groupBy as jest.Mock).mockResolvedValueOnce([
      { announcementId: 'upcoming-1', _count: { announcementId: 2 } },
    ]);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'upcoming-1', title: 'Upcoming Sale', editions: [], tiers: [], company: null },
    ]);

    const result = await service.findTrending(6);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('upcoming-1');
    expect(result[0].interestCount).toBe(2);

    // The upcoming-only id list was resolved BEFORE ranking by interest, and passed into groupBy's where.
    expect(prisma.userSaleInterest.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { announcementId: { in: ['upcoming-1'] } } }),
    );
  });

  it('excludes announcements with only 1 follow (below the trending minimum)', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'upcoming-1' }]);
    // having: { _count: { gte: 2 } } means a single-follow announcement would never
    // come back from a real DB — simulate that by returning an empty groupBy result.
    (prisma.userSaleInterest.groupBy as jest.Mock).mockResolvedValueOnce([]);

    const result = await service.findTrending(6);

    expect(result).toEqual([]);
    expect(prisma.userSaleInterest.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ having: { announcementId: { _count: { gte: 2 } } } }),
    );
  });

  it('returns an empty list without querying interests when nothing is upcoming', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([]);

    const result = await service.findTrending(6);

    expect(result).toEqual([]);
    expect(prisma.userSaleInterest.groupBy).not.toHaveBeenCalled();
  });

  it('sorts multiple qualifying upcoming announcements by interest count, most-followed first', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'up-a' }, { id: 'up-b' },
    ]);
    (prisma.userSaleInterest.groupBy as jest.Mock).mockResolvedValueOnce([
      { announcementId: 'up-b', _count: { announcementId: 5 } },
      { announcementId: 'up-a', _count: { announcementId: 3 } },
    ]);
    // findMany for the full records may return in a different order than requested
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'up-a', title: 'A', editions: [], tiers: [], company: null },
      { id: 'up-b', title: 'B', editions: [], tiers: [], company: null },
    ]);

    const result = await service.findTrending(6);

    expect(result.map((r: any) => r.id)).toEqual(['up-b', 'up-a']);
    expect(result.map((r: any) => r.interestCount)).toEqual([5, 3]);
  });
});
