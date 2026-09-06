import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SkipPolicyEngine } from './skip-policy.engine';
import { SkipPolicyAdminService } from './skip-policy-admin.service';

const ADMIN = { id: 'admin-1', role: 'ADMIN' };
const MANAGER = { id: 'mgr-1', role: 'COMPANY_MANAGER' };
const SLUG = 'fairyloot';
const SUB = { id: 'sub-1', slug: SLUG, companyId: 'co-1' };

describe('SkipPolicyAdminService', () => {
  let service: SkipPolicyAdminService;
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { del: jest.Mock };
  let engine: { previewWindowRecompute: jest.Mock; recomputeWindowsForPolicy: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    cache = { del: jest.fn().mockResolvedValue(undefined) };
    engine = {
      previewWindowRecompute: jest.fn().mockResolvedValue({ affected: 4 }),
      recomputeWindowsForPolicy: jest.fn().mockResolvedValue({ recomputed: 4 }),
    };
    service = new SkipPolicyAdminService(prisma, cache as any, engine as unknown as SkipPolicyEngine);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getPolicies / getPolicy', () => {
    it('throws NotFoundException for an unknown subscription', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getPolicies(SLUG)).rejects.toThrow(NotFoundException);
    });

    it('returns the stored policies (or an empty array)', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ ...SUB, skipPolicies: null });
      expect(await service.getPolicies(SLUG)).toEqual([]);
    });

    it('getPolicy prefers the ALL policy, then the first, then a NONE placeholder', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        ...SUB,
        skipPolicies: [{ billingType: 'MONTHLY', type: 'LIMITED' }, { billingType: 'ALL', type: 'UNLIMITED' }],
      });
      expect(await service.getPolicy(SLUG)).toMatchObject({ billingType: 'ALL' });

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        ...SUB,
        skipPolicies: [{ billingType: 'MONTHLY', type: 'LIMITED' }],
      });
      expect(await service.getPolicy(SLUG)).toMatchObject({ billingType: 'MONTHLY' });

      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ ...SUB, skipPolicies: [] });
      expect(await service.getPolicy(SLUG)).toEqual({
        type: 'NONE', maxSkips: null, maxConsecutive: null, windowMonths: null, notes: null,
      });
    });
  });

  describe('RBAC (resolveSubscription via upsertPolicy)', () => {
    it('throws NotFoundException when the subscription does not exist', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.upsertPolicy(SLUG, { type: 'UNLIMITED' } as any, ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('lets a COMPANY_MANAGER manage their own company subscription', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(SUB);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ managedCompanyId: 'co-1' });
      (prisma.subscriptionSkipPolicy.upsert as jest.Mock).mockResolvedValue({ id: 'p1' });

      await expect(service.upsertPolicy(SLUG, { type: 'UNLIMITED' } as any, MANAGER)).resolves.toBeDefined();
    });

    it('forbids a COMPANY_MANAGER from touching another company subscription', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(SUB);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ managedCompanyId: 'co-OTHER' });

      await expect(service.upsertPolicy(SLUG, { type: 'UNLIMITED' } as any, MANAGER)).rejects.toThrow(ForbiddenException);
      expect(prisma.subscriptionSkipPolicy.upsert).not.toHaveBeenCalled();
    });

    it('does not look up the user for a non-manager actor', async () => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(SUB);
      (prisma.subscriptionSkipPolicy.upsert as jest.Mock).mockResolvedValue({ id: 'p1' });

      await service.upsertPolicy(SLUG, { type: 'UNLIMITED' } as any, ADMIN);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('upsertPolicy', () => {
    beforeEach(() => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(SUB);
      (prisma.subscriptionSkipPolicy.upsert as jest.Mock).mockResolvedValue({ id: 'p1' });
    });

    it('resolves billingType from override > dto > ALL and applies the field defaults', async () => {
      await service.upsertPolicy(SLUG, { type: 'LIMITED', billingType: 'MONTHLY' } as any, ADMIN);

      const arg = (prisma.subscriptionSkipPolicy.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.where).toEqual({ subscriptionId_billingType: { subscriptionId: 'sub-1', billingType: 'MONTHLY' } });
      expect(arg.create).toMatchObject({
        subscriptionId: 'sub-1',
        billingType: 'MONTHLY',
        type: 'LIMITED',
        maxSkips: null,
        skipDeadlineType: 'DAYS_BEFORE',
        skipDeadlineDaysBefore: 0,
        allowUnskip: false,
      });
      expect(arg.update).not.toHaveProperty('subscriptionId');
    });

    it('honours the billingType override ahead of the DTO', async () => {
      await service.upsertPolicy(SLUG, { type: 'LIMITED', billingType: 'MONTHLY' } as any, ADMIN, 'PREPAID');
      const arg = (prisma.subscriptionSkipPolicy.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.where.subscriptionId_billingType.billingType).toBe('PREPAID');
    });

    it('invalidates the subscription slug cache after the upsert', async () => {
      await service.upsertPolicy(SLUG, { type: 'UNLIMITED' } as any, ADMIN);
      expect(cache.del).toHaveBeenCalledWith(`subscriptions:slug:${SLUG}`);
    });
  });

  describe('removePolicy / removePolicies', () => {
    beforeEach(() => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(SUB);
      (prisma.subscriptionSkipPolicy.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('removePolicy defaults to the ALL billing type and busts the cache', async () => {
      const res = await service.removePolicy(SLUG);
      expect(prisma.subscriptionSkipPolicy.deleteMany).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub-1', billingType: 'ALL' },
      });
      expect(cache.del).toHaveBeenCalledWith(`subscriptions:slug:${SLUG}`);
      expect(res).toEqual({ message: 'Policy removed' });
    });

    it('removePolicy passes an explicit billing type through', async () => {
      await service.removePolicy(SLUG, 'PREPAID');
      expect(prisma.subscriptionSkipPolicy.deleteMany).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub-1', billingType: 'PREPAID' },
      });
    });

    it('removePolicies deletes every billing type for the subscription', async () => {
      const res = await service.removePolicies(SLUG);
      expect(prisma.subscriptionSkipPolicy.deleteMany).toHaveBeenCalledWith({ where: { subscriptionId: 'sub-1' } });
      expect(res).toEqual({ message: 'All policies removed' });
    });
  });

  describe('previewRecompute / applyRecompute', () => {
    beforeEach(() => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(SUB);
    });

    it('previewRecompute enforces RBAC then delegates, coercing an undefined window to null', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ managedCompanyId: 'co-1' });

      const res = await service.previewRecompute(SLUG, 'ALL', 'LIMITED', undefined, MANAGER);

      expect(engine.previewWindowRecompute).toHaveBeenCalledWith(SLUG, 'ALL', 'LIMITED', null);
      expect(res).toEqual({ affected: 4 });
    });

    it('previewRecompute rejects a manager from another company before calling the engine', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ managedCompanyId: 'co-OTHER' });

      await expect(service.previewRecompute(SLUG, 'ALL', 'LIMITED', 6, MANAGER)).rejects.toThrow(ForbiddenException);
      expect(engine.previewWindowRecompute).not.toHaveBeenCalled();
    });

    it('applyRecompute delegates to the engine and busts the cache', async () => {
      const res = await service.applyRecompute(SLUG, 'ALL', ADMIN);

      expect(engine.recomputeWindowsForPolicy).toHaveBeenCalledWith(SLUG, 'ALL');
      expect(cache.del).toHaveBeenCalledWith(`subscriptions:slug:${SLUG}`);
      expect(res).toEqual({ recomputed: 4 });
    });
  });
});
