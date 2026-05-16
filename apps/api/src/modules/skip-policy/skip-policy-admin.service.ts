import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertSkipPolicyDto } from './skip-policy.dto';

@Injectable()
export class SkipPolicyAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getPolicy(subscriptionSlug: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug: subscriptionSlug },
      include: { skipPolicy: true },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${subscriptionSlug}' not found`);
    return subscription.skipPolicy ?? { type: 'NONE', maxSkips: null, maxConsecutive: null, windowMonths: null, notes: null };
  }

  async upsertPolicy(
    subscriptionSlug: string,
    dto: UpsertSkipPolicyDto,
    actor: { id: string; role: string },
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug: subscriptionSlug },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${subscriptionSlug}' not found`);

    // COMPANY_MANAGER can only manage their own company's subscriptions
    if (actor.role === 'COMPANY_MANAGER') {
      const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
      if (user?.managedCompanyId !== subscription.companyId) {
        throw new ForbiddenException('You can only manage your own company subscriptions');
      }
    }

    return this.prisma.subscriptionSkipPolicy.upsert({
      where: { subscriptionId: subscription.id },
      create: {
        subscriptionId: subscription.id,
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
      },
      update: {
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
      },
    });
  }

  async removePolicy(subscriptionSlug: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug: subscriptionSlug },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${subscriptionSlug}' not found`);

    await this.prisma.subscriptionSkipPolicy.deleteMany({
      where: { subscriptionId: subscription.id },
    });
    return { message: 'Policy removed' };
  }
}
