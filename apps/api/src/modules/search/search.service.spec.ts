import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { EditionsService } from '../editions/editions.service';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: DeepMockProxy<PrismaService>;
  let typesense: { isAvailable: jest.Mock; multiSearch: jest.Mock };
  let editions: { resolveEditionSaleDates: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    typesense = { isAvailable: jest.fn().mockReturnValue(false), multiSearch: jest.fn() };
    editions = { resolveEditionSaleDates: jest.fn().mockResolvedValue(new Map()) };
    service = new SearchService(prisma, typesense as unknown as TypesenseService, editions as unknown as EditionsService);

    // default: every Postgres group resolves to an empty array
    for (const model of ['book', 'bookEdition', 'author', 'artist', 'subscription', 'bookBoxCompany', 'saleAnnouncement'] as const) {
      (prisma[model].findMany as jest.Mock).mockResolvedValue([]);
    }
  });

  afterEach(() => jest.clearAllMocks());

  it('short-circuits a query shorter than 2 chars, echoing query + filter', async () => {
    const res = await service.search(' a ', 'books');
    expect(res).toMatchObject({ query: ' a ', filter: 'books', books: [], editions: [], sales: [] });
    expect(typesense.isAvailable).not.toHaveBeenCalled();
  });

  it('uses the Postgres path when Typesense is unavailable', async () => {
    await service.search('dune');
    expect(typesense.multiSearch).not.toHaveBeenCalled();
    expect(prisma.book.findMany).toHaveBeenCalled();
  });

  it('falls back to Postgres when the Typesense search throws', async () => {
    typesense.isAvailable.mockReturnValue(true);
    typesense.multiSearch.mockRejectedValue(new Error('ts down'));

    await service.search('dune');

    expect(prisma.book.findMany).toHaveBeenCalled(); // Postgres fallback ran
  });

  it('falls back to Postgres when Typesense returns zero hits across all collections', async () => {
    typesense.isAvailable.mockReturnValue(true);
    typesense.multiSearch.mockResolvedValue([{ hits: [] }, { hits: [] }, { hits: [] }, { hits: [] }, { hits: [] }, { hits: [] }, { hits: [] }]);

    await service.search('dune');

    expect(prisma.book.findMany).toHaveBeenCalled();
  });

  it('normalises " and " to " & " before sending the query to Typesense', async () => {
    typesense.isAvailable.mockReturnValue(true);
    typesense.multiSearch.mockResolvedValue([{ hits: [{ document: { id: 'b1' } }] }]);
    (prisma.book.findMany as jest.Mock).mockResolvedValue([{ id: 'b1', title: 'Barnes & Noble Special', authors: [], editions: [] }]);

    await service.search('Barnes and Noble', 'books');

    const sent = typesense.multiSearch.mock.calls[0][0];
    expect(sent).toHaveLength(1); // filter=books -> only the books collection is queried
    expect(sent[0]).toMatchObject({ collection: 'books', q: 'Barnes & Noble' });
  });

  it('labels subscription results by interval (Monthly / Bimonthly / Quarterly / Every N months)', async () => {
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', name: 'A', intervalMonths: 1 },
      { id: 's2', name: 'B', intervalMonths: 2 },
      { id: 's3', name: 'C', intervalMonths: 3 },
      { id: 's4', name: 'D', intervalMonths: 5 },
    ]);

    const res = await service.search('box', 'subscriptions');

    expect(res.subscriptions.map((s: any) => s.type)).toEqual(['Monthly', 'Bimonthly', 'Quarterly', 'Every 5 months']);
    expect(res.subscriptions[0]).not.toHaveProperty('intervalMonths');
  });

  it('orders sale results by their earliest tier date (desc), nulls last, capped at 6', async () => {
    const mk = (id: string, iso: string | null) => ({
      id,
      title: id,
      tiers: iso ? [{ name: 'T', date: new Date(iso), regionId: null }] : [],
      regions: [],
    });
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([
      mk('old', '2026-01-01T00:00:00Z'),
      mk('none', null),
      mk('new', '2026-09-01T00:00:00Z'),
      mk('mid', '2026-05-01T00:00:00Z'),
    ]);

    const res = await service.search('sale', 'sales');

    expect(res.sales.map((s: any) => s.id)).toEqual(['new', 'mid', 'old', 'none']);
    expect(res.sales[0]).not.toHaveProperty('_earliestTierDate');
  });
});
