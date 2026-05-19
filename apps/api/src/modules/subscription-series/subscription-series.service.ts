import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSubscriptionSeriesDto,
  UpdateSubscriptionSeriesDto,
  AssignMonthsToSeriesDto,
} from './subscription-series.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { findBySlugOrThrow } from '../../common/prisma.utils';

const SERIES_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  coverImage: true,
  startMonth: true,
  startYear: true,
  endMonth: true,
  endYear: true,
  skipMode: true,
  canCancelDuring: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  subscription: { select: { id: true, slug: true, name: true } },
  _count: { select: { months: true } },
};

@Injectable()
export class SubscriptionSeriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySubscription(subscriptionId: string) {
    return this.prisma.subscriptionSeries.findMany({
      where: { subscriptionId },
      select: SERIES_SELECT,
      orderBy: [{ startYear: 'asc' }, { startMonth: 'asc' }],
    });
  }

  async findBySubscriptionSlug(subscriptionSlug: string) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, subscriptionSlug, 'Subscription');
    return this.prisma.subscriptionSeries.findMany({
      where: { subscriptionId: sub.id },
      select: {
        ...SERIES_SELECT,
        months: {
          select: { id: true, year: true, month: true, theme: true, coverImage: true },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        },
      },
      orderBy: [{ startYear: 'asc' }, { startMonth: 'asc' }],
    });
  }

  async findBySlug(slug: string) {
    const series = await this.prisma.subscriptionSeries.findUnique({
      where: { slug },
      select: {
        ...SERIES_SELECT,
        months: {
          select: { id: true, year: true, month: true, theme: true, coverImage: true },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        },
      },
    });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);
    return series;
  }

  async create(dto: CreateSubscriptionSeriesDto) {
    // Validate sub exists
    const sub = await this.prisma.subscription.findUnique({ where: { id: dto.subscriptionId } });
    if (!sub) throw new NotFoundException('Subscription not found');

    this.validateDateRange(dto.startYear, dto.startMonth, dto.endYear, dto.endMonth);

    const slug = generateSlug(dto.name);
    return this.prisma.subscriptionSeries.create({
      data: {
        subscriptionId: dto.subscriptionId,
        slug,
        name: dto.name,
        description: dto.description,
        coverImage: dto.coverImage,
        startMonth: dto.startMonth,
        startYear: dto.startYear,
        endMonth: dto.endMonth,
        endYear: dto.endYear,
        skipMode: dto.skipMode ?? 'INDIVIDUAL',
        canCancelDuring: dto.canCancelDuring ?? true,
        isActive: dto.isActive ?? true,
      },
      select: SERIES_SELECT,
    });
  }

  async update(slug: string, dto: UpdateSubscriptionSeriesDto) {
    const existing = await this.findBySlug(slug);

    const newStartYear = dto.startYear ?? existing.startYear;
    const newStartMonth = dto.startMonth ?? existing.startMonth;
    const newEndYear = dto.endYear ?? existing.endYear;
    const newEndMonth = dto.endMonth ?? existing.endMonth;
    this.validateDateRange(newStartYear, newStartMonth, newEndYear, newEndMonth);

    return this.prisma.subscriptionSeries.update({
      where: { slug },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.coverImage !== undefined && { coverImage: dto.coverImage }),
        ...(dto.startMonth !== undefined && { startMonth: dto.startMonth }),
        ...(dto.startYear !== undefined && { startYear: dto.startYear }),
        ...(dto.endMonth !== undefined && { endMonth: dto.endMonth }),
        ...(dto.endYear !== undefined && { endYear: dto.endYear }),
        ...(dto.skipMode !== undefined && { skipMode: dto.skipMode }),
        ...(dto.canCancelDuring !== undefined && { canCancelDuring: dto.canCancelDuring }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: SERIES_SELECT,
    });
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    // Detach months before deleting
    await this.prisma.subscriptionMonth.updateMany({
      where: { series: { slug } },
      data: { seriesId: null },
    });
    return this.prisma.subscriptionSeries.delete({ where: { slug }, select: SERIES_SELECT });
  }

  async assignMonths(slug: string, dto: AssignMonthsToSeriesDto) {
    const series = await this.findBySlug(slug);

    // Ensure all months belong to the same subscription
    const months = await this.prisma.subscriptionMonth.findMany({
      where: { id: { in: dto.monthIds } },
      select: { id: true, subscriptionId: true, year: true, month: true },
    });

    const wrongSub = months.filter((m) => m.subscriptionId !== series.subscription.id);
    if (wrongSub.length > 0) {
      throw new BadRequestException('Some months do not belong to this subscription');
    }

    // Check months not already assigned to a different series
    const alreadyAssigned = await this.prisma.subscriptionMonth.findMany({
      where: {
        id: { in: dto.monthIds },
        seriesId: { not: null },
        NOT: { seriesId: series.id },
      },
      select: { id: true, year: true, month: true, series: { select: { name: true } } },
    });
    if (alreadyAssigned.length > 0) {
      const conflicts = alreadyAssigned.map((m) => `${m.month}/${m.year} (${m.series?.name})`).join(', ');
      throw new ConflictException(`Months already assigned to another series: ${conflicts}`);
    }

    await this.prisma.subscriptionMonth.updateMany({
      where: { id: { in: dto.monthIds } },
      data: { seriesId: series.id },
    });

    return this.findBySlug(slug);
  }

  async removeMonths(slug: string, dto: AssignMonthsToSeriesDto) {
    await this.findBySlug(slug);
    await this.prisma.subscriptionMonth.updateMany({
      where: { id: { in: dto.monthIds } },
      data: { seriesId: null },
    });
    return this.findBySlug(slug);
  }

  private validateDateRange(startYear: number, startMonth: number, endYear: number, endMonth: number) {
    const start = startYear * 12 + startMonth;
    const end = endYear * 12 + endMonth;
    if (end < start) {
      throw new BadRequestException('End date must be on or after start date');
    }
  }
}
