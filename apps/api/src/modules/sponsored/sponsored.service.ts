import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SponsoredSlotType } from '@prisma/client';
import { CreateSponsoredSlotDto, UpdateSponsoredSlotDto } from './sponsored.dto';

@Injectable()
export class SponsoredService {
  constructor(private readonly prisma: PrismaService) {}

  getActiveSlots(slotType?: string) {
    const now = new Date();
    return this.prisma.sponsoredSlot.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        ...(slotType ? { type: slotType as SponsoredSlotType } : {}),
      },
      include: { company: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  async getAllSlots(page = 1, pageSize = 20) {
    const skip = (page - 1) * Math.min(pageSize, 100);
    const take = Math.min(pageSize, 100);
    const [data, total] = await Promise.all([
      this.prisma.sponsoredSlot.findMany({
        skip,
        take,
        include: { company: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sponsoredSlot.count(),
    ]);
    return { data, total, page, pageSize: take, totalPages: Math.ceil(total / take) };
  }

  async getSlotById(id: string) {
    const slot = await this.prisma.sponsoredSlot.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!slot) throw new NotFoundException(`Sponsored slot '${id}' not found`);
    return slot;
  }

  createSlot(dto: CreateSponsoredSlotDto) {
    return this.prisma.sponsoredSlot.create({
      data: {
        companyId: dto.companyId,
        type: dto.slotType as SponsoredSlotType,
        startsAt: new Date(dto.startDate),
        endsAt: new Date(dto.endDate),
        priceEur: dto.priceCharged ?? 0,
        notes: dto.notes,
      },
      include: { company: true },
    });
  }

  async updateSlot(id: string, dto: UpdateSponsoredSlotDto) {
    await this.getSlotById(id);
    return this.prisma.sponsoredSlot.update({
      where: { id },
      data: {
        ...(dto.startDate !== undefined ? { startsAt: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endsAt: new Date(dto.endDate) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.priceCharged !== undefined ? { priceEur: dto.priceCharged } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: { company: true },
    });
  }

  async deleteSlot(id: string) {
    await this.getSlotById(id);
    return this.prisma.sponsoredSlot.delete({ where: { id } });
  }

  getSlotsByCompany(companyId: string) {
    return this.prisma.sponsoredSlot.findMany({
      where: { companyId },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRevenueStats() {
    const [revenueAgg, activeCount, allSlots] = await Promise.all([
      this.prisma.sponsoredSlot.aggregate({ _sum: { priceEur: true } }),
      this.prisma.sponsoredSlot.count({ where: { isActive: true } }),
      this.prisma.sponsoredSlot.findMany({ select: { type: true } }),
    ]);

    const totalRevenue = Number(revenueAgg._sum.priceEur ?? 0);
    const slotsByType = allSlots.reduce<Record<string, number>>((acc, s) => {
      acc[s.type] = (acc[s.type] ?? 0) + 1;
      return acc;
    }, {});

    return { totalRevenue, activeSlots: activeCount, slotsByType };
  }
}
