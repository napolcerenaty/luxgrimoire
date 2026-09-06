import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ImagePermissionsService } from './image-permissions.service';

describe('ImagePermissionsService', () => {
  let service: ImagePermissionsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new ImagePermissionsService(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('emits one row per company, defaulting status to PENDING when no record exists, sorted case-insensitively', async () => {
      (prisma.bookBoxCompany.findMany as jest.Mock).mockResolvedValue([
        { id: 'c2', name: 'beta', slug: 'beta', hasOfficialImagePermission: false, imagePermission: null },
        {
          id: 'c1',
          name: 'Alpha',
          slug: 'alpha',
          hasOfficialImagePermission: true,
          imagePermission: {
            status: 'GRANTED',
            grantedByName: 'Jane',
            grantedAt: new Date('2026-01-02T00:00:00.000Z'),
            conditions: ['credit required'],
            emailContent: 'thread',
            updatedAt: new Date('2026-01-03T00:00:00.000Z'),
          },
        },
      ]);

      const rows = await service.findAll();

      expect(rows.map((r) => r.companyName)).toEqual(['Alpha', 'beta']);
      expect(rows[0]).toMatchObject({
        companyId: 'c1',
        status: 'GRANTED',
        grantedByName: 'Jane',
        conditions: ['credit required'],
      });
      expect(rows[1]).toMatchObject({
        companyId: 'c2',
        status: 'PENDING',
        grantedByName: null,
        grantedAt: null,
        conditions: [],
      });
    });
  });

  describe('upsertPermission', () => {
    it('throws NotFoundException for an unknown company', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.upsertPermission('c-x', { status: 'GRANTED' } as any)).rejects.toThrow(NotFoundException);
    });

    it('upserts the permission and syncs hasOfficialImagePermission=true when GRANTED', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue({ id: 'c1' });
      (prisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'perm-1' }, {}]);

      const res = await service.upsertPermission('c1', {
        status: 'GRANTED',
        grantedByName: 'Jane',
        grantedAt: '2026-02-01',
        conditions: ['credit'],
      } as any);

      expect(res).toEqual({ id: 'perm-1' }); // first tuple element
      const upsertArg = (prisma.companyImagePermission.upsert as jest.Mock).mock.calls[0][0];
      expect(upsertArg.where).toEqual({ companyId: 'c1' });
      expect(upsertArg.create.grantedAt).toEqual(new Date('2026-02-01'));
      const companyUpdateArg = (prisma.bookBoxCompany.update as jest.Mock).mock.calls[0][0];
      expect(companyUpdateArg).toEqual({ where: { id: 'c1' }, data: { hasOfficialImagePermission: true } });
    });

    it('sets hasOfficialImagePermission=false for any non-GRANTED status', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue({ id: 'c1' });
      (prisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'perm-1' }, {}]);

      await service.upsertPermission('c1', { status: 'DENIED' } as any);

      const companyUpdateArg = (prisma.bookBoxCompany.update as jest.Mock).mock.calls[0][0];
      expect(companyUpdateArg.data).toEqual({ hasOfficialImagePermission: false });
    });
  });

  describe('communications', () => {
    it('listCommunications queries by company, newest first', async () => {
      (prisma.companyPermissionCommunication.findMany as jest.Mock).mockResolvedValue([]);
      await service.listCommunications('c1');
      expect(prisma.companyPermissionCommunication.findMany).toHaveBeenCalledWith({
        where: { companyId: 'c1' },
        orderBy: { sentAt: 'desc' },
      });
    });

    it('createCommunication throws NotFoundException for an unknown company', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createCommunication('c-x', { sentAt: '2026-01-01', channel: 'EMAIL', subject: 'hi' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('createCommunication coerces sentAt to a Date and defaults responded to false', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue({ id: 'c1' });
      (prisma.companyPermissionCommunication.create as jest.Mock).mockResolvedValue({ id: 'log-1' });

      await service.createCommunication('c1', { sentAt: '2026-01-05', channel: 'EMAIL', subject: 'Follow-up' } as any);

      const data = (prisma.companyPermissionCommunication.create as jest.Mock).mock.calls[0][0].data;
      expect(data).toMatchObject({ companyId: 'c1', channel: 'EMAIL', subject: 'Follow-up', responded: false });
      expect(data.sentAt).toEqual(new Date('2026-01-05'));
    });

    it('updateCommunication throws NotFoundException when the log entry is missing', async () => {
      (prisma.companyPermissionCommunication.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.updateCommunication('log-x', { responded: true } as any)).rejects.toThrow(NotFoundException);
    });

    it('updateCommunication writes the responded flag', async () => {
      (prisma.companyPermissionCommunication.findUnique as jest.Mock).mockResolvedValue({ id: 'log-1' });
      (prisma.companyPermissionCommunication.update as jest.Mock).mockResolvedValue({ id: 'log-1', responded: true });

      await service.updateCommunication('log-1', { responded: true } as any);

      expect(prisma.companyPermissionCommunication.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: { responded: true },
      });
    });
  });
});
