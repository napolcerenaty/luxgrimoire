import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrencyService } from "../currency/currency.service";
import { CreateSaleGroupDto, UpdateSaleGroupDto } from "./sales.dto";

type Decimal = { toNumber: () => number };
type NumOrDec = number | Decimal;

function toNum(v: NumOrDec): number {
  return typeof v === "object" ? v.toNumber() : v;
}

type SaleGroupWithEntries = {
  id: string;
  userId: string;
  title: string | null;
  totalAmount: NumOrDec;
  currency: string;
  platform: string;
  soldAt: Date;
  notes: string | null;
  priceDistribution: string;
  createdAt: Date;
  updatedAt: Date;
  entries: Array<{
    id: string;
    saleGroupId: string;
    userBookEntryId: string;
    allocatedAmount: NumOrDec;
    userBookEntry: {
      edition?: unknown;
      purchaseGroup?: unknown;
    } | null;
  }>;
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
  ) {}

  private get entryInclude() {
    return {
      userBookEntry: {
        include: {
          edition: {
            include: {
              book: { select: { id: true, title: true, slug: true } },
              bookBoxCompany: { select: { id: true, name: true } },
            },
          },
          purchaseGroup: {
            select: {
              id: true,
              totalAmount: true,
              shippingAmount: true,
              currency: true,
              purchasedAt: true,
              _count: { select: { bookEntries: true } },
            },
          },
        },
      },
    };
  }

  async getSaleGroups(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { userId };
    const [groups, total] = await Promise.all([
      this.prisma.userSaleGroup.findMany({
        where,
        include: { entries: { include: this.entryInclude } },
        orderBy: { soldAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.userSaleGroup.count({ where }),
    ]);
    return {
      data: await Promise.all((groups as unknown as SaleGroupWithEntries[]).map((g) => this.withProfit(g))),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getSaleGroup(userId: string, groupId: string) {
    const g = await this.prisma.userSaleGroup.findUnique({
      where: { id: groupId },
      include: { entries: { include: this.entryInclude } },
    });
    if (!g) throw new NotFoundException("Sale group not found");
    if (g.userId !== userId) throw new ForbiddenException();
    return this.withProfit(g as unknown as SaleGroupWithEntries);
  }

  async createSaleGroup(userId: string, dto: CreateSaleGroupDto) {
    if (dto.entryIds.length === 0) {
      throw new BadRequestException("At least one book entry is required");
    }

    const entries = await this.prisma.userBookEntry.findMany({
      where: { id: { in: dto.entryIds }, userId },
      select: { id: true },
    });

    if (entries.length !== dto.entryIds.length) {
      throw new BadRequestException("Some entry IDs are invalid or not owned by you");
    }

    if (dto.priceDistribution === "CUSTOM") {
      if (!dto.customAmounts) {
        throw new BadRequestException("customAmounts required for CUSTOM distribution");
      }
      for (const id of dto.entryIds) {
        if (dto.customAmounts[id] === undefined) {
          throw new BadRequestException(`Missing customAmount for entry ${id}`);
        }
      }
    }

    const equalAmount = Math.round((dto.totalAmount / dto.entryIds.length) * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.userSaleGroup.create({
        data: {
          userId,
          title: dto.title ?? null,
          totalAmount: dto.totalAmount,
          currency: dto.currency,
          platform: dto.platform,
          soldAt: new Date(dto.soldAt),
          notes: dto.notes ?? null,
          priceDistribution: dto.priceDistribution,
        },
      });

      for (const entryId of dto.entryIds) {
        const allocated =
          dto.priceDistribution === "CUSTOM"
            ? dto.customAmounts![entryId]
            : equalAmount;

        await tx.userSaleEntry.create({
          data: {
            saleGroupId: group.id,
            userBookEntryId: entryId,
            allocatedAmount: allocated,
          },
        });

        await tx.userBookEntry.update({
          where: { id: entryId },
          data: {
            ownershipStatus: "SOLD",
            salePrice: allocated,
            saleCurrency: dto.currency,
            saleDate: dto.soldAt,
            saleVenue: dto.platform,
          },
        });

        await tx.ownershipStatusHistory.create({
          data: { userBookEntryId: entryId, status: "SOLD" },
        });
      }

      return tx.userSaleGroup.findUnique({
        where: { id: group.id },
        include: { entries: { include: this.entryInclude } },
      });
    });
  }

  async updateSaleGroup(userId: string, groupId: string, dto: UpdateSaleGroupDto) {
    const existing = await this.prisma.userSaleGroup.findUnique({
      where: { id: groupId },
      include: { entries: true },
    });
    if (!existing) throw new NotFoundException("Sale group not found");
    if (existing.userId !== userId) throw new ForbiddenException();

    const hasCustomAmounts = dto.customAmounts && Object.keys(dto.customAmounts).length > 0;

    // If customAmounts provided, derive total from their sum (unless explicitly set)
    const customTotal = hasCustomAmounts
      ? Object.values(dto.customAmounts!).reduce((a, b) => a + b, 0)
      : undefined;

    const newTotal = dto.totalAmount ?? customTotal ?? toNum(existing.totalAmount as any);
    const count = existing.entries.length;
    const equalAmount = count > 0 ? Math.round((newTotal / count) * 100) / 100 : 0;

    const shouldRedistribute =
      (dto.totalAmount !== undefined && dto.totalAmount !== toNum(existing.totalAmount as any)) ||
      hasCustomAmounts;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.userSaleGroup.update({
        where: { id: groupId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...((dto.totalAmount !== undefined || hasCustomAmounts) && { totalAmount: newTotal }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...(dto.platform !== undefined && { platform: dto.platform }),
          ...(dto.soldAt !== undefined && { soldAt: new Date(dto.soldAt) }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
        include: { entries: { include: this.entryInclude } },
      });

      if (shouldRedistribute && count > 0) {
        const oldTotal = toNum(existing.totalAmount as any);
        for (const entry of existing.entries) {
          const oldAlloc = toNum(entry.allocatedAmount as any);
          let newAlloc: number;
          if (hasCustomAmounts && dto.customAmounts![entry.id] !== undefined) {
            newAlloc = dto.customAmounts![entry.id];
          } else if (existing.priceDistribution === 'EQUAL') {
            newAlloc = equalAmount;
          } else {
            newAlloc =
              oldTotal > 0
                ? Math.round((oldAlloc / oldTotal) * newTotal * 100) / 100
                : equalAmount;
          }
          await tx.userSaleEntry.update({
            where: { id: entry.id },
            data: { allocatedAmount: newAlloc },
          });
          await tx.userBookEntry.update({
            where: { id: entry.userBookEntryId },
            data: {
              salePrice: newAlloc,
              ...(dto.currency !== undefined && { saleCurrency: dto.currency }),
              ...(dto.soldAt !== undefined && { saleDate: dto.soldAt }),
              ...(dto.platform !== undefined && { saleVenue: dto.platform }),
            },
          });
        }
      } else if (
        dto.currency !== undefined ||
        dto.soldAt !== undefined ||
        dto.platform !== undefined
      ) {
        for (const entry of existing.entries) {
          await tx.userBookEntry.update({
            where: { id: entry.userBookEntryId },
            data: {
              ...(dto.currency !== undefined && { saleCurrency: dto.currency }),
              ...(dto.soldAt !== undefined && { saleDate: dto.soldAt }),
              ...(dto.platform !== undefined && { saleVenue: dto.platform }),
            },
          });
        }
      }

      return updated;
    });
  }

  async deleteSaleGroup(userId: string, groupId: string) {
    const existing = await this.prisma.userSaleGroup.findUnique({ where: { id: groupId } });
    if (!existing) throw new NotFoundException("Sale group not found");
    if (existing.userId !== userId) throw new ForbiddenException();

    const saleEntries = await this.prisma.userSaleEntry.findMany({
      where: { saleGroupId: groupId },
      select: { userBookEntryId: true },
    });

    await this.prisma.userBookEntry.updateMany({
      where: { id: { in: saleEntries.map((e) => e.userBookEntryId) } },
      data: {
        ownershipStatus: "OWNED",
        salePrice: null,
        saleCurrency: null,
        saleDate: null,
        saleVenue: null,
      },
    });

    await this.prisma.userSaleGroup.delete({ where: { id: groupId } });
  }

  private async withProfit(g: SaleGroupWithEntries) {
    const totalSale = toNum(g.totalAmount);
    const saleCurrency = g.currency;
    const soldAt = g.soldAt;

    let totalPurchaseCostInSaleCurrency = 0;
    let allHavePurchaseCost = true;

    const enrichedEntries = await Promise.all(
      g.entries.map(async (e) => {
        const pg = (e.userBookEntry as any)?.purchaseGroup;
        let purchaseCostInSaleCurrency: number | null = null;

        if (pg && pg.totalAmount != null) {
          const bookCount = pg._count?.bookEntries ?? 1;
          const rawCost =
            (toNum(pg.totalAmount) + toNum(pg.shippingAmount ?? 0)) /
            Math.max(bookCount, 1);

          try {
            purchaseCostInSaleCurrency = await this.currencyService.convert(
              rawCost,
              pg.currency,
              saleCurrency,
              new Date(soldAt),
            );
          } catch {
            purchaseCostInSaleCurrency = null;
          }
        } else {
          allHavePurchaseCost = false;
        }

        if (purchaseCostInSaleCurrency == null) allHavePurchaseCost = false;
        else totalPurchaseCostInSaleCurrency += purchaseCostInSaleCurrency;

        return {
          ...e,
          allocatedAmount: toNum(e.allocatedAmount),
          purchaseCostInSaleCurrency,
        };
      }),
    );

    return {
      ...g,
      totalAmount: totalSale,
      totalPurchaseCost: allHavePurchaseCost
        ? Math.round(totalPurchaseCostInSaleCurrency * 100) / 100
        : null,
      profitLoss: allHavePurchaseCost
        ? Math.round((totalSale - totalPurchaseCostInSaleCurrency) * 100) / 100
        : null,
      entries: enrichedEntries,
    };
  }
}