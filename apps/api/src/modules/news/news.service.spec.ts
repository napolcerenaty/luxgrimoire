/**
 * Unit tests for NewsService — status-transition guards (spec section 4/5b) and
 * the date-range filter used by the jump-to-date feed (spec 9.1).
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NewsService } from './news.service';
import { NewsItemStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { UploadService } from '../upload/upload.service';

describe('NewsService — status transitions', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new NewsService(prisma, {} as AiService, {} as UploadService);
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
    service = new NewsService(prisma, {} as AiService, {} as UploadService);
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
    service = new NewsService(prisma, {} as AiService, {} as UploadService);
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

describe('NewsService.ingestScreenshot — Phase 2 (spec section 2.3/4.1)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;
  let aiService: { parseNewsAnnouncement: jest.Mock };
  let uploadService: { uploadImageBase64: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    aiService = { parseNewsAnnouncement: jest.fn() };
    uploadService = { uploadImageBase64: jest.fn() };
    service = new NewsService(prisma, aiService as unknown as AiService, uploadService as unknown as UploadService);
  });

  it('creates a DRAFT NewsItem with a CONFIRMED INSTAGRAM_SCREENSHOT source — no dedup review needed for a lone screenshot', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({
      companyName: 'Illumicrate',
      type: 'MONTH_THEME',
      title: 'August 2026 theme reveal',
      summary: 'Illumicrate revealed the August theme.',
    });
    uploadService.uploadImageBase64.mockResolvedValue({ publicId: 'luxgrimoire/news-sources/abc', url: 'https://res.cloudinary.com/x/abc.jpg' });
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n1' });

    await service.ingestScreenshot('base64data', 'caption text');

    expect(aiService.parseNewsAnnouncement).toHaveBeenCalledWith({ imageBase64: 'base64data', text: 'caption text' });
    expect(prisma.newsItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyName: 'Illumicrate',
          title: 'August 2026 theme reveal',
          type: 'MONTH_THEME',
          sources: {
            create: {
              sourceType: 'INSTAGRAM_SCREENSHOT',
              rawContentRef: 'https://res.cloudinary.com/x/abc.jpg',
              mergeStatus: 'CONFIRMED',
            },
          },
        }),
      }),
    );
  });

  it('falls back to OTHER when the AI returns a type it does not recognise, rather than crashing on an invalid enum value', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Owlcrate', title: 'x', type: 'SOMETHING_WEIRD' });
    uploadService.uploadImageBase64.mockResolvedValue({ publicId: 'p', url: 'https://x/y.jpg' });
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n1' });

    await service.ingestScreenshot('base64data');

    expect(prisma.newsItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OTHER' }) }),
    );
  });

  it('rejects when the AI extracted nothing usable at all (garbage screenshot)', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({});
    uploadService.uploadImageBase64.mockResolvedValue({ publicId: 'p', url: 'https://x/y.jpg' });

    await expect(service.ingestScreenshot('base64data')).rejects.toThrow(BadRequestException);
    expect(prisma.newsItem.create).not.toHaveBeenCalled();
  });
});

describe('NewsService.ingestFromRssEntry — Phase 3 (spec 2.1)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;
  let aiService: { parseNewsAnnouncement: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    aiService = { parseNewsAnnouncement: jest.fn() };
    service = new NewsService(prisma, aiService as unknown as AiService, {} as UploadService);
  });

  it('skips (no-op) an entry whose link was already ingested — avoids re-drafting the same feed item every poll', async () => {
    (prisma.newsSourceRecord.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

    const result = await service.ingestFromRssEntry({
      link: 'https://example.com/already-seen',
      title: 'x',
      textContent: 'y',
    });

    expect(result).toBeNull();
    expect(aiService.parseNewsAnnouncement).not.toHaveBeenCalled();
    expect(prisma.newsItem.create).not.toHaveBeenCalled();
  });

  it('ingests a genuinely new entry, storing its link as externalRef and as the source-url fallback', async () => {
    (prisma.newsSourceRecord.findUnique as jest.Mock).mockResolvedValue(null);
    aiService.parseNewsAnnouncement.mockResolvedValue({
      companyName: 'Illumicrate',
      type: 'MONTH_THEME',
      title: 'August 2026 Theme Reveal',
      summary: 'Illumicrate revealed August.',
      // no originalSourceUrl from the AI this time — should fall back to the entry link
    });
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n1' });

    await service.ingestFromRssEntry({
      link: 'https://illumicrate.com/blogs/news/august-2026-theme',
      title: 'August 2026 Theme Reveal',
      textContent: "This month's theme is...",
    });

    expect(aiService.parseNewsAnnouncement).toHaveBeenCalledWith({
      text: "August 2026 Theme Reveal\n\nThis month's theme is...",
      sourceUrl: 'https://illumicrate.com/blogs/news/august-2026-theme',
    });
    expect(prisma.newsItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originalSourceUrl: 'https://illumicrate.com/blogs/news/august-2026-theme',
          sources: {
            create: {
              sourceType: 'RSS',
              rawContentRef: "This month's theme is...",
              externalRef: 'https://illumicrate.com/blogs/news/august-2026-theme',
              mergeStatus: 'CONFIRMED',
            },
          },
        }),
      }),
    );
  });
});
