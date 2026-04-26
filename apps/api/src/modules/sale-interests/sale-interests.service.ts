import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SaleInterestsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, announcementId: string, tier: string, regionId?: string | null) {
    return this.prisma.userSaleInterest.upsert({
      where: { userId_announcementId: { userId, announcementId } },
      create: { userId, announcementId, tier, regionId: regionId ?? null },
      update: { tier, regionId: regionId ?? null },
    });
  }

  async remove(userId: string, announcementId: string) {
    await this.prisma.userSaleInterest.deleteMany({
      where: { userId, announcementId },
    });
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
            firstAccessDate: true,
            earlyAccessDate: true,
            generalSaleDate: true,
            saleTimezone: true,
            company: { select: { id: true, name: true, logoUrl: true } },
            regions: {
              select: {
                id: true,
                name: true,
                isDefault: true,
                countryCodes: true,
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
}
