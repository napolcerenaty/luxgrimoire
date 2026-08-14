/**
 * Regression tests for AnnouncementsService.findTrending().
 *
 * Bug #1: the query used to rank ALL announcements by all-time interest count, take the
 * top N, and only afterward filter that top-N down to ones with an upcoming tier date.
 * Once the earliest (and therefore most-followed) announcements sold out, they'd crowd
 * out newer upcoming ones from the top-N entirely, and the post-filter would zero out
 * the whole result — even when other upcoming announcements had qualifying interest.
 * Fixed by resolving upcoming announcement ids first, then ranking interest only among
 * those.
 *
 * Design: a minimum of 2 interested users counts as "trending" on its own — but with a
 * small user base that alone can still under-fill (or empty) the section, so it backfills
 * down to 1-follow, then 0-follow (newest first) upcoming announcements to fill remaining
 * slots, rather than showing fewer tiles than requested just because interest hasn't
 * caught up yet.
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
    {} as any, // UserCostSnapshotCronService
    { get: async () => undefined, set: async () => {} } as any, // Cache
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

  it('returns an empty list without querying interests when nothing is upcoming', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([]);

    const result = await service.findTrending(6);

    expect(result).toEqual([]);
    expect(prisma.userSaleInterest.groupBy).not.toHaveBeenCalled();
  });

  it('sorts multiple qualifying (>=2 follow) upcoming announcements by interest count, most-followed first', async () => {
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

  it('backfills with a 1-follow announcement (ranked below the 2+ ones) when nothing else qualifies', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'up-a' }, { id: 'up-b' },
    ]);
    (prisma.userSaleInterest.groupBy as jest.Mock).mockResolvedValueOnce([
      { announcementId: 'up-a', _count: { announcementId: 3 } },
      { announcementId: 'up-b', _count: { announcementId: 1 } },
    ]);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'up-a', title: 'A', editions: [], tiers: [], company: null },
      { id: 'up-b', title: 'B', editions: [], tiers: [], company: null },
    ]);

    const result = await service.findTrending(6);

    expect(result.map((r: any) => r.id)).toEqual(['up-a', 'up-b']);
    expect(result.map((r: any) => r.interestCount)).toEqual([3, 1]);
  });

  it('backfills with zero-follow upcoming announcements, newest first, when still short of the requested limit', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'up-a' }, { id: 'up-b' }, { id: 'up-c' },
    ]);
    // Only up-a has ever been followed — up-b/up-c never appear in a real groupBy result.
    (prisma.userSaleInterest.groupBy as jest.Mock).mockResolvedValueOnce([
      { announcementId: 'up-a', _count: { announcementId: 5 } },
    ]);
    // Zero-interest backfill query: newest-first, limited to the remaining slots.
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'up-c' }]);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'up-a', title: 'A', editions: [], tiers: [], company: null },
      { id: 'up-c', title: 'C', editions: [], tiers: [], company: null },
    ]);

    const result = await service.findTrending(2);

    expect(result.map((r: any) => r.id)).toEqual(['up-a', 'up-c']);
    expect(result.map((r: any) => r.interestCount)).toEqual([5, 0]);

    const backfillCall = (prisma.saleAnnouncement.findMany as jest.Mock).mock.calls[1][0];
    expect(backfillCall.where.id.in.sort()).toEqual(['up-b', 'up-c']);
    expect(backfillCall.orderBy).toEqual({ createdAt: 'desc' });
    expect(backfillCall.take).toBe(1);
  });
});
