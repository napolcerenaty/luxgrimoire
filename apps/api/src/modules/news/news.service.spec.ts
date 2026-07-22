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
  let aiService: { parseNewsAnnouncement: jest.Mock; checkForDuplicate: jest.Mock };
  let uploadService: { uploadImageBase64: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    aiService = { parseNewsAnnouncement: jest.fn(), checkForDuplicate: jest.fn() };
    uploadService = { uploadImageBase64: jest.fn() };
    // No dedup candidates by default (Phase 4) — individual tests override this if they need to exercise it.
    (prisma.newsItem.findMany as jest.Mock).mockResolvedValue([]);
    service = new NewsService(prisma, aiService as unknown as AiService, uploadService as unknown as UploadService);
  });

  it('creates a DRAFT NewsItem with a CONFIRMED INSTAGRAM_SCREENSHOT source — no dedup review needed for a lone screenshot', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({
      companyName: 'Illumicrate',
      type: 'TEASER',
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
          type: 'TEASER',
          sources: {
            create: {
              sourceType: 'INSTAGRAM_SCREENSHOT',
              rawContentRef: 'https://res.cloudinary.com/x/abc.jpg',
              externalRef: undefined,
              companyName: 'Illumicrate',
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
  let aiService: { parseNewsAnnouncement: jest.Mock; checkForDuplicate: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    aiService = { parseNewsAnnouncement: jest.fn(), checkForDuplicate: jest.fn() };
    (prisma.newsItem.findMany as jest.Mock).mockResolvedValue([]);
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
      type: 'CONTINUATION',
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
              companyName: 'Illumicrate',
              mergeStatus: 'CONFIRMED',
            },
          },
        }),
      }),
    );
  });
});

describe('NewsService — dedup (Phase 4, spec section 5)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;
  let aiService: { parseNewsAnnouncement: jest.Mock; checkForDuplicate: jest.Mock };
  let uploadService: { uploadImageBase64: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    aiService = { parseNewsAnnouncement: jest.fn(), checkForDuplicate: jest.fn() };
    uploadService = { uploadImageBase64: jest.fn() };
    service = new NewsService(prisma, aiService as unknown as AiService, uploadService as unknown as UploadService);
  });

  it('skips the LLM call entirely when the cheap company+48h filter finds no candidates', async () => {
    (prisma.newsItem.findMany as jest.Mock).mockResolvedValue([]);
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate', title: 'New thing' });
    uploadService.uploadImageBase64.mockResolvedValue({ publicId: 'p', url: 'https://x/y.jpg' });
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n1' });

    await service.ingestScreenshot('base64data');

    expect(aiService.checkForDuplicate).not.toHaveBeenCalled();
    expect(prisma.newsItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ possibleDuplicateOfId: null }) }),
    );
  });

  it('flags possibleDuplicateOfId on the NEW item when the LLM confirms a match — never auto-attaches (spec: no source merges without admin review)', async () => {
    (prisma.newsItem.findMany as jest.Mock).mockResolvedValue([
      { id: 'existing-1', title: 'August theme reveal', summary: 'x' },
    ]);
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate', title: 'August theme reveal (again)' });
    aiService.checkForDuplicate.mockResolvedValue({ duplicateOfId: 'existing-1' });
    uploadService.uploadImageBase64.mockResolvedValue({ publicId: 'p', url: 'https://x/y.jpg' });
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n2' });

    await service.ingestScreenshot('base64data');

    expect(prisma.newsItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ possibleDuplicateOfId: 'existing-1' }) }),
    );
  });

  it('confirmDuplicate() moves the source onto the candidate, deletes the duplicate, and bumps lastUpdatedAt only if the candidate is already PUBLISHED', async () => {
    (prisma.newsItem.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'dup-1', possibleDuplicateOfId: 'orig-1' }) // getOne(id)
      .mockResolvedValueOnce({ id: 'orig-1', status: NewsItemStatus.PUBLISHED }) // getOne(candidateId)
      .mockResolvedValueOnce({ id: 'orig-1', status: NewsItemStatus.PUBLISHED }); // final getOne/refetch after update
    (prisma.newsSourceRecord.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.newsItem.delete as jest.Mock).mockResolvedValue({ id: 'dup-1' });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'orig-1', lastUpdatedAt: new Date() });

    await service.confirmDuplicate('dup-1');

    expect(prisma.newsSourceRecord.updateMany).toHaveBeenCalledWith({ where: { newsItemId: 'dup-1' }, data: { newsItemId: 'orig-1' } });
    expect(prisma.newsItem.delete).toHaveBeenCalledWith({ where: { id: 'dup-1' } });
    expect(prisma.newsItem.update).toHaveBeenCalledWith({ where: { id: 'orig-1' }, data: { lastUpdatedAt: expect.any(Date) } });
  });

  it('confirmDuplicate() does NOT bump lastUpdatedAt when the candidate is still just a DRAFT', async () => {
    (prisma.newsItem.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'dup-1', possibleDuplicateOfId: 'orig-1' })
      .mockResolvedValueOnce({ id: 'orig-1', status: NewsItemStatus.DRAFT })
      .mockResolvedValueOnce({ id: 'orig-1', status: NewsItemStatus.DRAFT });
    (prisma.newsSourceRecord.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.newsItem.delete as jest.Mock).mockResolvedValue({ id: 'dup-1' });

    await service.confirmDuplicate('dup-1');

    expect(prisma.newsItem.update).not.toHaveBeenCalled();
  });

  it('confirmDuplicate() rejects an item that was never flagged as a duplicate', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', possibleDuplicateOfId: null });
    await expect(service.confirmDuplicate('n1')).rejects.toThrow(BadRequestException);
  });

  it('declineDuplicate() just clears the flag — the item is untouched otherwise, proceeds through normal moderation', async () => {
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n1', possibleDuplicateOfId: 'orig-1' });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'n1', possibleDuplicateOfId: null });

    await service.declineDuplicate('n1');

    expect(prisma.newsItem.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { possibleDuplicateOfId: null } });
  });
});

