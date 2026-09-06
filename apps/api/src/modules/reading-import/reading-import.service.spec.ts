import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { ReadingImportService } from './reading-import.service';

const SG_HEADER = 'Title,Authors,Read Status,Dates Read,Last Date Read';
const GR_HEADER = 'Book Id,Title,Author,Additional Authors,Exclusive Shelf,Date Read';

function entryRow(over: Partial<{ id: string; readingStatus: string; title: string; authors: string[]; slug: string | null }>) {
  return {
    id: over.id ?? 'e1',
    readingStatus: over.readingStatus ?? 'UNREAD',
    book: {
      title: over.title ?? 'The Hobbit',
      authors: (over.authors ?? ['J.R.R. Tolkien']).map((name) => ({ author: { name } })),
    },
    edition: over.slug === null ? null : { slug: over.slug ?? 'hobbit-1' },
  };
}

describe('ReadingImportService', () => {
  let service: ReadingImportService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new ReadingImportService(prisma);
    (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userBookEntry.update as jest.Mock).mockResolvedValue({});
    (prisma.readingHistory.create as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => jest.clearAllMocks());

  describe('format detection', () => {
    it('rejects a CSV whose header matches neither exporter', async () => {
      await expect(service.preview('u1', 'foo,bar\n1,2')).rejects.toThrow(/Unrecognized CSV format/);
    });

    it('detects a StoryGraph export from its headers', async () => {
      const csv = `${SG_HEADER}\n"The Hobbit","J.R.R. Tolkien",read,,2024/02/01`;
      const res = await service.preview('u1', csv);
      expect(res.format).toBe('storygraph');
    });

    it('detects a Goodreads export from its headers', async () => {
      const csv = `${GR_HEADER}\n1,"The Hobbit","J.R.R. Tolkien",,read,2024/02/01`;
      const res = await service.preview('u1', csv);
      expect(res.format).toBe('goodreads');
    });
  });

  describe('CSV parsing', () => {
    it('handles quoted commas, escaped double-quotes and CRLF line endings', async () => {
      const csv =
        `${SG_HEADER}\r\n` +
        `"Strange, Book","Author, Jr.",read,,2024/01/01\r\n` +
        `"She said ""hi""","X",read,,2024/01/02\r\n` +
        `\r\n`; // trailing blank line ignored

      const res = await service.preview('u1', csv);

      expect(res.unmatched.map((u) => u.title)).toEqual(['Strange, Book', 'She said "hi"']);
      expect(res.total).toBe(2);
    });
  });

  describe('StoryGraph rows', () => {
    const previewOne = async (line: string) => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([
        entryRow({ id: 'e-h', title: 'The Hobbit', slug: 'hobbit-1' }),
      ]);
      const res = await service.preview('u1', `${SG_HEADER}\n${line}`);
      return res;
    };

    it('maps Read Status to READ / READING / DNF and excludes UNREAD from the totals', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([]);
      const csv =
        `${SG_HEADER}\n` +
        `"A","x",read,,2024/01/01\n` +
        `"B","x",currently-reading,,\n` +
        `"C","x",did-not-finish,,2024/01/01\n` +
        `"D","x",to-read,,`;
      const res = await service.preview('u1', csv);
      expect(res.total).toBe(3); // D (to-read → UNREAD) not counted
    });

    it('parses a single date range into one period with start and finish', async () => {
      const res = await previewOne('"The Hobbit","J.R.R. Tolkien",read,2024/01/01-2024/02/10,');
      expect(res.matched[0].readPeriods).toEqual([
        { startedAt: '2024-01-01T00:00:00.000Z', finishedAt: '2024-02-10T00:00:00.000Z', isDnf: false },
      ]);
    });

    it('parses multiple pipe-separated ranges into multiple periods (re-reads), DNF only on the most recent', async () => {
      const res = await previewOne(
        '"The Hobbit","J.R.R. Tolkien",did-not-finish,"2024/01/01-2024/02/01|2020/01/01-2020/02/01",',
      );
      expect(res.matched[0].readPeriods.map((p) => p.isDnf)).toEqual([true, false]);
      expect(res.matched[0].readPeriods).toHaveLength(2);
    });

    it('treats a bare single date as a finish date only', async () => {
      const res = await previewOne('"The Hobbit","J.R.R. Tolkien",read,2024/05/05,');
      expect(res.matched[0].readPeriods).toEqual([
        { startedAt: null, finishedAt: '2024-05-05T00:00:00.000Z', isDnf: false },
      ]);
    });

    it('falls back to Last Date Read when Dates Read is empty', async () => {
      const res = await previewOne('"The Hobbit","J.R.R. Tolkien",read,,2024/07/07');
      expect(res.matched[0].readPeriods).toEqual([
        { startedAt: null, finishedAt: '2024-07-07T00:00:00.000Z', isDnf: false },
      ]);
    });

    it('gives a READING book with no dates one open period', async () => {
      const res = await previewOne('"The Hobbit","J.R.R. Tolkien",currently-reading,,');
      expect(res.matched[0].readPeriods).toEqual([
        { startedAt: null, finishedAt: null, isDnf: false },
      ]);
    });

    it('skips a row with no title', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([]);
      const res = await service.preview('u1', `${SG_HEADER}\n"","x",read,,2024/01/01`);
      expect(res.total).toBe(0);
    });
  });

  describe('Goodreads rows', () => {
    it('combines Author + Additional Authors and reads Date Read as the finish date', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([
        entryRow({ id: 'e-h', title: 'The Hobbit', authors: ['J.R.R. Tolkien', 'Christopher Tolkien'] }),
      ]);
      const csv =
        `${GR_HEADER}\n` +
        `1,"The Hobbit","J.R.R. Tolkien","Christopher Tolkien, Someone Else",read,2024/02/01`;
      const res = await service.preview('u1', csv);
      expect(res.matched[0].readPeriods).toEqual([
        { startedAt: null, finishedAt: '2024-02-01T00:00:00.000Z', isDnf: false },
      ]);
    });

    it('ignores to-read / UNREAD shelves', async () => {
      const csv = `${GR_HEADER}\n1,"Dune","Frank Herbert",,to-read,`;
      const res = await service.preview('u1', csv);
      expect(res.total).toBe(0);
    });
  });

  describe('matching', () => {
    it('normalises titles (case / punctuation / whitespace) before comparing', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([
        entryRow({ id: 'e-h', title: 'The Hobbit', slug: 'hobbit-1' }),
      ]);
      const res = await service.preview('u1', `${SG_HEADER}\n"  the   HOBBIT!!! ","J.R.R. Tolkien",read,,2024/01/01`);
      expect(res.matched).toHaveLength(1);
      expect(res.unmatched).toHaveLength(0);
    });

    it('auto-matches when the CSV row carries no author', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([entryRow({ id: 'e-h', title: 'The Hobbit' })]);
      const res = await service.preview('u1', `${SG_HEADER}\n"The Hobbit","",read,,2024/01/01`);
      expect(res.matched).toHaveLength(1);
    });

    it('does not match when the author differs entirely', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([
        entryRow({ id: 'e-h', title: 'The Hobbit', authors: ['J.R.R. Tolkien'] }),
      ]);
      const res = await service.preview('u1', `${SG_HEADER}\n"The Hobbit","Brandon Sanderson",read,,2024/01/01`);
      expect(res.matched).toHaveLength(0);
      expect(res.unmatched[0].title).toBe('The Hobbit');
    });

    it('returns every owned entry id for a title and drops entries with no edition slug', async () => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([
        entryRow({ id: 'e-h1', title: 'The Hobbit', slug: 'hobbit-a' }),
        entryRow({ id: 'e-h2', title: 'The Hobbit', slug: null }),
      ]);
      const res = await service.preview('u1', `${SG_HEADER}\n"The Hobbit","Tolkien",read,,2024/01/01`);
      expect(res.matched[0].entryIds).toEqual(['e-h1', 'e-h2']);
      expect(res.matched[0].editionSlugs).toEqual(['hobbit-a']);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      (prisma.userBookEntry.findMany as jest.Mock).mockResolvedValue([
        entryRow({ id: 'e-h1', title: 'The Hobbit', slug: 'hobbit-a' }),
        entryRow({ id: 'e-h2', title: 'The Hobbit', slug: 'hobbit-b' }),
      ]);
    });

    it('updates every matched entry and writes one ReadingHistory row per read-through', async () => {
      const csv = `${SG_HEADER}\n"The Hobbit","Tolkien",read,"2024/01/01-2024/02/01|2020/01/01-2020/02/01",`;

      const res = await service.execute('u1', csv);

      expect(res).toEqual({ imported: 2, skipped: 0 });
      expect(prisma.userBookEntry.update).toHaveBeenCalledWith({
        where: { id: 'e-h1' },
        data: { readingStatus: 'READ' },
      });
      // 2 entries × 2 periods each
      expect(prisma.readingHistory.create).toHaveBeenCalledTimes(4);
    });

    it('counts an entry whose update throws as skipped, not imported', async () => {
      (prisma.userBookEntry.update as jest.Mock)
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue({});

      const res = await service.execute('u1', `${SG_HEADER}\n"The Hobbit","Tolkien",read,,2024/01/01`);

      expect(res).toEqual({ imported: 1, skipped: 1 });
    });
  });
});
