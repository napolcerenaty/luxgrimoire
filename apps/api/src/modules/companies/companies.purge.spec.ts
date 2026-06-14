import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { TypesenseService } from '../typesense/typesense.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { CompaniesService } from './companies.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCompany(overrides: Record<string, unknown> = {}) {
  return { id: 'company-1', slug: 'test-co', name: 'Test Co', ...overrides };
}

function makeEdition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edition-1',
    additionalImages: ['lux/ed-img-1', 'lux/ed-img-2'],
    editionImages: [{ assetId: 'asset-1' }, { assetId: 'asset-2' }],
    ...overrides,
  };
}

function makeMonth(overrides: Record<string, unknown> = {}) {
  return {
    id: 'month-1',
    coverImage: 'lux/month-cover',
    coverImageAssetId: 'asset-month-1',
    ...overrides,
  };
}

function makeAnnouncement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ann-1',
    imageUrl: 'lux/ann-img',
    imageAssetId: 'asset-ann-1',
    extraImagesJson: null,
    announcementMediaAssets: [{ assetId: 'asset-ann-1' }],
    extraImages: [{ assetId: 'asset-ann-1' }],
    ...overrides,
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('CompaniesService.purgeOfficialImages', () => {
  let service: CompaniesService;
  let prisma: DeepMockProxy<PrismaService>;
  let uploadService: DeepMockProxy<UploadService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    uploadService = mockDeep<UploadService>();
    const typesense = mockDeep<TypesenseService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn(), reset: jest.fn() } as any;

    service = new CompaniesService(prisma, typesense, uploadService, mediaAssetsService, cache);

    // default: Cloudinary delete succeeds
    (uploadService.deleteImage as jest.Mock).mockResolvedValue(undefined);
    // default: prisma update succeeds
    (prisma.bookEdition.update as jest.Mock).mockResolvedValue({});
    (prisma.subscriptionMonth.update as jest.Mock).mockResolvedValue({});
    (prisma.saleAnnouncement.update as jest.Mock).mockResolvedValue({});
    // join table deleteMany via prisma.$transaction proxy — accessed as (prisma as any)
    (prisma as any).bookEditionMediaAsset = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
    (prisma as any).saleAnnouncementMediaAsset = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
    (prisma as any).mediaAsset = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
  });

  // ── Company not found ──────────────────────────────────────────────────────

  it('throws NotFoundException when company slug does not exist', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.purgeOfficialImages('unknown-co')).rejects.toThrow(NotFoundException);
  });

  // ── Happy path: all image types ───────────────────────────────────────────

  it('deletes edition images from Cloudinary, clears DB fields, and removes MediaAsset records', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(makeCompany());
    const edition = makeEdition();
    // First call returns editions, second returns [] to stop pagination
    (prisma.bookEdition.findMany as jest.Mock)
      .mockResolvedValueOnce([edition])
      .mockResolvedValueOnce([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.purgeOfficialImages('test-co');

    expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/ed-img-1');
    expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/ed-img-2');
    expect((prisma as any).bookEditionMediaAsset.deleteMany).toHaveBeenCalledWith({ where: { editionId: 'edition-1' } });
    expect((prisma as any).mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['asset-1', 'asset-2'] } } });
    expect(prisma.bookEdition.update).toHaveBeenCalledWith({
      where: { id: 'edition-1' },
      data: { additionalImages: [], photoCredit: null },
    });
    expect(result.deletedEditionImages).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('deletes subscription month cover from Cloudinary and removes MediaAsset record', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(makeCompany());
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([{ id: 'sub-1' }]);
    const month = makeMonth();
    (prisma.subscriptionMonth.findMany as jest.Mock)
      .mockResolvedValueOnce([month])
      .mockResolvedValueOnce([]);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.purgeOfficialImages('test-co');

    expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/month-cover');
    expect((prisma as any).mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: 'asset-month-1' } });
    expect(prisma.subscriptionMonth.update).toHaveBeenCalledWith({
      where: { id: 'month-1' },
      data: { coverImage: null, coverImageAssetId: null },
    });
    expect(result.deletedMonthImages).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('deletes sale announcement image from Cloudinary and removes MediaAsset records', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(makeCompany());
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
    const ann = makeAnnouncement();
    (prisma.saleAnnouncement.findMany as jest.Mock)
      .mockResolvedValueOnce([ann])
      .mockResolvedValueOnce([]);

    const result = await service.purgeOfficialImages('test-co');

    expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/ann-img');
    expect((prisma as any).saleAnnouncementMediaAsset.deleteMany).toHaveBeenCalledWith({ where: { announcementId: 'ann-1' } });
    expect((prisma as any).mediaAsset.deleteMany).toHaveBeenCalled();
    expect(prisma.saleAnnouncement.update).toHaveBeenCalledWith({
      where: { id: 'ann-1' },
      data: { imageUrl: null, imageAssetId: null, photoCredit: null, extraImagesJson: Prisma.JsonNull },
    });
    expect(result.deletedAnnouncementImages).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  // ── extraImagesJson stored as string[] ────────────────────────────────────

  it('deletes all extraImagesJson publicIds (string[]) from Cloudinary', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(makeCompany());
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
    const ann = makeAnnouncement({
      extraImagesJson: ['lux/extra-1', 'lux/extra-2'],
      extraImages: [{ assetId: 'asset-extra-1' }, { assetId: 'asset-extra-2' }],
    });
    (prisma.saleAnnouncement.findMany as jest.Mock)
      .mockResolvedValueOnce([ann])
      .mockResolvedValueOnce([]);

    const result = await service.purgeOfficialImages('test-co');

    expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/ann-img');
    expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/extra-1');
    expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/extra-2');
    expect(result.deletedAnnouncementImages).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  // ── No images → zero counts ───────────────────────────────────────────────

  it('returns zero counts when company has no images', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(makeCompany());
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.purgeOfficialImages('test-co');

    expect(uploadService.deleteImage).not.toHaveBeenCalled();
    expect(result.deletedEditionImages).toBe(0);
    expect(result.deletedMonthImages).toBe(0);
    expect(result.deletedAnnouncementImages).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  // ── Error resilience ──────────────────────────────────────────────────────

  it('collects errors for failed items but continues processing the rest', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(makeCompany());
    const edition1 = makeEdition({ id: 'edition-1' });
    const edition2 = makeEdition({
      id: 'edition-2',
      additionalImages: ['lux/ed2-img'],
      editionImages: [{ assetId: 'asset-3' }],
    });
    (prisma.bookEdition.findMany as jest.Mock)
      .mockResolvedValueOnce([edition1, edition2])
      .mockResolvedValueOnce([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([]);

    // First edition update throws
    (prisma.bookEdition.update as jest.Mock)
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValue({});

    const result = await service.purgeOfficialImages('test-co');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('edition-1');
    expect(result.errors[0]).toContain('DB error');
    // Second edition still processed
    expect(prisma.bookEdition.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'edition-2' } }),
    );
    expect(result.deletedEditionImages).toBe(1); // only edition-2 counted
  });

  // ── Month with no coverImageAssetId ──────────────────────────────────────

  it('skips MediaAsset delete for month with null coverImageAssetId', async () => {
    (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(makeCompany());
    (prisma.bookEdition.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([{ id: 'sub-1' }]);
    (prisma.subscriptionMonth.findMany as jest.Mock)
      .mockResolvedValueOnce([makeMonth({ coverImageAssetId: null })])
      .mockResolvedValueOnce([]);
    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([]);

    await service.purgeOfficialImages('test-co');

    expect(uploadService.deleteImage).toHaveBeenCalledWith('lux/month-cover');
    // mediaAsset.deleteMany should NOT be called with an id of null
    const deleteManyCalls: any[] = (prisma as any).mediaAsset.deleteMany.mock.calls;
    const nullIdCall = deleteManyCalls.find((call) => call[0]?.where?.id === null);
    expect(nullIdCall).toBeUndefined();
  });
});
