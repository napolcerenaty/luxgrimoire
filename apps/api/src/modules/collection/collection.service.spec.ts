import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrowdStatsService } from '../crowd-stats/crowd-stats.service';
import { StatsService } from '../stats/stats.service';
import { CollectionService } from './collection.service';

const USER = 'user-1';
const OTHER = 'user-2';

describe('CollectionService', () => {
  let service: CollectionService;
  let prisma: DeepMockProxy<PrismaService>;
  let crowdStats: { rebuildEditionSaleStats: jest.Mock };
  let stats: { markStatsStale: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    crowdStats = { rebuildEditionSaleStats: jest.fn().mockResolvedValue(undefined) };
    stats = { markStatsStale: jest.fn() };
    service = new CollectionService(
      prisma,
      crowdStats as unknown as CrowdStatsService,
      stats as unknown as StatsService,
    );

    // fire-and-forget side effects — keep them resolving so nothing throws synchronously
    (prisma.ownershipStatusHistory.create as jest.Mock).mockResolvedValue({ id: 'h1' });
    (prisma.ownershipStatusHistory.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.readingHistory.create as jest.Mock).mockResolvedValue({ id: 'rh1' });
    (prisma.readingHistory.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.readingHistory.update as jest.Mock).mockResolvedValue({ id: 'rh1' });
    (prisma.$transaction as jest.Mock).mockResolvedValue([]);
    (prisma.userPurchaseGroup.delete as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => jest.clearAllMocks());

  // ── getCollection: where / orderBy construction ────────────────────────────

  describe('getCollection', () => {
    const runWhere = async (...args: unknown[]) => {
      (prisma.userBookEntry.findMany as jest.Mock).mockReset().mockResolvedValue([]);
      (prisma.userBookEntry.count as jest.Mock).mockResolvedValue(0);
      await (service.getCollection as any)(USER, ...args);
      return (prisma.userBookEntry.findMany as jest.Mock).mock.calls[0][0];
    };

    it('scopes to the user with no extra filters by default', async () => {
      const call = await runWhere();
      expect(call.where).toEqual({ userId: USER });
    });

    it('applies isWishlist / ownershipStatus / readingStatus / subscription filters', async () => {
      const call = await runWhere(1, 20, true, false, 'OWNED', undefined, undefined, undefined, undefined, 'READ', 'sub-9');
      expect(call.where).toMatchObject({
        userId: USER,
        isWishlist: true,
        ownershipStatus: 'OWNED',
        readingStatus: 'READ',
        subscriptionEntry: { subscription: { id: 'sub-9' } },
      });
    });

    it('merges search and companyName into a single edition filter', async () => {
      const call = await runWhere(1, 20, undefined, false, undefined, 'dune', 'FairyLoot');
      expect(call.where.edition).toEqual({
        book: { title: { contains: 'dune', mode: 'insensitive' } },
        bookBoxCompany: { name: 'FairyLoot' },
      });
    });

    it('maps a tag filter to an entryTags relation scoped to the user', async () => {
      const call = await runWhere(1, 20, undefined, false, undefined, undefined, undefined, 'favourites');
      expect(call.where.entryTags).toEqual({ some: { tag: 'favourites', userId: USER } });
    });

    it('treats signatureType UNSIGNED as null and any other value as lowercase', async () => {
      const unsigned = await runWhere(1, 20, undefined, false, undefined, undefined, undefined, undefined, 'UNSIGNED');
      expect(unsigned.where.signatureType).toBeNull();

      const signed = await runWhere(1, 20, undefined, false, undefined, undefined, undefined, undefined, 'SIGNED');
      expect(signed.where.signatureType).toBe('signed');
    });

    it('sorts SOLD/GIFTED_AWAY views by saleDate with an id tiebreaker', async () => {
      const call = await runWhere(1, 20, undefined, false, 'SOLD');
      expect(call.orderBy).toEqual([{ saleDate: 'desc' }, { id: 'desc' }]);
    });

    it('honours sortBy=DATE_ASC and otherwise defaults to newest-first, always with an id tiebreaker', async () => {
      const asc = await runWhere(1, 20, undefined, false, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'DATE_ASC');
      expect(asc.orderBy[0]).toEqual({ purchaseGroup: { purchasedAt: 'asc' } });
      expect(asc.orderBy.at(-1)).toEqual({ id: 'asc' });

      const def = await runWhere();
      expect(def.orderBy[0]).toEqual({ purchaseGroup: { purchasedAt: 'desc' } });
      expect(def.orderBy.at(-1)).toEqual({ id: 'desc' });
    });
  });

  // ── addToCollection ───────────────────────────────────────────────────────

  describe('addToCollection', () => {
    it('throws NotFoundException when the edition does not exist', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.addToCollection(USER, { bookEditionId: 'ed-x' } as any)).rejects.toThrow(NotFoundException);
    });

    it('creates an OWNED / original-print entry by default and marks stats stale', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue({ id: 'ed-1', bookId: 'book-1' });
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'e1', ownershipStatus: 'OWNED' });

      await service.addToCollection(USER, { bookEditionId: 'ed-1', condition: 'NEW' } as any);

      const data = (prisma.userBookEntry.create as jest.Mock).mock.calls[0][0].data;
      expect(data).toMatchObject({
        userId: USER,
        bookId: 'book-1',
        editionId: 'ed-1',
        isWishlist: false,
        ownershipStatus: 'OWNED',
        readingStatus: 'UNREAD',
        isOriginalPrint: true,
      });
      expect(prisma.ownershipStatusHistory.create).toHaveBeenCalled();
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER);
    });

    it('marks the entry as a non-original print when added via a reprint sale announcement', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue({ id: 'ed-1', bookId: 'book-1' });
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'e1', ownershipStatus: 'OWNED' });

      await service.addToCollection(USER, { bookEditionId: 'ed-1', saleAnnouncementEditionId: 'sae-1' } as any);

      const data = (prisma.userBookEntry.create as jest.Mock).mock.calls[0][0].data;
      expect(data.isOriginalPrint).toBe(false);
      expect(data.saleAnnouncementEditionId).toBe('sae-1');
    });

    it('flags isFirstEdition when the user had no prior non-wishlist entries', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue({ id: 'ed-1', bookId: 'book-1' });
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'e1', ownershipStatus: 'OWNED', isWishlist: false });
      (prisma.userBookEntry.count as jest.Mock).mockResolvedValue(0);

      const result = await service.addToCollection(USER, { bookEditionId: 'ed-1' } as any);
      expect(result.isFirstEdition).toBe(true);
    });

    it('does not flag isFirstEdition when the user already owns editions', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue({ id: 'ed-1', bookId: 'book-1' });
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'e1', ownershipStatus: 'OWNED', isWishlist: false });
      (prisma.userBookEntry.count as jest.Mock).mockResolvedValue(3);

      const result = await service.addToCollection(USER, { bookEditionId: 'ed-1' } as any);
      expect(result.isFirstEdition).toBe(false);
    });
  });

  // ── addToWishlist ─────────────────────────────────────────────────────────

  describe('addToWishlist', () => {
    it('throws NotFoundException for an unknown edition', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.addToWishlist(USER, 'ed-x')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the edition is already owned (not a wishlist entry)', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue({ id: 'ed-1', bookId: 'b1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue({ id: 'e1', isWishlist: false });
      await expect(service.addToWishlist(USER, 'ed-1')).rejects.toThrow(ConflictException);
    });

    it('is idempotent when the edition is already on the wishlist', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue({ id: 'ed-1', bookId: 'b1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue({ id: 'e1', isWishlist: true });

      const res = await service.addToWishlist(USER, 'ed-1');

      expect(res).toEqual({ id: 'e1', isWishlist: true });
      expect(prisma.userBookEntry.create).not.toHaveBeenCalled();
    });

    it('creates a wishlist entry when none exists', async () => {
      (prisma.bookEdition.findUnique as jest.Mock).mockResolvedValue({ id: 'ed-1', bookId: 'b1' });
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userBookEntry.create as jest.Mock).mockResolvedValue({ id: 'e2', ownershipStatus: 'OWNED' });

      await service.addToWishlist(USER, 'ed-1');

      expect((prisma.userBookEntry.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
        userId: USER,
        editionId: 'ed-1',
        isWishlist: true,
      });
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER);
    });
  });

  // ── setEntryTags ──────────────────────────────────────────────────────────

  describe('setEntryTags', () => {
    it('trims, de-duplicates and drops empty tags', async () => {
      const out = await service.setEntryTags(USER, 'e1', ['  fav ', 'fav', 'tbr', '', '   ']);

      expect(out).toEqual(['fav', 'tbr']);
      const createManyArg = (prisma.userBookEntryTag.createMany as jest.Mock).mock.calls[0][0];
      expect(createManyArg.data).toEqual([
        { userId: USER, entryId: 'e1', tag: 'fav' },
        { userId: USER, entryId: 'e1', tag: 'tbr' },
      ]);
      expect(createManyArg.skipDuplicates).toBe(true);
    });

    it('only clears rows when the tag list is empty (no createMany)', async () => {
      const out = await service.setEntryTags(USER, 'e1', ['', '  ']);

      expect(out).toEqual([]);
      expect(prisma.userBookEntryTag.deleteMany).toHaveBeenCalledWith({ where: { userId: USER, entryId: 'e1' } });
      expect(prisma.userBookEntryTag.createMany).not.toHaveBeenCalled();
    });
  });

  // ── updateEntry ───────────────────────────────────────────────────────────

  describe('updateEntry', () => {
    it('throws NotFoundException when the entry is missing', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.updateEntry(USER, 'e1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the entry belongs to another user', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'e1', userId: OTHER });
      await expect(service.updateEntry(USER, 'e1', { condition: 'NEW' } as any)).rejects.toThrow(ForbiddenException);
    });

    it('writes only the DTO fields that are present', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1', userId: USER, ownershipStatus: 'OWNED', readingStatus: 'UNREAD', editionId: 'ed-1', salePrice: null, saleCurrency: null, saleDate: null,
      });
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({ id: 'e1' });

      await service.updateEntry(USER, 'e1', { condition: 'GOOD' } as any);

      expect((prisma.userBookEntry.update as jest.Mock).mock.calls[0][0].data).toEqual({ condition: 'GOOD' });
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER);
    });

    it('records ownership history only when the status actually changes', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1', userId: USER, ownershipStatus: 'OWNED', readingStatus: 'UNREAD', editionId: 'ed-1', saleDate: null,
      });
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({ id: 'e1' });

      await service.updateEntry(USER, 'e1', { ownershipStatus: 'OWNED' } as any);
      expect(prisma.ownershipStatusHistory.create).not.toHaveBeenCalled();

      await service.updateEntry(USER, 'e1', { ownershipStatus: 'SOLD', saleDate: '2026-01-05' } as any);
      expect(prisma.ownershipStatusHistory.create).toHaveBeenCalledTimes(1);
      const histArg = (prisma.ownershipStatusHistory.create as jest.Mock).mock.calls[0][0];
      expect(histArg.data).toMatchObject({ userBookEntryId: 'e1', status: 'SOLD' });
    });

    it('opens a reading session on a transition to READING', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1', userId: USER, ownershipStatus: 'OWNED', readingStatus: 'UNREAD', editionId: 'ed-1', saleDate: null,
      });
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({ id: 'e1' });

      await service.updateEntry(USER, 'e1', { readingStatus: 'READING' } as any);
      await new Promise((r) => setImmediate(r)); // let the fire-and-forget promise settle

      expect(prisma.readingHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userBookEntryId: 'e1', isDnf: false }) }),
      );
    });

    it('rebuilds edition sale crowd-stats when sale fields change', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1', userId: USER, ownershipStatus: 'SOLD', readingStatus: 'READ', editionId: 'ed-1',
        salePrice: null, saleCurrency: null, saleDate: null,
      });
      (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({ id: 'e1' });

      await service.updateEntry(USER, 'e1', { salePrice: 40, saleCurrency: 'EUR' } as any);
      await new Promise((r) => setImmediate(r));

      expect(crowdStats.rebuildEditionSaleStats).toHaveBeenCalledWith('ed-1');
    });
  });

  // ── updateByEdition ───────────────────────────────────────────────────────

  describe('updateByEdition', () => {
    it('throws NotFoundException when the user owns no matching entries', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([]);
      await expect(service.updateByEdition(USER, 'ed-1', 'READ_TO_KEEP')).rejects.toThrow(NotFoundException);
    });

    it('updates every non-sold entry and records history for the ones that changed', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', ownershipStatus: 'OWNED' },
        { id: 'e2', ownershipStatus: 'GIFTED_AWAY' },
      ]);

      const res = await service.updateByEdition(USER, 'ed-1', 'GIFTED_AWAY');

      expect(res).toEqual({ updatedCount: 2 });
      expect(prisma.$transaction).toHaveBeenCalled();
      // e1 changed OWNED→GIFTED_AWAY, e2 was already GIFTED_AWAY
      expect(prisma.ownershipStatusHistory.create).toHaveBeenCalledTimes(1);
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER);
    });
  });

  // ── removeFromCollection ──────────────────────────────────────────────────

  describe('removeFromCollection', () => {
    it('throws NotFoundException / ForbiddenException like the other mutations', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.removeFromCollection(USER, 'e1')).rejects.toThrow(NotFoundException);

      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'e1', userId: OTHER });
      await expect(service.removeFromCollection(USER, 'e1')).rejects.toThrow(ForbiddenException);
    });

    it('deletes the entry and cleans up the purchase group once it is empty', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1', userId: USER, editionId: 'ed-1', isWishlist: false, purchaseGroupId: 'pg-1', saleEntries: [],
      });
      (prisma.userBookEntry.count as jest.Mock).mockResolvedValue(0);

      await service.removeFromCollection(USER, 'e1');

      expect(prisma.userBookEntry.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
      expect(prisma.userPurchaseGroup.delete).toHaveBeenCalledWith({ where: { id: 'pg-1' } });
      expect(stats.markStatsStale).toHaveBeenCalledWith(USER);
    });

    it('keeps the purchase group when other entries still reference it', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'e1', userId: USER, editionId: 'ed-1', isWishlist: false, purchaseGroupId: 'pg-1', saleEntries: [],
      });
      (prisma.userBookEntry.count as jest.Mock).mockResolvedValue(2);

      await service.removeFromCollection(USER, 'e1');

      expect(prisma.userPurchaseGroup.delete).not.toHaveBeenCalled();
    });
  });

  // ── small read helpers ────────────────────────────────────────────────────

  describe('getEntryStatus', () => {
    it('reports none / wishlist / collection', async () => {
      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce(null);
      expect(await service.getEntryStatus(USER, 'ed-1')).toEqual({ status: 'none' });

      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'e1', isWishlist: true });
      expect(await service.getEntryStatus(USER, 'ed-1')).toEqual({ status: 'wishlist', entryId: 'e1' });

      (prisma.userBookEntry.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'e1', isWishlist: false });
      expect(await service.getEntryStatus(USER, 'ed-1')).toEqual({ status: 'collection', entryId: 'e1' });
    });
  });

  describe('getEntryForTracking', () => {
    it('returns null when the entry belongs to a different user', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'e1', userId: OTHER, editionId: 'ed-1' });
      expect(await service.getEntryForTracking('e1', USER)).toBeNull();
    });

    it('returns the entry for its owner', async () => {
      (prisma.userBookEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'e1', userId: USER, editionId: 'ed-1' });
      expect(await service.getEntryForTracking('e1', USER)).toEqual({ id: 'e1', userId: USER, editionId: 'ed-1' });
    });
  });
});
