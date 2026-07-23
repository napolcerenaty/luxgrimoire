import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';

type AnnouncementDates = {
  saleType: string;
  firstAccessDate: Date | string | null;
  earlyAccessDate: Date | string | null;
  generalSaleDate: Date | string | null;
  endsAt: Date | string | null;
  regions?: { id: string; isDefault: boolean; firstAccessDate: Date | string | null; earlyAccessDate: Date | string | null; generalSaleDate: Date | string | null; endsAt: Date | string | null }[];
};

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

  private readonly regionSelect = {
    id: true,
    isDefault: true,
    firstAccessDate: true,
    earlyAccessDate: true,
    generalSaleDate: true,
    endsAt: true,
  } as const;

  // Sales with country-specific dates (SaleAnnouncementRegion) can leave the announcement's
  // own FA/EA/GS/endsAt fields null — the dates only exist per-region. The old WHERE only
  // checked the top-level fields, so those sales never matched at the DB level and were
  // dropped before code-level filtering even ran. Broaden it: match if EITHER the top-level
  // fields OR any region's fields have an upcoming date. Includes endsAt so getUpcomingCount's
  // OPEN_PREORDER "still open" check (see below) has something to match on even when FA/EA/GS
  // are all in the past — a harmless slight over-fetch for getUpcoming, which doesn't use endsAt.
  private upcomingDateWhere(today: Date): Prisma.SaleAnnouncementWhereInput {
    const now = new Date();
    const topLevelOr: Prisma.SaleAnnouncementWhereInput[] = [
      { generalSaleDate: { gte: today } },
      { earlyAccessDate: { gte: today } },
      { firstAccessDate: { gte: today } },
      { endsAt: { gt: now } },
    ];
    // Same conditions, applied to SaleAnnouncementRegion instead — a different (but
    // field-name-identical) Prisma filter type, hence the separate literal array.
    const regionOr: Prisma.SaleAnnouncementRegionWhereInput[] = [
      { generalSaleDate: { gte: today } },
      { earlyAccessDate: { gte: today } },
      { firstAccessDate: { gte: today } },
      { endsAt: { gt: now } },
    ];
    return { OR: [...topLevelOr, { regions: { some: { OR: regionOr } } }] };
  }

  private pickRegion<R extends { id: string; isDefault: boolean }>(regions: R[] | undefined, regionId: string | null | undefined): R | null {
    const list = regions ?? [];
    return (regionId ? list.find(r => r.id === regionId) : null)
      ?? (list.length > 0 ? (list.find(r => r.isDefault) ?? list[0]) : null);
  }

  // FA/EA fall forward to whichever later tier date is known — but GS previously had no
  // fallback at all, so a followed sale with tier GS and no generalSaleDate set yet (only
  // FA/EA announced so far) resolved to a null tierDate and got silently dropped from both
  // "upcoming sales" and the upcoming count. Every tier now falls back to *any* known date on
  // the announcement, so a followed sale always surfaces once at least one date is known,
  // regardless of which tier the user picked.
  //
  // Also mirrors resolveSaleDates on the frontend (apps/web/src/lib/saleDates.ts): the user's
  // selected region (or the sale's default region) takes priority over the top-level dates,
  // since sales with per-country dates leave the top-level fields null entirely.
  //
  // This resolves the FA/EA/GS "opens at" date only — it doesn't know about saleType/endsAt.
  // getUpcoming (the homepage list) uses this alone, uniformly for every saleType: that widget
  // never shows saleType to the user, it's purely "when's my next sale," and treating
  // OPEN_PREORDER differently there previously pushed it to the literal end of time whenever its
  // endsAt was unset (see git history). getUpcomingCount is a different question — "how many of
  // my followed sales are still relevant right now" — where an OPEN_PREORDER genuinely should
  // keep counting once it's opened, for as long as it hasn't closed; that method layers
  // resolveEndsAt on top for that saleType specifically. Don't collapse the two back together.
  private resolveTierDate(ann: AnnouncementDates, tier: string | null, regionId?: string | null): Date | null {
    const region = this.pickRegion(ann.regions, regionId);
    const pick = (regionDate: Date | string | null | undefined, annDate: Date | string | null) => {
      const d = regionDate ?? annDate;
      return d ? new Date(d) : null;
    };
    const fa = pick(region?.firstAccessDate, ann.firstAccessDate);
    const ea = pick(region?.earlyAccessDate, ann.earlyAccessDate);
    const gs = pick(region?.generalSaleDate, ann.generalSaleDate);
    if (tier === 'FA') return fa ?? ea ?? gs;
    if (tier === 'EA') return ea ?? gs ?? fa;
    return gs ?? ea ?? fa;
  }

  private resolveEndsAt(ann: AnnouncementDates, regionId?: string | null): Date | null {
    const region = this.pickRegion(ann.regions, regionId);
    const d = region?.endsAt ?? ann.endsAt;
    return d ? new Date(d) : null;
  }

  async getUpcoming(userId: string, limit = 3) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Broad first-pass: fetch any interest where at least one date (top-level or per-region) is
    // still upcoming. We then filter in code to respect the user's chosen tier and region.
    const rows = await this.prisma.userSaleInterest.findMany({
      where: {
        userId,
        announcement: this.upcomingDateWhere(today),
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
            regions: { select: this.regionSelect },
          },
        },
      },
    });

    // Resolve the tier-relevant date for each row, filter out sales whose tier date is past,
    // then sort by that date and take limit.
    const resolved = rows
      .map(row => ({ row, tierDate: this.resolveTierDate(row.announcement, row.tier, row.regionId) }))
      .filter(({ tierDate }) => tierDate != null && tierDate >= today)
      .sort((a, b) => a.tierDate!.getTime() - b.tierDate!.getTime())
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
        announcement: this.upcomingDateWhere(today),
      },
      select: {
        tier: true,
        regionId: true,
        announcement: {
          select: {
            saleType: true,
            firstAccessDate: true,
            earlyAccessDate: true,
            generalSaleDate: true,
            endsAt: true,
            regions: { select: this.regionSelect },
          },
        },
      },
    });

    // OPEN_PREORDER counts as long as it's still ongoing (endsAt unset or in the future) —
    // even once its own opens-at date has passed, it's still purchasable/actionable, so it
    // should keep counting. Every other type counts by its FA/EA/GS tier date only.
    const count = rows.filter(row => {
      if (row.announcement.saleType === 'OPEN_PREORDER') {
        const endsAt = this.resolveEndsAt(row.announcement, row.regionId);
        return endsAt == null || endsAt > now;
      }
      const tierDate = this.resolveTierDate(row.announcement, row.tier, row.regionId);
      return tierDate != null && tierDate >= today;
    }).length;

    return { count };
  }
}
