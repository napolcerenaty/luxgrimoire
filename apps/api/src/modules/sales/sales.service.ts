import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
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
    } | null;
  }>;
};

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

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
      data: (groups as unknown as SaleGroupWithEntries[]).map((g) => this.withProfit(g)),
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
    const existing = await this.prisma.userSaleGroup.findUnique({ where: { id: groupId } });
    if (!existing) throw new NotFoundException("Sale group not found");
    if (existing.userId !== userId) throw new ForbiddenException();

    return this.prisma.userSaleGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.totalAmount !== undefined && { totalAmount: dto.totalAmount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.platform !== undefined && { platform: dto.platform }),
        ...(dto.soldAt !== undefined && { soldAt: new Date(dto.soldAt) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { entries: { include: this.entryInclude } },
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

  private withProfit(g: SaleGroupWithEntries) {
    const totalSale = toNum(g.totalAmount);

    return {
      ...g,
      totalAmount: totalSale,
      totalPurchaseCost: null,
      profitLoss: null,
      entries: g.entries.map((e) => ({
        ...e,
        allocatedAmount: toNum(e.allocatedAmount),
      })),
    };
  }
}