describe('NewsService.ingestEmail — Phase 5 (spec 2.2/2.2.1)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;
  let aiService: { parseNewsAnnouncement: jest.Mock; checkForDuplicate: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    aiService = { parseNewsAnnouncement: jest.fn(), checkForDuplicate: jest.fn() };
    (prisma.newsSourceRecord.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.newsItem.findMany as jest.Mock).mockResolvedValue([]);
    service = new NewsService(prisma, aiService as unknown as AiService, {} as UploadService);
    // Never actually hit the network for tracking pixels in tests.
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it('routes a confirmation email to the "needs action" queue, never through news classification', async () => {
    const html = '<p>Please confirm your subscription</p><a href="https://list.example.com/confirm?id=1">Confirm</a>';
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate' });

    await service.ingestEmail({ subject: 'Confirm your subscription', html, messageId: 'msg-1' });

    expect(prisma.newsSourceRecord.create).toHaveBeenCalledWith({
      data: {
        sourceType: 'EMAIL_ACTION_REQUIRED',
        rawContentRef: html,
        externalRef: 'msg-1',
        companyName: 'Illumicrate',
        actionUrl: 'https://list.example.com/confirm?id=1',
        mergeStatus: 'PENDING_REVIEW',
      },
    });
    expect(prisma.newsItem.create).not.toHaveBeenCalled();
  });

  it('classifies a genuine newsletter as a normal draft, tagged with sourceType EMAIL', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate', title: 'August theme' });
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n1' });

    await service.ingestEmail({ subject: 'August 2026 Theme Reveal', html: '<p>This month...</p>', messageId: 'msg-2' });

    expect(prisma.newsItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sources: expect.objectContaining({
            create: expect.objectContaining({ sourceType: 'EMAIL', externalRef: 'msg-2' }),
          }),
        }),
      }),
    );
  });

  it('fires a GET at any open-tracking pixel found in a genuine newsletter (simulate open, spec 2.2)', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate', title: 'August theme' });
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n1' });
    const html = '<p>News</p><img src="https://track.example.com/open/abc" width="1" height="1"/>';

    await service.ingestEmail({ subject: 'August theme', html });
    await new Promise((r) => setImmediate(r)); // let the fire-and-forget pixel GET settle

    expect(global.fetch).toHaveBeenCalledWith('https://track.example.com/open/abc', expect.anything());
  });

  it('skips (no-op) an email whose messageId was already ingested', async () => {
    (prisma.newsSourceRecord.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

    const result = await service.ingestEmail({ subject: 'x', html: 'y', messageId: 'already-seen' });

    expect(result).toBeNull();
    expect(aiService.parseNewsAnnouncement).not.toHaveBeenCalled();
  });
});

