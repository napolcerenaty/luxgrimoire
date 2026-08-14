import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertSkipPolicyDto } from './skip-policy.dto';
import { SkipPolicyEngine } from './skip-policy.engine';

@Injectable()
export class SkipPolicyAdminService {
  private readonly subSlugKey = (slug: string) => `subscriptions:slug:${slug}`;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly engine: SkipPolicyEngine,
  ) {}

  /** Returns all skip policies for a subscription (one per billing type). */
  async getPolicies(subscriptionSlug: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug: subscriptionSlug },
      include: { skipPolicies: true },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${subscriptionSlug}' not found`);
    return subscription.skipPolicies ?? [];
  }

  /** Backward-compat: returns the ALL policy, or the first policy, or a NONE placeholder. */
  async getPolicy(subscriptionSlug: string) {
    const policies = await this.getPolicies(subscriptionSlug);
    return (
      policies.find((p) => p.billingType === 'ALL') ??
      policies[0] ??
      { type: 'NONE', maxSkips: null, maxConsecutive: null, windowMonths: null, notes: null }
    );
  }

  private async resolveSubscription(
    subscriptionSlug: string,
    actor?: { id: string; role: string },
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug: subscriptionSlug },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${subscriptionSlug}' not found`);

    // COMPANY_MANAGER can only manage their own company's subscriptions
    if (actor?.role === 'COMPANY_MANAGER') {
      const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
      if (user?.managedCompanyId !== subscription.companyId) {
        throw new ForbiddenException('You can only manage your own company subscriptions');
      }
    }
    return subscription;
  }

  async upsertPolicy(
    subscriptionSlug: string,
    dto: UpsertSkipPolicyDto,
    actor: { id: string; role: string },
    billingTypeOverride?: string,
  ) {
    const subscription = await this.resolveSubscription(subscriptionSlug, actor);
    const billingType = billingTypeOverride ?? dto.billingType ?? 'ALL';

    const data = {
      type: dto.type,
      maxSkips: dto.maxSkips ?? null,
      maxConsecutive: dto.maxConsecutive ?? null,
      windowMonths: dto.windowMonths ?? null,
      skipDeadlineType: dto.skipDeadlineType ?? 'DAYS_BEFORE',
      skipDeadlineDaysBefore: dto.skipDeadlineDaysBefore ?? 0,
      skipDeadlineDayOfMonth: dto.skipDeadlineDayOfMonth ?? null,
      notes: dto.notes ?? null,
      skipHow: dto.skipHow ?? null,
      allowUnskip: dto.allowUnskip ?? false,
      unskipDeadlineType: dto.unskipDeadlineType ?? 'DAYS_BEFORE',
      unskipDeadlineDaysBefore: dto.unskipDeadlineDaysBefore ?? 0,
      unskipDeadlineDayOfMonth: dto.unskipDeadlineDayOfMonth ?? null,
      unskipNotes: dto.unskipNotes ?? null,
      unskipHow: dto.unskipHow ?? null,
    };

    return this.prisma.subscriptionSkipPolicy.upsert({
      where: { subscriptionId_billingType: { subscriptionId: subscription.id, billingType } },
      create: { subscriptionId: subscription.id, billingType, ...data },
      update: data,
    }).then(result => {
      void this.cache.del(this.subSlugKey(subscriptionSlug));
      return result;
    });
  }

  /** Remove a single policy for a specific billing type (default ALL). */
  async removePolicy(subscriptionSlug: string, billingType: string = 'ALL') {
    const subscription = await this.resolveSubscription(subscriptionSlug);
    await this.prisma.subscriptionSkipPolicy.deleteMany({
      where: { subscriptionId: subscription.id, billingType },
    });
    void this.cache.del(this.subSlugKey(subscriptionSlug));
    return { message: 'Policy removed' };
  }

  /** Remove ALL policies for this subscription. */
  async removePolicies(subscriptionSlug: string) {
    const subscription = await this.resolveSubscription(subscriptionSlug);
    await this.prisma.subscriptionSkipPolicy.deleteMany({
      where: { subscriptionId: subscription.id },
    });
    void this.cache.del(this.subSlugKey(subscriptionSlug));
    return { message: 'All policies removed' };
  }

  /** Preview how many active users would be affected by a proposed (not-yet-saved) policy change. */
  async previewRecompute(
    subscriptionSlug: string,
    billingType: string,
    proposedType: string,
    proposedWindowMonths: number | null | undefined,
    actor: { id: string; role: string },
  ) {
    await this.resolveSubscription(subscriptionSlug, actor);
    return this.engine.previewWindowRecompute(subscriptionSlug, billingType, proposedType, proposedWindowMonths ?? null);
  }

  /** Recompute skip windows for all active users under the CURRENTLY SAVED policy (billingType). */
  async applyRecompute(
    subscriptionSlug: string,
    billingType: string,
    actor: { id: string; role: string },
  ) {
    await this.resolveSubscription(subscriptionSlug, actor);
    const result = await this.engine.recomputeWindowsForPolicy(subscriptionSlug, billingType);
    void this.cache.del(this.subSlugKey(subscriptionSlug));
    return result;
  }
}
