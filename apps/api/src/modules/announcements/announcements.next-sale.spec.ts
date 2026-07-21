import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { AnnouncementsService } from './announcements.service';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

describe('AnnouncementsService.getNextSale', () => {
  let service: AnnouncementsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    service = new AnnouncementsService(prisma, typesense, uploadService, mediaAssetsService, undefined);
  });

  it('returns an empty result when the company has no live/upcoming sales', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getNextSale('company-1', null);

    expect(result).toEqual({ date: null, tier: null, announcementId: null, title: null, personalized: false });
  });

  it('picks the soonest upcoming tier across all of the company\'s live/upcoming sales (all-tiers mode)', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sale-far',
        title: 'Far Sale',
        firstAccessDate: null,
        earlyAccessDate: null,
        generalSaleDate: daysFromNow(30),
      },
      {
        id: 'sale-near',
        title: 'Near Sale',
        firstAccessDate: daysFromNow(3),
        earlyAccessDate: daysFromNow(5),
        generalSaleDate: daysFromNow(10),
      },
    ]);

    const result = await service.getNextSale('company-1', null);

    expect(result.personalized).toBe(false);
    expect(result.announcementId).toBe('sale-near');
    expect(result.tier).toBe('FA');
  });

  it('uses the user\'s own tier interest instead of the aggregate when it is still upcoming', async () => {
    const generalSaleDate = daysFromNow(10);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sale-near',
        title: 'Near Sale',
        firstAccessDate: daysFromNow(3),
        earlyAccessDate: daysFromNow(5),
        generalSaleDate,
      },
    ]);
    (prisma.userSaleInterest.findFirst as jest.Mock).mockResolvedValue({ tier: 'GS', announcementId: 'sale-near' });

    const result = await service.getNextSale('company-1', 'user-1');

    expect(result.personalized).toBe(true);
    expect(result.tier).toBe('GS');
    expect(result.date).toBe(generalSaleDate.toISOString());
  });

  it('falls back to the aggregate when the user\'s interest tier date has already passed', async () => {
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sale-near',
        title: 'Near Sale',
        firstAccessDate: daysFromNow(-2),
        earlyAccessDate: daysFromNow(5),
        generalSaleDate: daysFromNow(10),
      },
    ]);
    // User picked FA, which (per resolveTierDate) resolves straight to firstAccessDate — already past.
    (prisma.userSaleInterest.findFirst as jest.Mock).mockResolvedValue({ tier: 'FA', announcementId: 'sale-near' });

    const result = await service.getNextSale('company-1', 'user-1');

    expect(result.personalized).toBe(false);
    expect(result.tier).toBe('EA');
  });
});
