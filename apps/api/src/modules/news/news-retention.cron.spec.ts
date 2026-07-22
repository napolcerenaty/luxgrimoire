import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { NewsRetentionCronService } from './news-retention.cron';
import { NewsItemStatus } from '@prisma/client';

describe('NewsRetentionCronService.cleanupRawContent (spec section 7)', () => {
  let service: NewsRetentionCronService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.newsSourceRecord.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    service = new NewsRetentionCronService(prisma);
  });

  it('clears rawContentRef for REJECTED items on a shorter (14-day) window', async () => {
    await service.cleanupRawContent();

    expect(prisma.newsSourceRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          newsItem: { status: NewsItemStatus.REJECTED },
        }),
        data: { rawContentRef: null },
      }),
    );
  });

  it('clears rawContentRef for everything else (non-rejected or unlinked) on a longer (90-day) window', async () => {
    await service.cleanupRawContent();

    expect(prisma.newsSourceRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ newsItem: null }, { newsItem: { status: { not: NewsItemStatus.REJECTED } } }],
        }),
        data: { rawContentRef: null },
      }),
    );
  });

  it('the rejected-window cutoff is more recent (shorter retention) than the default cutoff', async () => {
    await service.cleanupRawContent();

    const calls = (prisma.newsSourceRecord.updateMany as jest.Mock).mock.calls;
    const rejectedCutoff: Date = calls[0][0].where.ingestedAt.lte;
    const defaultCutoff: Date = calls[1][0].where.ingestedAt.lte;
    expect(rejectedCutoff.getTime()).toBeGreaterThan(defaultCutoff.getTime());
  });

  it('reports the combined count cleared across both windows', async () => {
    (prisma.newsSourceRecord.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 5 });

    const result = await service.cleanupRawContent();

    expect(result).toEqual({ cleared: 8 });
  });
});
