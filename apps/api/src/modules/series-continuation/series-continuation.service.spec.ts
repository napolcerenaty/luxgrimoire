import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SeriesContinuationService } from './series-continuation.service';

const EDITION_ID = 'edition-1';
const BOOK_ID = 'book-2';
const SERIES_ID = 'series-1';
const COMPANY_ID = 'company-1';
const SALE_ID = 'sale-1';
const USER_ID = 'user-1';

describe('SeriesContinuationService', () => {
  let service: SeriesContinuationService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new SeriesContinuationService(prisma);
    (prisma.$transaction as unknown as jest.Mock).mockImplementation((fn: (tx: any) => Promise<void>) => fn(prisma));
  });

  const stubEdition = (overrides: Partial<{ bookId: string; bookBoxCompanyId: string | null; seriesId: string | null; variantLabel: string | null }> = {}) => {
    const { bookId = BOOK_ID, bookBoxCompanyId = COMPANY_ID, seriesId = SERIES_ID, variantLabel = null } = overrides;
    (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue({
      bookId,
      bookBoxCompanyId,
      variantLabel,
      book: { seriesId },
    });
  };

  it('does nothing if the edition has no series', async () => {
    stubEdition({ seriesId: null });
    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);
    expect(prisma.userBookEntry.findMany).not.toHaveBeenCalled();
  });

  it('does nothing if the edition has no company', async () => {
    stubEdition({ bookBoxCompanyId: null });
    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);
    expect(prisma.userBookEntry.findMany).not.toHaveBeenCalled();
  });

  it('matches on same series + same company + same (null) variantLabel, excluding the same book, wishlist, sold, and gifted-away entries', async () => {
    stubEdition();
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([{ userId: USER_ID }]);
    (prisma.pendingSeriesContinuationNotification.findUnique as jest.Mock).mockResolvedValue(null);

    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);

    expect(prisma.userBookEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isWishlist: false,
          ownershipStatus: { notIn: ['SOLD', 'GIFTED_AWAY'] },
          bookId: { not: BOOK_ID },
          book: { seriesId: SERIES_ID },
          edition: { bookBoxCompanyId: COMPANY_ID, variantLabel: null },
        }),
        distinct: ['userId'],
      }),
    );
    expect(prisma.pendingSeriesContinuationNotification.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, saleAnnouncementId: SALE_ID, editionIds: [EDITION_ID], scheduledFor: expect.any(Date) },
    });
  });

  it('requires the exact same variantLabel when the new edition has one — never mixes variant with no-variant', async () => {
    stubEdition({ variantLabel: 'Black Edition' });
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([]);

    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);

    expect(prisma.userBookEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          edition: { bookBoxCompanyId: COMPANY_ID, variantLabel: 'Black Edition' },
        }),
      }),
    );
    // A user who only owns a plain (no-variant) edition of the series+company would be
    // excluded by this filter — verified by the query shape above, not a separate case, since
    // matching itself is delegated to the (mocked) database's equality semantics.
  });

  it('sets scheduledFor roughly 5 minutes out on a new pending row', async () => {
    stubEdition();
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([{ userId: USER_ID }]);
    (prisma.pendingSeriesContinuationNotification.findUnique as jest.Mock).mockResolvedValue(null);

    const before = Date.now();
    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);
    const call = (prisma.pendingSeriesContinuationNotification.create as jest.Mock).mock.calls[0][0];
    const scheduledFor: Date = call.data.scheduledFor;

    expect(scheduledFor.getTime()).toBeGreaterThanOrEqual(before + 4 * 60_000);
    expect(scheduledFor.getTime()).toBeLessThanOrEqual(before + 6 * 60_000);
  });

  it('merges into an existing pending row instead of creating a duplicate, without resetting scheduledFor', async () => {
    stubEdition();
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([{ userId: USER_ID }]);
    const originalScheduledFor = new Date(Date.now() + 60_000);
    (prisma.pendingSeriesContinuationNotification.findUnique as jest.Mock).mockResolvedValue({
      id: 'pending-1',
      editionIds: ['other-edition'],
      scheduledFor: originalScheduledFor,
    });

    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);

    expect(prisma.pendingSeriesContinuationNotification.create).not.toHaveBeenCalled();
    expect(prisma.pendingSeriesContinuationNotification.update).toHaveBeenCalledWith({
      where: { id: 'pending-1' },
      data: { editionIds: { push: EDITION_ID } },
    });
  });

  it('does not duplicate the editionId if it is already in the pending row (idempotent re-trigger)', async () => {
    stubEdition();
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([{ userId: USER_ID }]);
    (prisma.pendingSeriesContinuationNotification.findUnique as jest.Mock).mockResolvedValue({
      id: 'pending-1',
      editionIds: [EDITION_ID],
      scheduledFor: new Date(),
    });

    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);

    expect(prisma.pendingSeriesContinuationNotification.update).not.toHaveBeenCalled();
    expect(prisma.pendingSeriesContinuationNotification.create).not.toHaveBeenCalled();
  });

  it('isolates per-user failures — one bad enqueue does not stop the others', async () => {
    stubEdition();
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([{ userId: 'user-bad' }, { userId: 'user-good' }]);
    (prisma.pendingSeriesContinuationNotification.findUnique as jest.Mock)
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce(null);

    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);

    expect(prisma.pendingSeriesContinuationNotification.create).toHaveBeenCalledWith({
      data: { userId: 'user-good', saleAnnouncementId: SALE_ID, editionIds: [EDITION_ID], scheduledFor: expect.any(Date) },
    });
  });

  it('does nothing when there are no matching users', async () => {
    stubEdition();
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([]);

    await service.notifyOnEditionAddedToSale(EDITION_ID, SALE_ID);

    expect(prisma.pendingSeriesContinuationNotification.create).not.toHaveBeenCalled();
  });
});
