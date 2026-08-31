import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { TypesenseService } from '../typesense/typesense.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { EditionsService } from '../editions/editions.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService.create', () => {
  let service: CompaniesService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    const editionsService = mockDeep<EditionsService>();
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;

    service = new CompaniesService(prisma, typesense, uploadService, mediaAssetsService, editionsService, cache);
    jest.spyOn(service as any, 'indexCompany').mockResolvedValue(undefined);
  });

  it('seeds an epoch-dated CompanyDataCheck row for the new company', async () => {
    (prisma.bookBoxCompany.create as jest.Mock).mockResolvedValue({ id: 'co-9', slug: 'new-co', name: 'New Co' });

    await service.create({ name: 'New Co' } as any);

    expect(prisma.companyDataCheck.create as jest.Mock).toHaveBeenCalledWith({
      data: { companyId: 'co-9', checkedAt: new Date(0) },
    });
  });
});
