import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { TypesenseService } from '../typesense/typesense.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService.getEditions — server-side search', () => {
  let service: CompaniesService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock; reset: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const uploadService = mockDeep<UploadService>();
    const typesense = mockDeep<TypesenseService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn(), reset: jest.fn() };

    service = new CompaniesService(prisma, typesense, uploadService, mediaAssetsService, cache as any);

    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue({ id: 'company-1' });
    (prisma.bookEdition.count as jest.Mock).mockResolvedValue(0);
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('passes a title/author OR clause down to Prisma when search is provided', async () => {
    await service.getEditions('test-co', { search: 'Fourth Wing' }, { skip: 0, take: 20 });

    const countWhere = (prisma.bookEdition.count as jest.Mock).mock.calls[0][0].where;
    expect(countWhere.OR).toEqual([
      { book: { title: { contains: 'Fourth Wing', mode: 'insensitive' } } },
      { book: { authors: { some: { author: { name: { contains: 'Fourth Wing', mode: 'insensitive' } } } } } },
    ]);

    const findWhere = (prisma.bookEdition.findMany as jest.Mock).mock.calls[0][0].where;
    expect(findWhere.OR).toEqual(countWhere.OR);
  });

  it('does not add an OR clause when search is empty/absent', async () => {
    await service.getEditions('test-co', {}, { skip: 0, take: 20 });

    const countWhere = (prisma.bookEdition.count as jest.Mock).mock.calls[0][0].where;
    expect(countWhere.OR).toBeUndefined();
  });

  it('bypasses the count cache entirely when searching (never reads or writes it)', async () => {
    await service.getEditions('test-co', { search: 'Rebecca Yarros' }, { skip: 0, take: 20 });

    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(prisma.bookEdition.count).toHaveBeenCalledTimes(1);
  });

  it('still uses the count cache for the unfiltered (no-search) case', async () => {
    cache.get.mockResolvedValueOnce(42);

    const result = await service.getEditions('test-co', {}, { skip: 0, take: 20 });

    expect(cache.get).toHaveBeenCalledWith('companies:slug:test-co:editions:count');
    expect(prisma.bookEdition.count).not.toHaveBeenCalled();
    expect(result.total).toBe(42);
  });

  it('combines search with an existing subscriptionId filter (both applied together)', async () => {
    await service.getEditions(
      'test-co',
      { subscriptionId: 'sub-1', search: 'wing' },
      { skip: 0, take: 20 },
    );

    const countWhere = (prisma.bookEdition.count as jest.Mock).mock.calls[0][0].where;
    expect(countWhere.subscriptionId).toBe('sub-1');
    expect(countWhere.OR).toBeDefined();
  });
});
