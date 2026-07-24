import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';

@Injectable()
export class SaleInterestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly scheduledReminders?: ScheduledRemindersService,
  ) {}

  /** Legacy tier VARCHAR(2) column is kept populated (best-effort) purely for older code paths
   *  that haven't migrated to reading tierId/saleTier yet — it's no longer authoritative. */
  private legacyTierCode(tierName: string): string {
    if (tierName === 'First Access') return 'FA';
    if (tierName === 'Early Access') return 'EA';
    return 'GS';
  }

  async upsert(
    userId: string,
    announcementId: string,
    tierId: string,
    selectedPrice?: number | null,
    selectedPriceCurrency?: string | null,
  ) {
    const tier = await this.prisma.saleTier.findFirst({ where: { id: tierId, saleId: announcementId } });
    if (!tier) throw new NotFoundException('Tier not found on this announcement');

    const result = await this.prisma.userSaleInterest.upsert({
      where: { userId_announcementId: { userId, announcementId } },
      create: {
        userId,
        announcementId,
        tier: this.legacyTierCode(tier.name),
        tierId: tier.id,
        regionId: tier.regionId,
        selectedPrice: selectedPrice ?? null,
        selectedPriceCurrency: selectedPriceCurrency ?? null,
      },
      update: {
        tier: this.legacyTierCode(tier.name),
        tierId: tier.id,
        regionId: tier.regionId,
        selectedPrice: selectedPrice ?? null,
        selectedPriceCurrency: selectedPriceCurrency ?? null,
      },
    });
    // Schedule (or reschedule) sale reminder — resolves straight off tier.date, no fallback chain
    this.scheduledReminders?.cancelBySaleInterest(userId, announcementId)
      .then(() => this.scheduledReminders?.scheduleSale(userId, announcementId, tier.id))
      .catch(() => {});
    return result;
  }

  async remove(userId: string, announcementId: string) {
    await this.prisma.userSaleInterest.deleteMany({
      where: { userId, announcementId },
    });
    this.scheduledReminders?.cancelBySaleInterest(userId, announcementId).catch(() => {});
    return { ok: true };
  }

  async findAll(userId: string) {
    const rows = await this.prisma.userSaleInterest.findMany({
      where: { userId },
      include: {
        announcement: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            basePrice: true,
            subscriberBasePrice: true,
            currency: true,
            generalSaleDate: true,
            earlyAccessDate: true,
            firstAccessDate: true,
            endsAt: true,
            saleTimezone: true,
            saleType: true,
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                brandColors: true,
              },
            },
            regions: { select: this.regionSelect },
          },
        },
        saleTier: { select: { id: true, name: true, date: true, regionId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  }

  async findOne(userId: string, announcementId: string) {
    return this.prisma.userSaleInterest.findUnique({
      where: { userId_announcementId: { userId, announcementId } },
      include: { saleTier: { select: { id: true, name: true, date: true, regionId: true } } },
    });
  }

  private readonly regionSelect = {
    id: true,
    isDefault: true,
    firstAccessDate: true,
    earlyAccessDate: true,
    generalSaleDate: true,
    endsAt: true,
  } as const;

  /** A user's interest now points directly at one concrete SaleTier row — its `date` IS the
   *  resolved date, no FA/EA/GS fallback-chain resolution needed (every tier is a real row with
   *  a real date, unlike the old fixed 3-slot columns where a tier's own date could be null and
   *  had to fall back to the next slot down). Filtering and sorting both happen at the DB level
   *  via the saleTier relation instead of a fetch-then-reduce-in-JS pass. */
  async getUpcoming(userId: string, limit = 3) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = await this.prisma.userSaleInterest.findMany({
      where: { userId, saleTier: { date: { gte: today } } },
      include: {
        announcement: {
          select: {
            id: true,
            title: true,
            saleType: true,
            firstAccessDate: true,
            earlyAccessDate: true,
            generalSaleDate: true,
            endsAt: true,
            imageUrl: true,
            company: { select: { name: true, slug: true } },
          },
        },
        saleTier: { select: { id: true, name: true, date: true } },
      },
      orderBy: { saleTier: { date: 'asc' } },
      take: limit,
    });

    return rows;
  }
}
