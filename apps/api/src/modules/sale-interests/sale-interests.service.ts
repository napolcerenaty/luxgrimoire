import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';

@Injectable()
export class SaleInterestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly scheduledReminders?: ScheduledRemindersService,
  ) {}

  async upsert(
    userId: string,
    announcementId: string,
    tier: string,
    regionId?: string | null,
    selectedPrice?: number | null,
    selectedPriceCurrency?: string | null,
  ) {
    const result = await this.prisma.userSaleInterest.upsert({
      where: { userId_announcementId: { userId, announcementId } },
      create: {
        userId,
        announcementId,
        tier,
        regionId: regionId ?? null,
        selectedPrice: selectedPrice ?? null,
        selectedPriceCurrency: selectedPriceCurrency ?? null,
      },
      update: {
        tier,
        regionId: regionId ?? null,
        selectedPrice: selectedPrice ?? null,
        selectedPriceCurrency: selectedPriceCurrency ?? null,
      },
    });
    // Schedule (or reschedule) sale reminder
    this.scheduledReminders?.cancelBySaleInterest(userId, announcementId)
      .then(() => this.scheduledReminders?.scheduleSale(userId, announcementId, tier))
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
            regions: {
              select: {
                id: true,
                firstAccessDate: true,
                earlyAccessDate: true,
                generalSaleDate: true,
                saleTimezone: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  }

  async findOne(userId: string, announcementId: string) {
    return this.prisma.userSaleInterest.findUnique({
      where: { userId_announcementId: { userId, announcementId } },
    });
  }

  async getUpcoming(userId: string, limit = 3) {
    const now = new Date();
    const rows = await this.prisma.userSaleInterest.findMany({
      where: {
        userId,
        announcement: {
          OR: [
            // LIMITED_PREORDER / OVERSTOCK: upcoming date OR already live (started, not expired)
            {
              saleType: { in: ['LIMITED_PREORDER', 'OVERSTOCK'] },
              OR: [
                { generalSaleDate: { gte: now } },
                { earlyAccessDate: { gte: now } },
                { firstAccessDate: { gte: now } },
                { AND: [{ generalSaleDate: { lt: now } }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
              ],
            },
            // OPEN_PREORDER: active if not expired
            { saleType: 'OPEN_PREORDER', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
      },
      include: {
        announcement: {
          select: {
            id: true,
            title: true,
            saleType: true,
            generalSaleDate: true,
            endsAt: true,
            imageUrl: true,
            company: { select: { name: true, slug: true } },
          },
        },
      },
      orderBy: { announcement: { generalSaleDate: 'asc' } },
      take: limit,
    });
    return rows;
  }

  async getUpcomingCount(userId: string) {
    const now = new Date();
    const count = await this.prisma.userSaleInterest.count({
      where: {
        userId,
        announcement: {
          OR: [
            // LIMITED_PREORDER / OVERSTOCK: upcoming OR currently live (started, not expired)
            {
              saleType: { in: ['LIMITED_PREORDER', 'OVERSTOCK'] },
              OR: [
                { generalSaleDate: { gte: now } },
                { earlyAccessDate: { gte: now } },
                { firstAccessDate: { gte: now } },
                { AND: [{ generalSaleDate: { lt: now } }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
              ],
            },
            // OPEN_PREORDER: active if not expired
            { saleType: 'OPEN_PREORDER', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
      },
    });

    return { count };
  }
}
