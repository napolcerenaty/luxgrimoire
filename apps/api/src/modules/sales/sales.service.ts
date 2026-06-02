import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrencyService } from "../currency/currency.service";
import { CrowdStatsService } from "../crowd-stats/crowd-stats.service";
import { StatsService } from '../stats/stats.service';
import { CreateSaleGroupDto, UpdateSaleGroupDto } from "./sales.dto";
import { assertOwnership } from '../../common/utils/assert-ownership.util';
import { recordOwnershipHistory } from '../../common/utils/ownership-history.util';
import { parsePagination } from '../../common/pagination';

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
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
    private readonly crowdStatsService: CrowdStatsService,
    private readonly statsService: StatsService,
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
              fees: { select: { amount: true, currency: true, date: true } },
              discounts: { select: { amount: true, currency: true, date: true } },
              refunds: { select: { amount: true, currency: true, date: true } },
            },
          },
        },
      },
    };
  }

  async getSaleGroups(userId: string, page = 1, pageSize = 20, search?: string) {
    const { skip, take, page: p } = parsePagination({ page, pageSize });
    pageSize = take;
    page = p;
    const where: any = { userId };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { entries: { some: { userBookEntry: { edition: { book: { title: { contains: search, mode: 'insensitive' } } } } } } },
      ];
    }
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
    };  }

  async getSaleGroup(userId: string, groupId: string) {
    const g = await this.prisma.userSaleGroup.findUnique({
      where: { id: groupId },
      include: { entries: { include: this.entryInclude } },
    });
    if (!g) throw new NotFoundException("Sale group not found");
    assertOwnership(g.userId, userId);
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

    const result = await this.prisma.$transaction(async (tx) => {
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

        await recordOwnershipHistory(tx, [{ id: entryId }], 'SOLD', new Date(dto.soldAt));
      }

      return tx.userSaleGroup.findUnique({
        where: { id: group.id },
        include: { entries: { include: this.entryInclude } },
      });
    });

    // Record crowd stats for each edition (non-fatal)
    if (result) {
      const saleGroup = result as unknown as SaleGroupWithEntries;
      const editionIds = [...new Set(
        saleGroup.entries
          .map((e) => (e.userBookEntry as any)?.edition?.id as string | undefined)
          .filter(Boolean) as string[]
      )];
      for (const editionId of editionIds) {
        this.crowdStatsService.rebuildEditionSaleStats(editionId).catch(() => {});
      }
    }

    this.statsService.markStatsStale(userId);
    return result;
  }

  async updateSaleGroup(userId: string, groupId: string, dto: UpdateSaleGroupDto) {
    const existing = await this.prisma.userSaleGroup.findUnique({
      where: { id: groupId },
      include: {
        entries: {
          include: {
            userBookEntry: { include: { edition: { select: { id: true } } } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException("Sale group not found");
    assertOwnership(existing.userId, userId);

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

    const result = await this.prisma.$transaction(async (tx) => {
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

    this.statsService.markStatsStale(userId);

    // Rebuild community sale stats for each affected edition (non-fatal)
    const editionIds = [...new Set(
      existing.entries
        .map((e) => e.userBookEntry?.edition?.id)
        .filter(Boolean) as string[]
    )];
    for (const editionId of editionIds) {
      this.crowdStatsService.rebuildEditionSaleStats(editionId).catch((err) => {
        this.logger.error(`rebuildEditionSaleStats failed for edition ${editionId}: ${err?.message}`);
      });
    }

    return result;
  }

  async deleteSaleGroup(userId: string, groupId: string) {
    const existing = await this.prisma.userSaleGroup.findUnique({ where: { id: groupId } });
    if (!existing) throw new NotFoundException("Sale group not found");
    assertOwnership(existing.userId, userId);

    const saleEntries = await this.prisma.userSaleEntry.findMany({
      where: { saleGroupId: groupId },
      select: {
        userBookEntryId: true,
        allocatedAmount: true,
        userBookEntry: { select: { edition: { select: { id: true } } } },
      },
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

    // Rebuild crowd stats for each affected edition (non-fatal)
    const editionIds = [...new Set(
      saleEntries
        .map((e) => (e as any).userBookEntry?.edition?.id as string | undefined)
        .filter(Boolean) as string[]
    )];
    for (const editionId of editionIds) {
      this.crowdStatsService.rebuildEditionSaleStats(editionId).catch(() => {});
    }

    this.statsService.markStatsStale(userId);
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
          const pgDate = new Date(pg.purchasedAt);

          // Convert items (fees/discounts/refunds) to purchase group currency
          const toPgCur = async (
            amount: number,
            currency: string,
            date: Date,
          ): Promise<number> => {
            if (currency === pg.currency) return amount;
            try {
              return await this.currencyService.convert(amount, currency, pg.currency, date);
            } catch {
              return amount; // fallback: use as-is (matches frontend behaviour)
            }
          };

          const sumItems = async (
            items: Array<{ amount: NumOrDec; currency: string; date: unknown }>,
          ) => {
            let total = 0;
            for (const item of items) {
              const d = item.date ? new Date(item.date as string) : pgDate;
              total += await toPgCur(toNum(item.amount), item.currency, d);
            }
            return total;
          };

          const feesTotal = await sumItems(pg.fees ?? []);
          const discountsTotal = await sumItems(pg.discounts ?? []);
          const refundsTotal = await sumItems(pg.refunds ?? []);

          const rawCost =
            (toNum(pg.totalAmount) + toNum(pg.shippingAmount ?? 0) + feesTotal - discountsTotal - refundsTotal) /
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