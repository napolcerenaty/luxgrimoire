import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { assertOwnership } from '../../common/utils/assert-ownership.util';
import { recordOwnershipHistory } from '../../common/utils/ownership-history.util';
import { resolvePerBookPrices } from '../../common/utils/price-allocation.util';
import { PrismaService } from '../../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { CreatePurchaseGroupDto, UpdatePurchaseGroupDto } from './purchase-groups.dto';

@Injectable()
export class PurchaseGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
  ) {}

  async getGroups(userId: string) {
    const groups = await this.prisma.userPurchaseGroup.findMany({
      where: { userId },
      include: {
        saleAnnouncement: { select: { id: true, title: true } },
        bookEntries: {
          select: { id: true, bookId: true, editionId: true, basePrice: true },
        },
        fees: { select: { amount: true, currency: true } },
        discounts: { select: { amount: true, currency: true } },
        refunds: { select: { amount: true, currency: true } },
      },
      orderBy: { purchasedAt: 'desc' },
    });

    return groups.map((g) => this.computeGroupCosts(g));
  }

  async getGroup(userId: string, groupId: string) {
    const g = await this.prisma.userPurchaseGroup.findUnique({
      where: { id: groupId },
      include: {
        saleAnnouncement: {
          select: { id: true, title: true, isBundle: true },
        },
        bookEntries: {
          select: { id: true, bookId: true, editionId: true, basePrice: true },
          include: {
            book: { select: { id: true, title: true } },
            edition: { select: { id: true, title: true, imageUrl: true } },
          } as never,
        },
        fees: true,
        discounts: true,
        refunds: true,
      },
    });
    if (!g) throw new NotFoundException('Purchase group not found');
    assertOwnership(g.userId, userId);
    return this.computeGroupCosts(g);
  }

  async createGroup(userId: string, dto: CreatePurchaseGroupDto) {
    if (dto.editionIds.length === 0) {
      throw new BadRequestException('At least one edition is required for a bundle');
    }

    // Validate all editions exist and get their bookIds
    const editions = await this.prisma.bookEdition.findMany({
      where: { id: { in: dto.editionIds } },
      select: { id: true, bookId: true },
    });

    if (editions.length !== dto.editionIds.length) {
      throw new BadRequestException('Some edition IDs are invalid');
    }

    // Check if saleAnnouncementId is valid if provided
    if (dto.saleAnnouncementId) {
      const sale = await this.prisma.saleAnnouncement.findUnique({
        where: { id: dto.saleAnnouncementId },
      });
      if (!sale) throw new BadRequestException('Sale announcement not found');
    }

    if (dto.priceDistribution === 'CUSTOM' && !dto.editionPrices) {
      throw new BadRequestException('editionPrices required for CUSTOM distribution');
    }
    // Partial overrides are fine — priced editions get their exact price, the rest split
    // whatever's left evenly (resolvePerBookPrices validates the sum against totalAmount).
    const editionPriceOverrides = new Map(Object.entries(dto.editionPrices ?? {}));
    const { prices: perEditionPrices, distribution } = resolvePerBookPrices(dto.editionIds, editionPriceOverrides, dto.totalAmount);

    const result = await this.prisma.$transaction(async (tx) => {
      // Create the group
      const group = await tx.userPurchaseGroup.create({
        data: {
          userId,
          saleAnnouncementId: dto.saleAnnouncementId ?? null,
          title: dto.title ?? null,
          totalAmount: dto.totalAmount,
          currency: dto.currency,
          shippingAmount: dto.shippingAmount ?? null,
          purchasedAt: new Date(dto.purchasedAt),
          notes: dto.notes ?? null,
          isSecondHand: dto.isSecondHand ?? false,
          sourcePlatform: dto.sourcePlatform ?? null,
          priceDistribution: distribution,
        },
      });

      // Create book entries for each edition
      const bookEntries = await Promise.all(
        editions.map((edition) => {
          const signatureType = dto.editionSignatureTypes?.[edition.id];
          const saeId = dto.editionSaleAnnouncementEditionIds?.[edition.id];
          return tx.userBookEntry.create({
            data: {
              userId,
              bookId: edition.bookId,
              editionId: edition.id,
              purchaseGroupId: group.id,
              ownershipStatus: (dto.ownershipStatus as any) ?? 'OWNED',
              isOriginalPrint: !saeId,
              basePrice: perEditionPrices.get(edition.id),
              ...(dto.orderNumber ? { orderNumber: dto.orderNumber } : {}),
              ...(signatureType && signatureType !== 'unsigned' ? { signatureType: signatureType as any } : {}),
              ...(saeId ? { saleAnnouncementEditionId: saeId } : {}),
            },
          });
        })
      );

      // Record initial ownership history for each entry
      const ownershipStatus = (dto.ownershipStatus as string | undefined) ?? 'OWNED';
      await recordOwnershipHistory(tx, bookEntries, ownershipStatus, new Date(dto.purchasedAt));

      return { group, bookEntries };
    });

    this.statsService.markStatsStale(userId, [new Date(dto.purchasedAt).getFullYear()]);
    return result;
  }

  async updateGroup(userId: string, groupId: string, dto: UpdatePurchaseGroupDto) {
    const existing = await this.prisma.userPurchaseGroup.findUnique({
      where: { id: groupId },
      include: { bookEntries: { select: { id: true, basePrice: true } } },
    });
    if (!existing) throw new NotFoundException('Purchase group not found');
    assertOwnership(existing.userId, userId);

    const entryIds = existing.bookEntries.map((be) => be.id);
    const oldTotal = this.toNum(existing.totalAmount);
    const newTotal = dto.totalAmount !== undefined ? dto.totalAmount : oldTotal;
    const hasEntryPrices = dto.entryPrices !== undefined;
    const wasCustom = existing.priceDistribution === 'CUSTOM';

    // Redistribute basePrice whenever the total or the explicit per-entry prices change —
    // mirrors sales.service.ts updateSaleGroup's shouldRedistribute/rescale logic. Partial
    // entryPrices are fine (resolvePerBookPrices splits the remainder across the rest).
    const shouldRedistribute = entryIds.length > 0 && (
      (dto.totalAmount !== undefined && dto.totalAmount !== oldTotal) || hasEntryPrices
    );

    let newPrices: Map<string, number> | null = null;
    let resolvedDistribution: 'EQUAL' | 'CUSTOM' | undefined = dto.priceDistribution;
    if (shouldRedistribute) {
      if (hasEntryPrices) {
        const result = resolvePerBookPrices(entryIds, new Map(Object.entries(dto.entryPrices!)), newTotal);
        newPrices = result.prices;
        resolvedDistribution = resolvedDistribution ?? result.distribution;
      } else if (wasCustom) {
        // Total changed but no new per-entry prices given — rescale old allocations
        // proportionally to their old share of the total, same as the sales-side flow.
        newPrices = new Map(existing.bookEntries.map((be) => {
          const oldAlloc = this.toNum(be.basePrice);
          const rescaled = oldTotal > 0
            ? Math.round((oldAlloc / oldTotal) * newTotal * 100) / 100
            : Math.round((newTotal / entryIds.length) * 100) / 100;
          return [be.id, rescaled];
        }));
        resolvedDistribution = resolvedDistribution ?? 'CUSTOM';
      } else {
        const equalShare = Math.round((newTotal / entryIds.length) * 100) / 100;
        newPrices = new Map(entryIds.map((id) => [id, equalShare]));
        resolvedDistribution = resolvedDistribution ?? 'EQUAL';
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const group = await tx.userPurchaseGroup.update({
        where: { id: groupId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.totalAmount !== undefined && { totalAmount: dto.totalAmount }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...(dto.shippingAmount !== undefined && { shippingAmount: dto.shippingAmount }),
          ...(dto.purchasedAt !== undefined && { purchasedAt: new Date(dto.purchasedAt) }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.fromSubscription !== undefined && { fromSubscription: dto.fromSubscription }),
          ...(dto.isSecondHand !== undefined && { isSecondHand: dto.isSecondHand }),
          ...(dto.sourcePlatform !== undefined && { sourcePlatform: dto.sourcePlatform }),
          ...(resolvedDistribution !== undefined && { priceDistribution: resolvedDistribution }),
        },
      });

      if (newPrices) {
        for (const id of entryIds) {
          await tx.userBookEntry.update({ where: { id }, data: { basePrice: newPrices.get(id) } });
        }
      }

      return group;
    });

    this.statsService.markStatsStale(userId);
    return updated;
  }

  async createGroupForEntry(userId: string, entryId: string, dto: UpdatePurchaseGroupDto & { totalAmount: number; currency: string; purchasedAt: string }) {
    const entry = await this.prisma.userBookEntry.findUnique({
      where: { id: entryId },
      select: { userId: true, purchaseGroupId: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    assertOwnership(entry.userId, userId);

    const group = await this.prisma.$transaction(async (tx) => {
      const createdGroup = await tx.userPurchaseGroup.create({
        data: {
          userId,
          title: dto.title ?? null,
          totalAmount: dto.totalAmount,
          currency: dto.currency,
          shippingAmount: dto.shippingAmount ?? null,
          purchasedAt: new Date(dto.purchasedAt),
          notes: dto.notes ?? null,
          isSecondHand: dto.isSecondHand ?? false,
          sourcePlatform: dto.sourcePlatform ?? null,
        },
      });
      await tx.userBookEntry.update({
        where: { id: entryId },
        // Single-book group — the whole total is this book's price.
        data: { purchaseGroupId: createdGroup.id, basePrice: dto.totalAmount },
      });
      return createdGroup;
    });

    this.statsService.markStatsStale(userId);
    return group;
  }

  async deleteGroup(userId: string, groupId: string) {
    const existing = await this.prisma.userPurchaseGroup.findUnique({ where: { id: groupId } });
    if (!existing) throw new NotFoundException('Purchase group not found');
    assertOwnership(existing.userId, userId);

    // Unlink book entries (don't delete them, just clear the group reference)
    await this.prisma.userBookEntry.updateMany({
      where: { purchaseGroupId: groupId },
      data: { purchaseGroupId: null },
    });

    await this.prisma.userPurchaseGroup.delete({ where: { id: groupId } });
    this.statsService.markStatsStale(userId);
  }

  // ── Stats helper ─────────────────────────────────────────────────────────────

  /** Get per-book cost info for a single book entry that belongs to a group */
  async getGroupCostForEntry(groupId: string) {
    const g = await this.prisma.userPurchaseGroup.findUnique({
      where: { id: groupId },
      include: {
        bookEntries: { select: { id: true, basePrice: true } },
        fees: { select: { amount: true, currency: true } },
        discounts: { select: { amount: true, currency: true } },
        refunds: { select: { amount: true, currency: true } },
        saleAnnouncement: { select: { id: true, title: true } },
      },
    });
    if (!g) return null;
    return this.computeGroupCosts(g);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private toNum(v: { toNumber: () => number } | number | null | undefined): number {
    if (v == null) return 0;
    return typeof v === 'object' ? v.toNumber() : v;
  }

  private computeGroupCosts(g: {
    totalAmount: { toNumber: () => number } | number;
    shippingAmount?: ({ toNumber: () => number } | number) | null;
    bookEntries: { id: string; bookId?: string; editionId?: string | null; basePrice?: ({ toNumber: () => number } | number) | null }[];
    fees?: { amount: { toNumber: () => number } | number; currency: string }[];
    discounts?: { amount: { toNumber: () => number } | number; currency: string }[];
    refunds?: { amount: { toNumber: () => number } | number; currency: string }[];
    [key: string]: unknown;
  }) {
    const n = g.bookEntries.length || 1;
    const total = this.toNum(g.totalAmount);
    const shipping = g.shippingAmount ? this.toNum(g.shippingAmount) : 0;
    const feesSum = (g.fees ?? []).reduce((acc, f) => acc + this.toNum(f.amount), 0);
    const discountsSum = (g.discounts ?? []).reduce((acc, d) => acc + this.toNum(d.amount), 0);
    const refundsSum = (g.refunds ?? []).reduce((acc, r) => acc + this.toNum(r.amount), 0);

    // Shipping/fees/discounts/refunds are deliberately still split evenly by count — only the
    // base price is a real per-book allocation. See the plan's "out of scope" section.
    const equalBaseShare = total / n;
    const equalExtrasShare = (shipping + feesSum - discountsSum - refundsSum) / n;
    const perBookCost = equalBaseShare + equalExtrasShare;

    const bookEntries = g.bookEntries.map((entry) => {
      const basePrice = entry.basePrice != null ? this.toNum(entry.basePrice) : equalBaseShare;
      return { ...entry, basePrice: Math.round(basePrice * 100) / 100, entryCost: Math.round((basePrice + equalExtrasShare) * 100) / 100 };
    });

    return {
      ...g,
      totalAmount: total,
      shippingAmount: g.shippingAmount ? this.toNum(g.shippingAmount) : null,
      bookEntries,
      bookCount: n,
      perBookCost: Math.round(perBookCost * 100) / 100,
    };
  }
}
