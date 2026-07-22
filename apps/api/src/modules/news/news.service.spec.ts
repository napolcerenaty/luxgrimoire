/**
 * Unit tests for NewsService — status-transition guards (spec section 4/5b) and
 * the date-range filter used by the jump-to-date feed (spec 9.1).
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NewsService } from './news.service';
import { NewsItemStatus } from '@prisma/client';

describe('NewsService — status transitions', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new NewsService(prisma);
  });

  it('approve() moves a DRAFT to PUBLISHED and sets publishedAt', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.DRAFT });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.PUBLISHED });

    await service.approve('n1');

    expect(prisma.newsItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n1' },
        data: expect.objectContaining({ status: NewsItemStatus.PUBLISHED, publishedAt: expect.any(Date) }),
      }),
    );
  });

  it('approve() on an already-PUBLISHED item only bumps lastUpdatedAt (dedup "confirm as update", spec 5b) — does not create a second card', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.PUBLISHED });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'n1' });

    await service.approve('n1');

    expect(prisma.newsItem.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { lastUpdatedAt: expect.any(Date) },
    });
  });

  it('approve() rejects a REJECTED item — cannot be resurrected by approving', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.REJECTED });
    await expect(service.approve('n1')).rejects.toThrow(BadRequestException);
  });

  it('retract() only allowed on a PUBLISHED item', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.DRAFT });
    await expect(service.retract('n1')).rejects.toThrow(BadRequestException);
  });

  it('retract() moves PUBLISHED to RETRACTED', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.PUBLISHED });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.RETRACTED });

    await service.retract('n1');

    expect(prisma.newsItem.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { status: NewsItemStatus.RETRACTED },
    });
  });

  it('reject()/updateDraft() refuse to touch a PUBLISHED or RETRACTED item', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.PUBLISHED });
    await expect(service.reject('n1')).rejects.toThrow(BadRequestException);

    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.RETRACTED });
    await expect(service.updateDraft('n1', { title: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('getOne() throws NotFoundException for a missing id', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('remove() hard-deletes (cascades to NewsSourceRecord via onDelete: Cascade at the DB level)', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', status: NewsItemStatus.REJECTED });
    (prisma.newsItem.delete as jest.Mock).mockResolvedValue({ id: 'n1' });

    const result = await service.remove('n1');

    expect(prisma.newsItem.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
    expect(result).toEqual({ ok: true });
  });
});

describe('NewsService.listPublished — jump-to-date filter (spec 9.1)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.newsItem.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.newsItem.count as jest.Mock).mockResolvedValue(0);
    service = new NewsService(prisma);
  });

  it('filters to a single UTC calendar day when `date` is given', async () => {
    await service.listPublished(1, 20, '2026-07-15');

    expect(prisma.newsItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishedAt: {
            gte: new Date('2026-07-15T00:00:00.000Z'),
            lt: new Date('2026-07-16T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('rejects a malformed date instead of silently ignoring it', async () => {
    await expect(service.listPublished(1, 20, 'not-a-date')).rejects.toThrow(BadRequestException);
  });

  it('omits the date filter entirely when no `date` is given', async () => {
    await service.listPublished(1, 20);

    expect(prisma.newsItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: NewsItemStatus.PUBLISHED } }),
    );
  });
});

describe('NewsService — unread count cursor (spec 8.1/8.2)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new NewsService(prisma);
  });

  it('getUnreadCountForUser() counts published items newer than the user\'s newsLastSeenAt cursor', async () => {
    const lastSeen = new Date('2026-07-01T00:00:00.000Z');
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ newsLastSeenAt: lastSeen });
    (prisma.newsItem.count as jest.Mock).mockResolvedValue(3);

    const result = await service.getUnreadCountForUser('u1');

    expect(prisma.newsItem.count).toHaveBeenCalledWith({
      where: { status: NewsItemStatus.PUBLISHED, publishedAt: { gt: lastSeen } },
    });
    expect(result).toEqual({ count: 3 });
  });

  it('getUnreadCountForUser() counts everything published when the user has never seen the feed', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ newsLastSeenAt: null });
    (prisma.newsItem.count as jest.Mock).mockResolvedValue(5);

    await service.getUnreadCountForUser('u1');

    expect(prisma.newsItem.count).toHaveBeenCalledWith({
      where: { status: NewsItemStatus.PUBLISHED, publishedAt: undefined },
    });
  });

  it('getUnreadCountSince() rejects a malformed `since` value', async () => {
    await expect(service.getUnreadCountSince('garbage')).rejects.toThrow(BadRequestException);
  });

  it('markSeenForUser() writes the current time as the user\'s new cursor', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    await service.markSeenForUser('u1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { newsLastSeenAt: expect.any(Date) },
    });
  });
});
