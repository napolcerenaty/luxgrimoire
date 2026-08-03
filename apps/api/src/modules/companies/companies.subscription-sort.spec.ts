import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { TypesenseService } from '../typesense/typesense.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { EditionsService } from '../editions/editions.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService.findBySlug — subscription grouping', () => {
  let service: CompaniesService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock; reset: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const uploadService = mockDeep<UploadService>();
    const typesense = mockDeep<TypesenseService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    const editionsService = mockDeep<EditionsService>();
    cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn(), reset: jest.fn() };

    service = new CompaniesService(prisma, typesense, uploadService, mediaAssetsService, editionsService, cache as any);
  });

  it('sorts subscriptions active → upcoming → discontinued regardless of insertion order', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-1',
      slug: 'test-co',
      subscriptions: [
        { id: 'discontinued-1', isDiscontinued: true, isUpcoming: false },
        { id: 'active-1', isDiscontinued: false, isUpcoming: false },
        { id: 'upcoming-1', isDiscontinued: false, isUpcoming: true },
        { id: 'active-2', isDiscontinued: false, isUpcoming: false },
      ],
    });

    const result: any = await service.findBySlug('test-co');

    expect(result.subscriptions.map((s: any) => s.id)).toEqual([
      'active-1',
      'active-2',
      'upcoming-1',
      'discontinued-1',
    ]);
  });
});
