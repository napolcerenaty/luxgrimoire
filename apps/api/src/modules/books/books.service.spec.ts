import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { BookSeriesService } from '../book-series/book-series.service';
import { EditionsService } from '../editions/editions.service';
import { BooksService } from './books.service';

describe('BooksService', () => {
  let service: BooksService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let typesense: { upsertDocument: jest.Mock; deleteDocument: jest.Mock };
  let bookSeries: { findOrCreate: jest.Mock };
  let editions: { resolveEditionSaleDates: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    typesense = { upsertDocument: jest.fn().mockResolvedValue(undefined), deleteDocument: jest.fn().mockResolvedValue(undefined) };
    bookSeries = { findOrCreate: jest.fn() };
    editions = { resolveEditionSaleDates: jest.fn().mockResolvedValue(new Map()) };
    service = new BooksService(
      prisma,
      cache as any,
      typesense as unknown as TypesenseService,
      bookSeries as unknown as BookSeriesService,
      editions as unknown as EditionsService,
    );
    (prisma.$transaction as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll — where construction', () => {
    const runWhere = async (query: Record<string, unknown>) => {
      (prisma.book.findMany as jest.Mock).mockReset().mockResolvedValue([]);
      (prisma.book.count as jest.Mock).mockResolvedValue(0);
      await service.findAll(query as any);
      return (prisma.book.findMany as jest.Mock).mock.calls[0][0].where;
    };

    it('defaults to approved-only, and drops the status filter for status=all', async () => {
      expect(await runWhere({})).toMatchObject({ status: 'approved' });
      expect(await runWhere({ status: 'all' })).not.toHaveProperty('status');
      expect(await runWhere({ status: 'pending' })).toMatchObject({ status: 'pending' });
    });

    it('maps language / authorId / genre / isOmnibus / search filters', async () => {
      expect(await runWhere({ language: 'fr' })).toMatchObject({ language: 'fr' });
      expect(await runWhere({ authorId: 'a1' })).toMatchObject({ authors: { some: { authorId: 'a1' } } });
      expect(await runWhere({ genre: 'fantasy' })).toMatchObject({ genres: { has: 'fantasy' } });
      expect(await runWhere({ isOmnibus: true })).toMatchObject({ isOmnibus: true });
      const s = await runWhere({ search: 'dune' });
      expect(s.OR).toEqual([
        { title: { contains: 'dune', mode: 'insensitive' } },
        { authors: { some: { author: { name: { contains: 'dune', mode: 'insensitive' } } } } },
      ]);
    });

    it('resolves seriesSlug to a seriesId', async () => {
      (prisma.bookSeries.findUnique as jest.Mock).mockResolvedValue({ id: 'ser-9' });
      expect(await runWhere({ seriesSlug: 'mistborn' })).toMatchObject({ seriesId: 'ser-9' });
    });

    it('resolves a partial seriesName to an id set (empty set when nothing matches)', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      expect(await runWhere({ seriesName: 'realm' })).toMatchObject({ seriesId: { in: ['s1', 's2'] } });

      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);
      expect(await runWhere({ seriesName: 'nomatch' })).toMatchObject({ seriesId: { in: [] } });
    });
  });

  describe('syncSeriesEntries (via create)', () => {
    beforeEach(() => {
      (prisma.book.create as jest.Mock).mockResolvedValue({ id: 'b1' });
      (prisma.book.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'b1' });
      (prisma.book.findUnique as jest.Mock).mockResolvedValue(null); // indexBook lookup — harmless
    });

    it('forces exactly one primary entry — keeps the first flagged, demotes the rest', async () => {
      bookSeries.findOrCreate
        .mockResolvedValueOnce({ id: 'ser-a', name: 'A' })
        .mockResolvedValueOnce({ id: 'ser-b', name: 'B' });

      await service.create({
        title: 'Omnibus',
        seriesEntries: [
          { seriesName: 'A', isPrimary: true },
          { seriesName: 'B', isPrimary: true },
        ],
      } as any);

      const createManyData = (prisma.bookSeriesEntry.createMany as jest.Mock).mock.calls[0][0].data;
      expect(createManyData.map((r: any) => r.isPrimary)).toEqual([true, false]);
      const bookUpdate = (prisma.book.update as jest.Mock).mock.calls[0][0];
      expect(bookUpdate.data).toMatchObject({ seriesId: 'ser-a', seriesName: 'A' });
    });

    it('promotes the first entry when none is flagged primary', async () => {
      bookSeries.findOrCreate.mockResolvedValueOnce({ id: 'ser-a', name: 'A' });

      await service.create({ title: 'X', seriesEntries: [{ seriesName: 'A' }] } as any);

      expect((prisma.bookSeriesEntry.createMany as jest.Mock).mock.calls[0][0].data[0].isPrimary).toBe(true);
    });
  });

  describe('delete', () => {
    const bookRow = { id: 'b1', slug: 'b', authors: [], componentOf: [] };

    it('refuses to delete a book that still has editions', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue(bookRow);
      (prisma.bookEdition.count as jest.Mock).mockResolvedValue(2);

      await expect(service.delete('b')).rejects.toThrow(ConflictException);
      expect(prisma.book.delete).not.toHaveBeenCalled();
    });

    it('clears non-cascading relations and de-indexes when there are no editions', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue(bookRow);
      (prisma.bookEdition.count as jest.Mock).mockResolvedValue(0);

      await service.delete('b');

      expect(prisma.subscriptionMonthBook.deleteMany).toHaveBeenCalledWith({ where: { bookId: 'b1' } });
      expect(prisma.userBookEntry.deleteMany).toHaveBeenCalledWith({ where: { bookId: 'b1' } });
      expect(typesense.deleteDocument).toHaveBeenCalledWith('books', 'b1');
      expect(prisma.book.delete).toHaveBeenCalledWith({ where: { slug: 'b' } });
    });
  });

  describe('components', () => {
    it('addComponent throws NotFoundException for an unknown book', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.addComponent('nope', { bookId: 'x' } as any)).rejects.toThrow(NotFoundException);
    });

    it('addComponent refuses to make a book a component of itself', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue({ id: 'b1' });
      await expect(service.addComponent('b', { bookId: 'b1' } as any)).rejects.toThrow(ConflictException);
    });

    it('addComponent creates the component and flags the omnibus', async () => {
      (prisma.book.findUnique as jest.Mock).mockResolvedValue({ id: 'b1' });
      (prisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'comp-1' }, {}]);

      const res = await service.addComponent('b', { bookId: 'b2', order: 1 } as any);

      expect(res).toEqual({ id: 'comp-1' });
      const bookUpdate = (prisma.book.update as jest.Mock).mock.calls[0][0];
      expect(bookUpdate.data).toMatchObject({ isOmnibus: true, componentCount: { increment: 1 } });
    });

    it('removeComponent resets isOmnibus once the last component is gone', async () => {
      (prisma.book.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'b1' }) // slug lookup
        .mockResolvedValueOnce({ componentCount: 0 }); // post-delete count
      (prisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'comp-1' }, {}]);

      await service.removeComponent('b', 'comp-1');

      const lastUpdate = (prisma.book.update as jest.Mock).mock.calls.at(-1)![0];
      expect(lastUpdate.data).toEqual({ isOmnibus: false, componentCount: 0 });
    });
  });
});
