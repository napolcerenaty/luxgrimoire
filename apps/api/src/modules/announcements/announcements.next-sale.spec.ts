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
    // Mirrors the real query: tiers pre-filtered to >= today and sorted ascending by date.
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sale-far',
        title: 'Far Sale',
        tiers: [{ id: 't-far-gs', name: 'General Sale', date: daysFromNow(30) }],
      },
      {
        id: 'sale-near',
        title: 'Near Sale',
        tiers: [
          { id: 't-near-fa', name: 'First Access', date: daysFromNow(3) },
          { id: 't-near-ea', name: 'Early Access', date: daysFromNow(5) },
          { id: 't-near-gs', name: 'General Sale', date: daysFromNow(10) },
        ],
      },
    ]);

    const result = await service.getNextSale('company-1', null);

    expect(result.personalized).toBe(false);
    expect(result.announcementId).toBe('sale-near');
    expect(result.tier).toBe('First Access');
  });

  it('uses the user\'s own tier interest instead of the aggregate when it is still upcoming', async () => {
    const generalSaleDate = daysFromNow(10);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sale-near',
        title: 'Near Sale',
        tiers: [
          { id: 't-near-fa', name: 'First Access', date: daysFromNow(3) },
          { id: 't-near-ea', name: 'Early Access', date: daysFromNow(5) },
          { id: 't-near-gs', name: 'General Sale', date: generalSaleDate },
        ],
      },
    ]);
    (prisma.userSaleInterest.findFirst as jest.Mock).mockResolvedValue({ tierId: 't-near-gs', announcementId: 'sale-near' });

    const result = await service.getNextSale('company-1', 'user-1');

    expect(result.personalized).toBe(true);
    expect(result.tier).toBe('General Sale');
    expect(result.date).toBe(generalSaleDate.toISOString());
  });

  it('falls back to the aggregate when the user\'s interest tier date has already passed', async () => {
    // The real query filters tiers to date >= today, so a past tier the user picked won't be
    // in ann.tiers at all — the service re-fetches it directly via saleTier.findUnique to
    // check its date, finds it's in the past, and falls through to the aggregate loop.
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sale-near',
        title: 'Near Sale',
        tiers: [
          { id: 't-near-ea', name: 'Early Access', date: daysFromNow(5) },
          { id: 't-near-gs', name: 'General Sale', date: daysFromNow(10) },
        ],
      },
    ]);
    (prisma.userSaleInterest.findFirst as jest.Mock).mockResolvedValue({ tierId: 't-near-fa-past', announcementId: 'sale-near' });
    (prisma.saleTier.findUnique as jest.Mock).mockResolvedValue({ id: 't-near-fa-past', name: 'First Access', date: daysFromNow(-2) });

    const result = await service.getNextSale('company-1', 'user-1');

    expect(result.personalized).toBe(false);
    expect(result.tier).toBe('Early Access');
  });
});
