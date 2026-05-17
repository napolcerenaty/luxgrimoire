import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { assertOwnership } from '../../common/utils/assert-ownership.util';
import { recordOwnershipHistory } from '../../common/utils/ownership-history.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseGroupDto, UpdatePurchaseGroupDto, ConfirmSalePurchaseDto } from './purchase-groups.dto';

@Injectable()
export class PurchaseGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGroups(userId: string) {
    const groups = await this.prisma.userPurchaseGroup.findMany({
      where: { userId },
      include: {
        saleAnnouncement: { select: { id: true, title: true } },
        bookEntries: {
          select: { id: true, bookId: true, editionId: true },
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
          select: { id: true, bookId: true, editionId: true },
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

    return this.prisma.$transaction(async (tx) => {
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
  }

  async updateGroup(userId: string, groupId: string, dto: UpdatePurchaseGroupDto) {
    const existing = await this.prisma.userPurchaseGroup.findUnique({ where: { id: groupId } });
    if (!existing) throw new NotFoundException('Purchase group not found');
    assertOwnership(existing.userId, userId);

    return this.prisma.userPurchaseGroup.update({
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
      },
    });
  }

  async confirmSalePurchase(userId: string, announcementId: string, dto: ConfirmSalePurchaseDto) {
    const sale = await this.prisma.saleAnnouncement.findUnique({
      where: { id: announcementId },
      select: { id: true, title: true },
    });
    if (!sale) throw new NotFoundException('Sale announcement not found');

    if (dto.editionIds.length === 0) {
      throw new BadRequestException('At least one edition is required');
    }

    const editions = await this.prisma.bookEdition.findMany({
      where: { id: { in: dto.editionIds } },
      select: { id: true, bookId: true },
    });

    if (editions.length !== dto.editionIds.length) {
      throw new BadRequestException('Some edition IDs are invalid');
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.userPurchaseGroup.create({
        data: {
          userId,
          saleAnnouncementId: announcementId,
          title: sale.title,
          totalAmount: dto.totalAmount,
          currency: dto.currency,
          shippingAmount: dto.shippingAmount ?? null,
          purchasedAt: new Date(dto.purchasedAt),
          notes: dto.notes ?? null,
        },
      });

      const bookEntries = await Promise.all(
        editions.map((edition) =>
          tx.userBookEntry.create({
            data: {
              userId,
              bookId: edition.bookId,
              editionId: edition.id,
              purchaseGroupId: group.id,
              ownershipStatus: 'PREORDER',
            },
          })
        )
      );

      // Record initial ownership history for each entry
      await recordOwnershipHistory(tx, bookEntries, 'PREORDER');

      // Remove interest after confirming purchase
      await tx.userSaleInterest.deleteMany({ where: { userId, announcementId } });

      return { group, bookEntries };
    });
  }

  async createGroupForEntry(userId: string, entryId: string, dto: UpdatePurchaseGroupDto & { totalAmount: number; currency: string; purchasedAt: string }) {
    const entry = await this.prisma.userBookEntry.findUnique({
      where: { id: entryId },
      select: { userId: true, purchaseGroupId: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    assertOwnership(entry.userId, userId);

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.userPurchaseGroup.create({
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
        data: { purchaseGroupId: group.id },
      });
      return group;
    });
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
  }

  // ── Stats helper ─────────────────────────────────────────────────────────────

  /** Get per-book cost info for a single book entry that belongs to a group */
  async getGroupCostForEntry(groupId: string) {
    const g = await this.prisma.userPurchaseGroup.findUnique({
      where: { id: groupId },
      include: {
        bookEntries: { select: { id: true } },
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

  private computeGroupCosts(g: {
    totalAmount: { toNumber: () => number } | number;
    shippingAmount?: ({ toNumber: () => number } | number) | null;
    bookEntries: { id: string; bookId?: string; editionId?: string | null }[];
    fees?: { amount: { toNumber: () => number } | number; currency: string }[];
    discounts?: { amount: { toNumber: () => number } | number; currency: string }[];
    refunds?: { amount: { toNumber: () => number } | number; currency: string }[];
    [key: string]: unknown;
  }) {
    const toNum = (v: { toNumber: () => number } | number) =>
      typeof v === 'object' ? v.toNumber() : v;

    const n = g.bookEntries.length || 1;
    const total = toNum(g.totalAmount);
    const shipping = g.shippingAmount ? toNum(g.shippingAmount) : 0;
    const feesSum = (g.fees ?? []).reduce((acc, f) => acc + toNum(f.amount), 0);
    const discountsSum = (g.discounts ?? []).reduce((acc, d) => acc + toNum(d.amount), 0);
    const refundsSum = (g.refunds ?? []).reduce((acc, r) => acc + toNum(r.amount), 0);

    const perBookCost = (total + shipping + feesSum - discountsSum - refundsSum) / n;

    return {
      ...g,
      totalAmount: total,
      shippingAmount: g.shippingAmount ? toNum(g.shippingAmount) : null,
      bookCount: n,
      perBookCost: Math.round(perBookCost * 100) / 100,
    };
  }
}
