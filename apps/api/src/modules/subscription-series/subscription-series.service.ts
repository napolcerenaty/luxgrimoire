import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSubscriptionSeriesDto,
  UpdateSubscriptionSeriesDto,
  AssignMonthsToSeriesDto,
} from './subscription-series.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { findBySlugOrThrow } from '../../common/prisma.utils';
import { MediaAssetsService } from '../media-assets/media-assets.service';

const SERIES_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  coverImage: true,
  coverImageAsset: { select: { id: true, publicId: true, url: true } },
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAssetsService: MediaAssetsService,
  ) {}

  private mapMonth(month: any) {
    return {
      ...month,
      coverImage: month.coverImageAsset?.url ?? month.coverImage,
    };
  }

  private mapSeries(series: any) {
    return {
      ...series,
      coverImage: series.coverImageAsset?.url ?? series.coverImage,
      months: Array.isArray(series.months) ? series.months.map((month: any) => this.mapMonth(month)) : series.months,
    };
  }

  async findBySubscription(subscriptionId: string) {
    const series = await (this.prisma.subscriptionSeries as any).findMany({
      where: { subscriptionId },
      select: SERIES_SELECT,
      orderBy: [{ startYear: 'asc' }, { startMonth: 'asc' }],
    });
    return series.map((entry: any) => this.mapSeries(entry));
  }

  async findBySubscriptionSlug(subscriptionSlug: string) {
    const sub = await findBySlugOrThrow(this.prisma.subscription, subscriptionSlug, 'Subscription');
    const series = await (this.prisma.subscriptionSeries as any).findMany({
      where: { subscriptionId: sub.id },
      select: {
        ...SERIES_SELECT,
        months: {
          select: {
            id: true,
            year: true,
            month: true,
            theme: true,
            coverImage: true,
            coverImageAsset: { select: { id: true, publicId: true, url: true } },
          },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        },
      },
      orderBy: [{ startYear: 'asc' }, { startMonth: 'asc' }],
    });
    return series.map((entry: any) => this.mapSeries(entry));
  }

  async findBySlug(slug: string) {
    const series = await (this.prisma.subscriptionSeries as any).findUnique({
      where: { slug },
      select: {
        ...SERIES_SELECT,
        months: {
          select: {
            id: true,
            year: true,
            month: true,
            theme: true,
            coverImage: true,
            coverImageAsset: { select: { id: true, publicId: true, url: true } },
          },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        },
      },
    });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);
    return this.mapSeries(series);
  }

  async create(dto: CreateSubscriptionSeriesDto) {
    // Validate sub exists
    const sub = await this.prisma.subscription.findUnique({ where: { id: dto.subscriptionId } });
    if (!sub) throw new NotFoundException('Subscription not found');

    this.validateDateRange(dto.startYear, dto.startMonth, dto.endYear, dto.endMonth);

    const slug = generateSlug(dto.name);
    const coverImageAsset = dto.coverImage ? await this.mediaAssetsService.ensureForPublicId(dto.coverImage) : null;
    const created = await (this.prisma.subscriptionSeries as any).create({
      data: {
        subscriptionId: dto.subscriptionId,
        slug,
        name: dto.name,
        description: dto.description,
        coverImage: dto.coverImage,
        coverImageAssetId: coverImageAsset?.id ?? null,
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
    return this.mapSeries(created);
  }

  async update(slug: string, dto: UpdateSubscriptionSeriesDto) {
    const existing = await this.findBySlug(slug);

    const newStartYear = dto.startYear ?? existing.startYear;
    const newStartMonth = dto.startMonth ?? existing.startMonth;
    const newEndYear = dto.endYear ?? existing.endYear;
    const newEndMonth = dto.endMonth ?? existing.endMonth;
    this.validateDateRange(newStartYear, newStartMonth, newEndYear, newEndMonth);

    const data: Record<string, unknown> = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.startMonth !== undefined && { startMonth: dto.startMonth }),
      ...(dto.startYear !== undefined && { startYear: dto.startYear }),
      ...(dto.endMonth !== undefined && { endMonth: dto.endMonth }),
      ...(dto.endYear !== undefined && { endYear: dto.endYear }),
      ...(dto.skipMode !== undefined && { skipMode: dto.skipMode }),
      ...(dto.canCancelDuring !== undefined && { canCancelDuring: dto.canCancelDuring }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };
    if (dto.coverImage !== undefined) {
      const coverImageAsset = dto.coverImage ? await this.mediaAssetsService.ensureForPublicId(dto.coverImage) : null;
      data.coverImage = dto.coverImage;
      data.coverImageAssetId = coverImageAsset?.id ?? null;
    }

    const updated = await (this.prisma.subscriptionSeries as any).update({
      where: { slug },
      data,
      select: SERIES_SELECT,
    });
    return this.mapSeries(updated);
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    // Detach months before deleting
    await this.prisma.subscriptionMonth.updateMany({
      where: { series: { slug } },
      data: { seriesId: null },
    });
    const deleted = await (this.prisma.subscriptionSeries as any).delete({ where: { slug }, select: SERIES_SELECT });
    return this.mapSeries(deleted);
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
