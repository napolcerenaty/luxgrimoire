import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadService } from '../upload/upload.service';
import { AdminService } from './admin.service';

describe('AdminService — company data checks', () => {
  let service: AdminService;
  let prisma: DeepMockProxy<PrismaService>;
  let auditService: DeepMockProxy<AuditService>;

  const actor = { id: 'user-1', username: 'mod_jane' };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    auditService = mockDeep<AuditService>();
    const uploadService = mockDeep<UploadService>();
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;

    service = new AdminService(prisma, uploadService, auditService, cache);
  });

  describe('listCompanyDataChecks', () => {
    it('flattens the dataCheck relation and sorts stalest first', async () => {
      const recent = new Date('2026-08-30T10:00:00.000Z');
      (prisma.bookBoxCompany.findMany as jest.Mock).mockResolvedValue([
        { slug: 'beta', name: 'Beta', dataCheck: { checkedAt: recent, checkedByName: 'mod_jane', note: 'ok' } },
        { slug: 'alpha', name: 'Alpha', dataCheck: { checkedAt: new Date(0), checkedByName: null, note: null } },
        { slug: 'gamma', name: 'Gamma', dataCheck: null },
      ]);

      const rows = await service.listCompanyDataChecks();

      // epoch + null-relation rows first (order between them by name), recent one last
      expect(rows.map((r) => r.slug)).toEqual(['alpha', 'gamma', 'beta']);
      expect(rows[0]).toEqual({
        slug: 'alpha',
        name: 'Alpha',
        checkedAt: new Date(0).toISOString(),
        checkedByName: null,
        note: null,
      });
      expect(rows[2].checkedAt).toBe(recent.toISOString());
    });
  });

  describe('updateCompanyDataCheck', () => {
    it('throws NotFoundException for an unknown slug', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateCompanyDataCheck('nope', { touch: true }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('touch stamps checkedAt + checkedByName and writes an audit log', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue({
        id: 'co-1', slug: 'alpha', name: 'Alpha',
      });
      const stamped = new Date('2026-08-31T12:00:00.000Z');
      (prisma.companyDataCheck.upsert as jest.Mock).mockResolvedValue({
        checkedAt: stamped, checkedByName: 'mod_jane', note: null,
      });

      const res = await service.updateCompanyDataCheck('alpha', { touch: true }, actor);

      const arg = (prisma.companyDataCheck.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.where).toEqual({ companyId: 'co-1' });
      expect(arg.update.checkedAt).toBeInstanceOf(Date);
      expect(arg.update.checkedByName).toBe('mod_jane');
      expect('note' in arg.update).toBe(false);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TOUCH_COMPANY_DATA_CHECK', entityId: 'co-1' }),
      );
      expect(res.checkedAt).toBe(stamped.toISOString());
    });

    it('note-only update does not touch checkedAt and skips the audit log', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue({
        id: 'co-1', slug: 'alpha', name: 'Alpha',
      });
      (prisma.companyDataCheck.upsert as jest.Mock).mockResolvedValue({
        checkedAt: new Date(0), checkedByName: null, note: 'watching for March box',
      });

      await service.updateCompanyDataCheck('alpha', { note: 'watching for March box' }, actor);

      const arg = (prisma.companyDataCheck.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.update).toEqual({ note: 'watching for March box' });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('an empty note string clears the field', async () => {
      (prisma.bookBoxCompany.findUnique as jest.Mock).mockResolvedValue({
        id: 'co-1', slug: 'alpha', name: 'Alpha',
      });
      (prisma.companyDataCheck.upsert as jest.Mock).mockResolvedValue({
        checkedAt: new Date(0), checkedByName: null, note: null,
      });

      await service.updateCompanyDataCheck('alpha', { note: '' }, actor);

      const arg = (prisma.companyDataCheck.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.update).toEqual({ note: null });
    });
  });
});
