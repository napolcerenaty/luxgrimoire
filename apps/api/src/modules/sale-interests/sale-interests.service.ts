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

  // FA/EA fall forward to whichever later tier date is known — but GS previously had no
  // fallback at all, so a followed sale with tier GS and no generalSaleDate set yet (only
  // FA/EA announced so far) resolved to a null tierDate and got silently dropped from both
  // "upcoming sales" and the upcoming count. Every tier now falls back to *any* known date on
  // the announcement, so a followed sale always surfaces once at least one date is known,
  // regardless of which tier the user picked.
  private resolveTierDate(
    ann: { saleType: string; firstAccessDate: Date | string | null; earlyAccessDate: Date | string | null; generalSaleDate: Date | string | null; endsAt: Date | string | null },
    tier: string | null,
  ): Date | null {
    if (ann.saleType === 'OPEN_PREORDER') {
      return ann.endsAt ? new Date(ann.endsAt) : new Date(8640000000000000);
    }
    const fa = ann.firstAccessDate ? new Date(ann.firstAccessDate) : null;
    const ea = ann.earlyAccessDate ? new Date(ann.earlyAccessDate) : null;
    const gs = ann.generalSaleDate ? new Date(ann.generalSaleDate) : null;
    if (tier === 'FA') return fa ?? ea ?? gs;
    if (tier === 'EA') return ea ?? gs ?? fa;
    return gs ?? ea ?? fa;
  }

  async getUpcoming(userId: string, limit = 3) {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    // Broad first-pass: fetch any interest where at least one date is still upcoming.
    // We then filter in code to respect the user's chosen tier (FA/EA/GS) for each sale.
    const rows = await this.prisma.userSaleInterest.findMany({
      where: {
        userId,
        announcement: {
          OR: [
            // LIMITED_PREORDER / OVERSTOCK: any date >= today OR explicit endsAt still active
            {
              saleType: { in: ['LIMITED_PREORDER', 'OVERSTOCK'] },
              OR: [
                { generalSaleDate: { gte: today } },
                { earlyAccessDate: { gte: today } },
                { firstAccessDate: { gte: today } },
                { endsAt: { gt: now } },
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
            firstAccessDate: true,
            earlyAccessDate: true,
            generalSaleDate: true,
            endsAt: true,
            imageUrl: true,
            company: { select: { name: true, slug: true } },
          },
        },
      },
    });

    // Resolve the tier-relevant date for each row, filter out sales whose tier date is past,
    // then sort by that date and take limit.
    const resolved = rows
      .map(row => ({ row, tierDate: this.resolveTierDate(row.announcement, row.tier) }))
      .filter(({ row, tierDate }) => {
        if (!tierDate) return false;
        if (row.announcement.saleType === 'OPEN_PREORDER') {
          return row.announcement.endsAt == null || new Date(row.announcement.endsAt) > now;
        }
        return tierDate >= today;
      })
      .sort((a, b) => (a.tierDate!.getTime()) - (b.tierDate!.getTime()))
      .slice(0, limit)
      .map(({ row }) => row);

    return resolved;
  }

  async getUpcomingCount(userId: string) {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    // Broad first-pass fetch — then filter by tier-specific date in code (same logic as getUpcoming)
    const rows = await this.prisma.userSaleInterest.findMany({
      where: {
        userId,
        announcement: {
          OR: [
            {
              saleType: { in: ['LIMITED_PREORDER', 'OVERSTOCK'] },
              OR: [
                { generalSaleDate: { gte: today } },
                { earlyAccessDate: { gte: today } },
                { firstAccessDate: { gte: today } },
                { endsAt: { gt: now } },
              ],
            },
            { saleType: 'OPEN_PREORDER', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
      },
      select: {
        tier: true,
        announcement: {
          select: {
            saleType: true,
            firstAccessDate: true,
            earlyAccessDate: true,
            generalSaleDate: true,
            endsAt: true,
          },
        },
      },
    });

    const count = rows.filter(row => {
      if (row.announcement.saleType === 'OPEN_PREORDER') {
        return row.announcement.endsAt == null || new Date(row.announcement.endsAt) > now;
      }
      const tierDate = this.resolveTierDate(row.announcement, row.tier);
      return tierDate != null && tierDate >= today;
    }).length;

    return { count };
  }
}
