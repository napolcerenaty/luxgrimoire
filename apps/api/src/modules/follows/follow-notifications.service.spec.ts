/**
 * Unit tests for FollowNotificationsService — the debounced queue that batches "new edition
 * matches a follow" events into PendingEditionNotification, one row per (userId, editionId),
 * so a user who follows e.g. both the book and one of its artists gets ONE combined
 * notification instead of one per matched follow.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { FollowNotificationsService, DEBOUNCE_MS } from './follow-notifications.service';

const EDITION_ID = 'edition-1';
const BOOK_ID = 'book-1';
const ARTIST_ID = 'artist-1';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const DEBOUNCED_AT = new Date(NOW.getTime() + DEBOUNCE_MS);

describe('FollowNotificationsService', () => {
  let service: FollowNotificationsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    service = new FollowNotificationsService(prisma);
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── notifyOnEditionCreated ──────────────────────────────────────────────

  describe('notifyOnEditionCreated', () => {
    it('does nothing when the book no longer exists', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue(null);

      await service.notifyOnEditionCreated(EDITION_ID, BOOK_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('enqueues a book-follow reason for each book follower', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue({
        title: 'The Hollows',
        followers: [{ userId: 'user-1' }, { userId: 'user-2' }],
        authors: [],
      });
      (prisma.pendingEditionNotification.findUnique as jest.Mock).mockResolvedValue(null);

      await service.notifyOnEditionCreated(EDITION_ID, BOOK_ID);

      expect(prisma.pendingEditionNotification.create).toHaveBeenCalledTimes(2);
      expect(prisma.pendingEditionNotification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          editionId: EDITION_ID,
          reasons: [{ type: 'book', id: BOOK_ID, name: 'The Hollows' }],
          scheduledFor: DEBOUNCED_AT,
        },
      });
    });

    it('enqueues an author-follow reason for each author follower', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue({
        title: 'This Poison Heart',
        followers: [],
        authors: [
          { author: { id: 'author-1', name: 'Ilona Andrews', followers: [{ userId: 'user-1' }] } },
        ],
      });
      (prisma.pendingEditionNotification.findUnique as jest.Mock).mockResolvedValue(null);

      await service.notifyOnEditionCreated(EDITION_ID, BOOK_ID);

      expect(prisma.pendingEditionNotification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          editionId: EDITION_ID,
          reasons: [{ type: 'author', id: 'author-1', name: 'Ilona Andrews' }],
          scheduledFor: DEBOUNCED_AT,
        },
      });
    });

    it('merges book + author reasons into ONE row for a user who follows both', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue({
        title: 'This Poison Heart',
        followers: [{ userId: 'user-1' }],
        authors: [
          { author: { id: 'author-1', name: 'Ilona Andrews', followers: [{ userId: 'user-1' }] } },
        ],
      });
      (prisma.pendingEditionNotification.findUnique as jest.Mock).mockResolvedValue(null);

      await service.notifyOnEditionCreated(EDITION_ID, BOOK_ID);

      // ONE row for user-1, not two
      expect(prisma.pendingEditionNotification.create).toHaveBeenCalledTimes(1);
      const call = (prisma.pendingEditionNotification.create as jest.Mock).mock.calls[0][0];
      expect(call.data.userId).toBe('user-1');
      expect(call.data.reasons).toEqual(
        expect.arrayContaining([
          { type: 'book', id: BOOK_ID, name: 'This Poison Heart' },
          { type: 'author', id: 'author-1', name: 'Ilona Andrews' },
        ]),
      );
      expect(call.data.reasons).toHaveLength(2);
    });

    it('does nothing when the book has no followers and no followed authors', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue({
        title: 'Untracked Book',
        followers: [],
        authors: [{ author: { id: 'author-1', name: 'Nobody Follows Me', followers: [] } }],
      });

      await service.notifyOnEditionCreated(EDITION_ID, BOOK_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── notifyOnArtistAdded ─────────────────────────────────────────────────

  describe('notifyOnArtistAdded', () => {
    it('does nothing when the artist no longer exists', async () => {
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue(null);

      await service.notifyOnArtistAdded(EDITION_ID, ARTIST_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing when the artist has no followers', async () => {
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({ name: 'Some Artist', followers: [] });

      await service.notifyOnArtistAdded(EDITION_ID, ARTIST_ID);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('enqueues an artist-follow reason for each follower', async () => {
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        name: 'Maggie',
        followers: [{ userId: 'user-1' }, { userId: 'user-2' }],
      });
      (prisma.pendingEditionNotification.findUnique as jest.Mock).mockResolvedValue(null);

      await service.notifyOnArtistAdded(EDITION_ID, ARTIST_ID);

      expect(prisma.pendingEditionNotification.create).toHaveBeenCalledTimes(2);
      expect(prisma.pendingEditionNotification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          editionId: EDITION_ID,
          reasons: [{ type: 'artist', id: ARTIST_ID, name: 'Maggie' }],
          scheduledFor: DEBOUNCED_AT,
        },
      });
    });
  });

  // ─── enqueue (debounce merge behavior) ───────────────────────────────────

  describe('debounce merge behavior', () => {
    it('sets scheduledFor to now + the debounce window on first insert', async () => {
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        name: 'Maggie',
        followers: [{ userId: 'user-1' }],
      });
      (prisma.pendingEditionNotification.findUnique as jest.Mock).mockResolvedValue(null);

      await service.notifyOnArtistAdded(EDITION_ID, ARTIST_ID);

      expect(prisma.pendingEditionNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ scheduledFor: DEBOUNCED_AT }) }),
      );
    });

    it('merges a new reason into an existing pending row WITHOUT resetting scheduledFor', async () => {
      const existingScheduledFor = new Date('2026-01-01T00:03:00.000Z'); // arbitrary — value shouldn't matter, it must stay untouched
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        name: 'Maggie',
        followers: [{ userId: 'user-1' }],
      });
      (prisma.pendingEditionNotification.findUnique as jest.Mock).mockResolvedValue({
        userId: 'user-1',
        editionId: EDITION_ID,
        reasons: [{ type: 'book', id: BOOK_ID, name: 'This Poison Heart' }],
        scheduledFor: existingScheduledFor,
      });

      await service.notifyOnArtistAdded(EDITION_ID, ARTIST_ID);

      expect(prisma.pendingEditionNotification.create).not.toHaveBeenCalled();
      expect(prisma.pendingEditionNotification.update).toHaveBeenCalledWith({
        where: { userId_editionId: { userId: 'user-1', editionId: EDITION_ID } },
        data: {
          reasons: [
            { type: 'book', id: BOOK_ID, name: 'This Poison Heart' },
            { type: 'artist', id: ARTIST_ID, name: 'Maggie' },
          ],
        },
      });
      // scheduledFor must not appear in the update payload at all — it's immutable after insert
      const updateCall = (prisma.pendingEditionNotification.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.scheduledFor).toBeUndefined();
    });

    it('does not duplicate a reason that already matches by type+id', async () => {
      (prisma.artist.findUnique as jest.Mock).mockResolvedValue({
        name: 'Maggie',
        followers: [{ userId: 'user-1' }],
      });
      (prisma.pendingEditionNotification.findUnique as jest.Mock).mockResolvedValue({
        userId: 'user-1',
        editionId: EDITION_ID,
        reasons: [{ type: 'artist', id: ARTIST_ID, name: 'Maggie' }],
        scheduledFor: new Date('2026-01-01T00:03:00.000Z'),
      });

      await service.notifyOnArtistAdded(EDITION_ID, ARTIST_ID);

      expect(prisma.pendingEditionNotification.update).toHaveBeenCalledWith({
        where: { userId_editionId: { userId: 'user-1', editionId: EDITION_ID } },
        data: { reasons: [{ type: 'artist', id: ARTIST_ID, name: 'Maggie' }] },
      });
    });

    it('keeps processing remaining users when one enqueue fails', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue({
        title: 'This Poison Heart',
        followers: [{ userId: 'user-1' }, { userId: 'user-2' }],
        authors: [],
      });
      (prisma.pendingEditionNotification.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock)
        .mockRejectedValueOnce(new Error('db hiccup'))
        .mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

      await service.notifyOnEditionCreated(EDITION_ID, BOOK_ID);

      // The failing user's enqueue is swallowed (logged), the other still lands.
      expect(prisma.pendingEditionNotification.create).toHaveBeenCalledTimes(1);
    });
  });
});
