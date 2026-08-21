import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { SeriesContinuationService } from '../series-continuation/series-continuation.service';
import { AnnouncementsService } from './announcements.service';

const SALE_ID = 'sale-1';
const EDITION_ID = 'edition-1';

describe('AnnouncementsService series-continuation hooks', () => {
  let service: AnnouncementsService;
  let prisma: DeepMockProxy<PrismaService>;
  let seriesContinuation: DeepMockProxy<SeriesContinuationService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    seriesContinuation = mockDeep<SeriesContinuationService>();
    seriesContinuation.notifyOnEditionAddedToSale.mockResolvedValue(undefined);
    const cache = { get: async () => undefined, set: async () => {} } as any;
    service = new AnnouncementsService(prisma, typesense, uploadService, mediaAssetsService, cache, undefined, seriesContinuation);

    jest.spyOn(service, 'findById').mockResolvedValue({} as any);
    jest.spyOn(service as any, 'indexSale').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'invalidateCalendarCache').mockResolvedValue(undefined);
  });

  describe('adminAddEdition', () => {
    beforeEach(() => {
      (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValue({ id: SALE_ID });
      (prisma.saleAnnouncementEdition.aggregate as jest.Mock).mockResolvedValue({ _max: { sortOrder: 0 } });
      (prisma.saleAnnouncementEdition.upsert as jest.Mock).mockResolvedValue({});
    });

    it('notifies series continuation for the added edition when the sale is active/upcoming', async () => {
      (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(1);

      await service.adminAddEdition(SALE_ID, EDITION_ID);
      await new Promise(process.nextTick);

      expect(seriesContinuation.notifyOnEditionAddedToSale).toHaveBeenCalledWith(EDITION_ID, SALE_ID);
    });

    it('does not notify when the announcement is past/archival (e.g. backfilled data)', async () => {
      (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(0);

      await service.adminAddEdition(SALE_ID, EDITION_ID);
      await new Promise(process.nextTick);

      expect(seriesContinuation.notifyOnEditionAddedToSale).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      (prisma.saleAnnouncement.findUnique as jest.Mock).mockResolvedValue({ id: SALE_ID, extraImagesJson: null, imageUrl: null });
      (prisma.saleAnnouncement.update as jest.Mock).mockResolvedValue({});
      (prisma.saleAnnouncementEdition.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.saleAnnouncementEdition.createMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.saleAnnouncementEdition.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('notifies series continuation only for newly-added editions, not ones already linked', async () => {
      (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([{ editionId: 'already-linked' }]);
      (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(1);

      await service.update(SALE_ID, { editionIds: ['already-linked', EDITION_ID] } as any);
      await new Promise(process.nextTick);

      expect(seriesContinuation.notifyOnEditionAddedToSale).toHaveBeenCalledTimes(1);
      expect(seriesContinuation.notifyOnEditionAddedToSale).toHaveBeenCalledWith(EDITION_ID, SALE_ID);
    });

    it('does not notify at all when no new editions are added', async () => {
      (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([{ editionId: EDITION_ID }]);

      await service.update(SALE_ID, { editionIds: [EDITION_ID] } as any);
      await new Promise(process.nextTick);

      expect(seriesContinuation.notifyOnEditionAddedToSale).not.toHaveBeenCalled();
    });

    it('does not notify when the announcement is past/archival', async () => {
      (prisma.saleAnnouncementEdition.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(0);

      await service.update(SALE_ID, { editionIds: [EDITION_ID] } as any);
      await new Promise(process.nextTick);

      expect(seriesContinuation.notifyOnEditionAddedToSale).not.toHaveBeenCalled();
    });
  });
});
