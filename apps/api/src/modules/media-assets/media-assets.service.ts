import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const USAGE_COUNT_SELECT = {
  authorPhotos: true,
  artistPhotos: true,
  companyLogos: true,
  subscriptionCovers: true,
  subscriptionLogos: true,
  seriesCovers: true,
  monthCovers: true,
  monthSpoilers: true,
  saMainImages: true,
  saExtraImages: true,
  editionImages: true,
} as const;

interface UsageCounts {
  authorPhotos: number;
  artistPhotos: number;
  companyLogos: number;
  subscriptionCovers: number;
  subscriptionLogos: number;
  seriesCovers: number;
  monthCovers: number;
  monthSpoilers: number;
  saMainImages: number;
  saExtraImages: number;
  editionImages: number;
}

function normalizePublicId(value: string): string {
  let normalized = value.trim();
  normalized = normalized.replace(/^https?:\/\/res\.cloudinary\.com\/[^/]+\//, '');
  normalized = normalized.replace(/^image\/upload\/(v\d+\/)?/, '');
  const uploadMatch = normalized.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]{2,5})?$/i);
  if (uploadMatch?.[1]) return uploadMatch[1];
  // Strip common image extensions that may remain after URL normalization
  return normalized.replace(/\.[a-z]{2,5}$/i, '');
}

function extractFolder(publicId: string): string | undefined {
  const normalized = normalizePublicId(publicId);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : undefined;
}

@Injectable()
export class MediaAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  private get prismaClient() {
    return this.prisma;
  }

  async upsert(publicId: string, folder?: string, uploadedById?: string) {
    const normalizedPublicId = normalizePublicId(publicId);
    return this.prismaClient.mediaAsset.upsert({
      where: { publicId: normalizedPublicId },
      create: {
        id: randomUUID(),
        publicId: normalizedPublicId,
        folder: folder ?? extractFolder(normalizedPublicId),
        uploadedById,
      },
      update: {
        ...(folder ? { folder } : {}),
        ...(uploadedById ? { uploadedById } : {}),
      },
    });
  }

  async ensureForPublicId(publicIdOrUrl?: string | null, uploadedById?: string) {
    if (!publicIdOrUrl) return null;
    const publicId = normalizePublicId(publicIdOrUrl);
    const existing = await this.findByPublicId(publicId);
    if (existing) return existing;
    return this.upsert(publicId, extractFolder(publicId), uploadedById);
  }

  async findAll(opts: { search?: string; folder?: string; page?: number; pageSize?: number }) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 48;
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (opts.folder) where.folder = opts.folder;
    if (opts.search) {
      where.publicId = { contains: opts.search, mode: 'insensitive' };
    }
    const [data, total] = await Promise.all([
      this.prismaClient.mediaAsset.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prismaClient.mediaAsset.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findFolders(): Promise<string[]> {
    const rows = await this.prismaClient.mediaAsset.findMany({
      select: { folder: true },
      where: { folder: { not: null } },
      distinct: ['folder'],
      orderBy: { folder: 'asc' },
    });
    return rows.map((r: { folder: string | null }) => r.folder!);
  }

  async countUsages(publicId: string): Promise<number> {
    const asset = await this.prismaClient.mediaAsset.findUnique({ where: { publicId: normalizePublicId(publicId) } });
    if (!asset) return 0;
    const id = asset.id;
    const counts = await Promise.all([
      this.prisma.author.count({ where: { photoAssetId: id } }),
      this.prisma.artist.count({ where: { photoAssetId: id } }),
      this.prisma.bookBoxCompany.count({ where: { logoAssetId: id } }),
      this.prisma.subscription.count({ where: { OR: [{ coverImageAssetId: id }, { logoAssetId: id }] } }),
      this.prisma.subscriptionSeries.count({ where: { coverImageAssetId: id } }),
      this.prisma.subscriptionMonth.count({ where: { OR: [{ coverImageAssetId: id }, { spoilerImageAssetId: id }] } }),
      this.prisma.saleAnnouncement.count({ where: { imageAssetId: id } }),
      this.prismaClient.bookEditionMediaAsset.count({ where: { assetId: id } }),
      this.prismaClient.saleAnnouncementMediaAsset.count({ where: { assetId: id } }),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  }

  async deleteIfUnused(publicId: string, uploadService: { deleteImage(publicId: string): Promise<void> }): Promise<{ deleted: boolean }> {
    const normalizedPublicId = normalizePublicId(publicId);
    const usages = await this.countUsages(normalizedPublicId);
    if (usages === 0) {
      await uploadService.deleteImage(normalizedPublicId);
      await this.prismaClient.mediaAsset.deleteMany({ where: { publicId: normalizedPublicId } });
      return { deleted: true };
    }
    return { deleted: false };
  }

  async findByPublicId(publicId: string) {
    return this.prismaClient.mediaAsset.findUnique({ where: { publicId: normalizePublicId(publicId) } });
  }

  async findAllWithUsage(opts: { search?: string; folder?: string; page?: number; pageSize?: number }) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 24;
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (opts.folder) where.folder = opts.folder;
    if (opts.search) {
      where.publicId = { contains: opts.search, mode: 'insensitive' };
    }
    const [rows, total] = await Promise.all([
      this.prismaClient.mediaAsset.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: USAGE_COUNT_SELECT } },
      }),
      this.prismaClient.mediaAsset.count({ where }),
    ]);

    const bookCounts = await Promise.all(
      rows.map((row: { id: string }) =>
        this.prisma.book.count({ where: { editions: { some: { editionImages: { some: { assetId: row.id } } } } } }),
      ),
    );

    const data = rows.map((row: { id: string; publicId: string; folder: string | null; createdAt: Date; _count: UsageCounts }, i: number) => {
      const counts = row._count;
      const otherUsageCount =
        counts.authorPhotos +
        counts.artistPhotos +
        counts.companyLogos +
        counts.subscriptionCovers +
        counts.subscriptionLogos +
        counts.seriesCovers +
        counts.monthCovers +
        counts.monthSpoilers +
        counts.saMainImages +
        counts.saExtraImages;
      const totalUsageCount = otherUsageCount + counts.editionImages;
      return {
        id: row.id,
        publicId: row.publicId,
        folder: row.folder,
        createdAt: row.createdAt,
        bookCount: bookCounts[i],
        otherUsageCount,
        totalUsageCount,
      };
    });

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async remove(id: string, uploadService: { deleteImage(publicId: string): Promise<void> }) {
    const asset = await this.prismaClient.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Media asset not found');
    const result = await this.deleteIfUnused(asset.publicId, uploadService);
    return { ...result, publicId: asset.publicId };
  }
}