describe('NewsService — action-required queue (Phase 5, spec 2.2.1)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new NewsService(prisma, {} as AiService, {} as UploadService);
  });

  it('resolveActionRequired() deletes the record once the admin has handled it', async () => {
    (prisma.newsSourceRecord.findUnique as jest.Mock).mockResolvedValue({ id: 'a1', sourceType: 'EMAIL_ACTION_REQUIRED' });
    (prisma.newsSourceRecord.delete as jest.Mock).mockResolvedValue({ id: 'a1' });

    await service.resolveActionRequired('a1');

    expect(prisma.newsSourceRecord.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('resolveActionRequired() refuses to touch a normal (non-action-required) source record', async () => {
    (prisma.newsSourceRecord.findUnique as jest.Mock).mockResolvedValue({ id: 'a1', sourceType: 'EMAIL' });
    await expect(service.resolveActionRequired('a1')).rejects.toThrow(NotFoundException);
  });
});

describe('NewsService.findStaleNewsletterCompanies — Phase 5 (spec 2.2)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new NewsService(prisma, {} as AiService, {} as UploadService);
  });

  it('flags a newsletter-subscribed company with no recent EMAIL source as stale', async () => {
    (prisma.bookBoxCompany.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'Illumicrate' },
      { id: 'c2', name: 'OwlCrate' },
    ]);
    (prisma.newsSourceRecord.findMany as jest.Mock).mockResolvedValue([{ companyName: 'Illumicrate' }]);

    const stale = await service.findStaleNewsletterCompanies(60);

    expect(stale).toEqual([{ id: 'c2', name: 'OwlCrate' }]);
  });

  it('is case-insensitive when matching company names', async () => {
    (prisma.bookBoxCompany.findMany as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'Illumicrate' }]);
    (prisma.newsSourceRecord.findMany as jest.Mock).mockResolvedValue([{ companyName: 'ILLUMICRATE' }]);

    expect(await service.findStaleNewsletterCompanies(60)).toEqual([]);
  });
});

