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

// Blog post content lives in Ghost (a separate CMS/DB) — there's no relation in this DB that
// could ever confirm whether a blog-folder image is still referenced, so the whole folder is
// kept out of the admin Media Library's listing/deletion entirely rather than risk deleting a
// live blog image while it reads as "unused".
const BLOG_FOLDER = 'luxgrimoire/blog';

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
    const normalizedPublicId = normalizePublicId(publicId);
    const asset = await this.prismaClient.mediaAsset.findUnique({ where: { publicId: normalizedPublicId } });
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
      // Community photos (UserEditionImage) store the raw Cloudinary publicId directly —
      // there's no assetId FK, so match by the normalized publicId string instead.
      // TODO: add a proper UserEditionImage.assetId FK to MediaAsset and backfill it, then
      // switch this (and the matching lookup in findAllWithUsage) to a real relation count —
      // string matching is a correctness stopgap, not the long-term fix.
      this.prisma.userEditionImage.count({ where: { cloudinaryId: normalizedPublicId } }),
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

  async findAllWithUsage(opts: {
    search?: string;
    folder?: string;
    page?: number;
    pageSize?: number;
    unusedOnly?: boolean;
  }) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 24;
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (opts.folder) where.folder = opts.folder;
    if (opts.search) {
      where.publicId = { contains: opts.search, mode: 'insensitive' };
    }
    // Explicit OR-with-null rather than relying on `not`'s null semantics, so assets with no
    // folder at all are never accidentally excluded alongside the blog folder.
    const andConditions: any[] = [{ OR: [{ folder: null }, { folder: { not: BLOG_FOLDER } }] }];
    if (opts.unusedOnly) {
      // Pushed into SQL (relation-count filters + a NOT IN against community publicIds) so this
      // stays cheap and paginates correctly, instead of fetching everything and filtering in JS.
      const communityAssets = await this.prisma.userEditionImage.findMany({
        select: { cloudinaryId: true },
        distinct: ['cloudinaryId'],
      });
      andConditions.push(
        { authorPhotos: { none: {} } },
        { artistPhotos: { none: {} } },
        { companyLogos: { none: {} } },
        { subscriptionCovers: { none: {} } },
        { subscriptionLogos: { none: {} } },
        { seriesCovers: { none: {} } },
        { monthCovers: { none: {} } },
        { monthSpoilers: { none: {} } },
        { saMainImages: { none: {} } },
        { saExtraImages: { none: {} } },
        { editionImages: { none: {} } },
        { publicId: { notIn: communityAssets.map((r: { cloudinaryId: string }) => r.cloudinaryId) } },
      );
    }
    where.AND = andConditions;
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

    const [bookCounts, communityImageCounts] = await Promise.all([
      Promise.all(
        rows.map((row: { id: string }) =>
          this.prisma.book.count({ where: { editions: { some: { editionImages: { some: { assetId: row.id } } } } } }),
        ),
      ),
      // Community photos (UserEditionImage) have no assetId FK — match by publicId string.
      Promise.all(
        rows.map((row: { publicId: string }) =>
          this.prisma.userEditionImage.count({ where: { cloudinaryId: row.publicId } }),
        ),
      ),
    ]);

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
        counts.saExtraImages +
        communityImageCounts[i];
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
    if (asset.folder === BLOG_FOLDER) {
      // Defense in depth: blog images are already excluded from findAllWithUsage, but this
      // guards direct-by-id deletion too, since we can never verify usage in Ghost's own DB.
      return { deleted: false, publicId: asset.publicId };
    }
    const result = await this.deleteIfUnused(asset.publicId, uploadService);
    return { ...result, publicId: asset.publicId };
  }
}
