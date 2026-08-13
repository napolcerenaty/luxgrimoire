import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { UserCostSnapshotCronService } from '../user-cost-snapshots/user-cost-snapshot.cron';
import { AnnouncementsService } from './announcements.service';

// Regression guard: `NOT: buildActiveSaleCondition(...)` — wrapping the whole nested
// AND/OR/relation-filter structure in Prisma's `NOT:` — was found to crash the query engine
// for some rows ("Response from the Engine was empty"), silently excluding them from both the
// active and NOT-active queries. One company's pastOnly list was missing 219 of 230 real
// announcements this way. buildPastSaleCondition must be written as direct positive terms
// instead, so this asserts the pastOnly `where` clause never contains a `NOT` key.
function containsNotKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsNotKey);
  return Object.entries(value as Record<string, unknown>).some(
    ([key, val]) => key === 'NOT' || containsNotKey(val),
  );
}

describe('AnnouncementsService.findAll — pastOnly filter', () => {
  let service: AnnouncementsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    const typesense = mockDeep<TypesenseService>();
    const uploadService = mockDeep<UploadService>();
    const mediaAssetsService = mockDeep<MediaAssetsService>();
    const userCostSnapshotService = mockDeep<UserCostSnapshotCronService>();
    service = new AnnouncementsService(prisma, typesense, uploadService, mediaAssetsService, userCostSnapshotService, undefined);

    (prisma.saleAnnouncement.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.saleAnnouncement.count as jest.Mock).mockResolvedValue(0);
  });

  it('never builds a `NOT:`-wrapped where clause for pastOnly', async () => {
    await service.findAll({ pastOnly: true, companyId: 'company-1' });

    const findManyWhere = (prisma.saleAnnouncement.findMany as jest.Mock).mock.calls[0][0].where;
    const countWhere = (prisma.saleAnnouncement.count as jest.Mock).mock.calls[0][0].where;

    expect(containsNotKey(findManyWhere)).toBe(false);
    expect(containsNotKey(countWhere)).toBe(false);
  });

  it('still builds a normal where clause for the upcoming filter (unaffected by this fix)', async () => {
    await service.findAll({ upcoming: true, companyId: 'company-1' });

    const findManyWhere = (prisma.saleAnnouncement.findMany as jest.Mock).mock.calls[0][0].where;
    expect(findManyWhere).toBeDefined();
  });
});