describe('NewsService — Phase 6 routing to existing models (spec 4.1)', () => {
  let service: NewsService;
  let prisma: DeepMockProxy<PrismaService>;
  let aiService: {
    parseNewsAnnouncement: jest.Mock;
    checkForDuplicate: jest.Mock;
    parseMonthThemeAnnouncement: jest.Mock;
    parseSaleAnnouncement: jest.Mock;
    parseSaleAnnouncementFromImage: jest.Mock;
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    aiService = {
      parseNewsAnnouncement: jest.fn(),
      checkForDuplicate: jest.fn(),
      parseMonthThemeAnnouncement: jest.fn(),
      parseSaleAnnouncement: jest.fn(),
      parseSaleAnnouncementFromImage: jest.fn(),
    };
    (prisma.newsItem.findMany as jest.Mock).mockResolvedValue([]); // no dedup candidates
    service = new NewsService(prisma, aiService as unknown as AiService, {} as UploadService);
  });

  it('MONTH_THEME: runs the second pass and pre-selects the subscription when the company only has one', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate', type: 'MONTH_THEME', title: 'August 2026 Theme Reveal' });
    aiService.parseMonthThemeAnnouncement.mockResolvedValue({ year: 2026, month: 8, theme: 'Villains', signatureType: 'signed' });
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n1' });
    (prisma.bookBoxCompany.findFirst as jest.Mock).mockResolvedValue({
      id: 'company-1',
      subscriptions: [{ id: 'sub-1', name: 'Illumicrate' }],
    });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'n1', linkedDraftPayload: {} });

    await service.ingestFromRssEntry({ link: 'https://illumicrate.com/x', title: 'August 2026 Theme Reveal', textContent: 'body' });

    expect(aiService.parseMonthThemeAnnouncement).toHaveBeenCalledWith({ text: 'August 2026 Theme Reveal\n\nbody' });
    expect(prisma.newsItem.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: {
        linkedDraftPayload: {
          subscriptionId: 'sub-1',
          subscriptionMatchConfidence: 1,
          year: 2026,
          month: 8,
          theme: 'Villains',
          signatureType: 'signed',
        },
      },
      include: { sources: true },
    });
  });

  it('MONTH_THEME: leaves subscriptionId null when the company has multiple ambiguous subscriptions (spec 4.1b)', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'The Locked Library', type: 'MONTH_THEME', title: 'This month\'s pick from The Locked Library is announced!' });
    aiService.parseMonthThemeAnnouncement.mockResolvedValue({ theme: 'Mystery pick' }); // no subscriptionName extracted — genuinely ambiguous
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n2' });
    (prisma.bookBoxCompany.findFirst as jest.Mock).mockResolvedValue({
      id: 'company-2',
      subscriptions: [
        { id: 'main', name: 'The Locked Library' },
        { id: 'villains', name: 'The Locked Library: Villains Edition' },
      ],
    });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'n2' });

    await service.ingestFromRssEntry({ link: 'https://x/y', title: 'title', textContent: 'body' });

    expect(prisma.newsItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ linkedDraftPayload: expect.objectContaining({ subscriptionId: null }) }),
      }),
    );
  });

  it('MONTH_THEME: falls back to the original NewsItem (no crash) if the second pass throws', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate', type: 'MONTH_THEME', title: 'x' });
    aiService.parseMonthThemeAnnouncement.mockRejectedValue(new Error('AI down'));
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n3', title: 'x' });
    (prisma.newsItem.findUnique as jest.Mock).mockResolvedValue({ id: 'n3', title: 'x' });

    const result = await service.ingestFromRssEntry({ link: 'https://x/y', title: 'x', textContent: 'body' });

    expect(result).toEqual({ id: 'n3', title: 'x' });
    expect(prisma.newsItem.update).not.toHaveBeenCalled();
  });

  it('SALE_ANNOUNCEMENT: reuses the existing parseSaleAnnouncement (text) and stashes the full result as linkedDraftPayload', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate', type: 'SALE_ANNOUNCEMENT', title: 'Victorious Exclusive Edition' });
    const salePayload = { title: 'Victorious Exclusive Edition', companyName: 'Illumicrate', regions: [{ name: 'UK/INT', isDefault: true }] };
    aiService.parseSaleAnnouncement.mockResolvedValue(salePayload);
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n4' });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'n4', linkedDraftPayload: salePayload });

    await service.ingestFromRssEntry({ link: 'https://illumicrate.com/x', title: 'Victorious Exclusive Edition', textContent: 'body' });

    expect(aiService.parseSaleAnnouncement).toHaveBeenCalledWith('Victorious Exclusive Edition\n\nbody');
    expect(prisma.newsItem.update).toHaveBeenCalledWith({
      where: { id: 'n4' },
      data: { linkedDraftPayload: salePayload },
      include: { sources: true },
    });
  });

  it('SALE_ANNOUNCEMENT: uses parseSaleAnnouncementFromImage for a screenshot source instead of the text variant', async () => {
    aiService.parseNewsAnnouncement.mockResolvedValue({ companyName: 'Illumicrate', type: 'SALE_ANNOUNCEMENT', title: 'x' });
    aiService.parseSaleAnnouncementFromImage.mockResolvedValue({ title: 'x' });
    const uploadService = { uploadImageBase64: jest.fn().mockResolvedValue({ publicId: 'p', url: 'https://x/y.jpg' }) };
    (prisma.newsItem.create as jest.Mock).mockResolvedValue({ id: 'n5' });
    (prisma.newsItem.update as jest.Mock).mockResolvedValue({ id: 'n5' });
    service = new NewsService(prisma, aiService as unknown as AiService, uploadService as unknown as UploadService);

    await service.ingestScreenshot('base64img');

    expect(aiService.parseSaleAnnouncementFromImage).toHaveBeenCalledWith('base64img');
    expect(aiService.parseSaleAnnouncement).not.toHaveBeenCalled();
  });
});
