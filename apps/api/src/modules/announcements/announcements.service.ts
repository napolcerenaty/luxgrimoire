import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { CreateSaleAnnouncementDto, UpdateSaleAnnouncementDto } from './announcements.dto';

// Full include — used for public endpoints where book authors/artists are displayed
const editionsInclude = {
  orderBy: { sortOrder: 'asc' as const },
  include: {
    variants: true,
    edition: {
      include: {
        book: {
          include: {
            authors: { include: { author: true } },
          },
        },
        artists: { include: { artist: true } },
      },
    },
  },
};

// Lightweight include — used for admin list; skips authors/artists (not shown in admin SA cards)
const editionsIncludeAdmin = {
  orderBy: { sortOrder: 'asc' as const },
  include: {
    variants: true,
    edition: {
      select: {
        editionName: true,
        additionalImages: true,
        book: {
          select: { id: true, title: true, slug: true },
        },
      },
    },
  },
};

const regionsInclude = {
  orderBy: { createdAt: 'asc' as const },
};

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly uploadService: UploadService,
  ) {}

  private isCloudinaryId(s: string | null | undefined): s is string {
    return !!s && !s.startsWith('http');
  }

  private async deleteCloudinaryImages(ids: (string | null | undefined)[]): Promise<void> {
    const valid = ids.filter(this.isCloudinaryId);
    await Promise.allSettled(valid.map(id => this.uploadService.deleteImage(id)));
  }

  async findAll(query: { page?: number; pageSize?: number; upcoming?: boolean; search?: string }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 200);
    const skip = (page - 1) * pageSize;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Record<string, unknown> = { editions: { some: {} } };
    if (query.upcoming) {
      where.generalSaleDate = { gte: today };
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { company: { name: { contains: term, mode: 'insensitive' } } },
        { editions: { some: { edition: { book: { title: { contains: term, mode: 'insensitive' } } } } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.saleAnnouncement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { generalSaleDate: 'asc' },
        select: {
          id: true,
          title: true,
          imageUrl: true,
          basePrice: true,
          currency: true,
          isBundle: true,
          availableForPurchase: true,
          generalSaleDate: true,
          firstAccessDate: true,
          earlyAccessDate: true,
          company: { select: { name: true, brandColors: true } },
          editions: {
            take: 1,
            orderBy: { sortOrder: 'asc' as const },
            select: {
              edition: { select: { additionalImages: true } },
            },
          },
          regions: {
            select: { id: true, name: true, isDefault: true, firstAccessDate: true, earlyAccessDate: true, generalSaleDate: true },
          },
        },
      }),
      this.prisma.saleAnnouncement.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    const announcement = await this.prisma.saleAnnouncement.findUnique({
      where: { id },
      include: { editions: editionsInclude, regions: regionsInclude },
    });
    if (!announcement) throw new NotFoundException('Sale announcement not found');
    return announcement;
  }

  async adminFindAll(query: { page?: number; pageSize?: number; search?: string; companyId?: string }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 50);
    const skip = (page - 1) * pageSize;

    const where: Prisma.SaleAnnouncementWhereInput = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { company: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.saleAnnouncement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { editions: editionsIncludeAdmin, regions: regionsInclude, company: { select: { id: true, name: true, slug: true, logoUrl: true } } },
      }),
      this.prisma.saleAnnouncement.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async adminAddEdition(id: string, editionId: string) {
    const existing = await this.prisma.saleAnnouncement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sale announcement not found');
    const maxOrder = await this.prisma.saleAnnouncementEdition.aggregate({
      where: { saleId: id },
      _max: { sortOrder: true },
    });
    await this.prisma.saleAnnouncementEdition.upsert({
      where: { saleId_editionId: { saleId: id, editionId } },
      create: { saleId: id, editionId, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
      update: {},
    });
    return this.findById(id);
  }

  async adminRemoveEdition(id: string, editionId: string) {
    await this.prisma.saleAnnouncementEdition.deleteMany({ where: { saleId: id, editionId } });
  }

  async adminSetVariant(
    id: string,
    editionId: string,
    signatureType: 'unsigned' | 'signed' | 'digitally_signed' | 'signed_bookplate',
    price?: number | null,
    currency?: string | null,
  ) {
    const link = await this.prisma.saleAnnouncementEdition.findUnique({
      where: { saleId_editionId: { saleId: id, editionId } },
    });
    if (!link) throw new NotFoundException('Edition not linked to this announcement');
    await this.prisma.saleAnnouncementEditionVariant.upsert({
      where: { saleAnnouncementEditionId_signatureType: { saleAnnouncementEditionId: link.id, signatureType } },
      create: { saleAnnouncementEditionId: link.id, signatureType, price: price ?? null, currency: currency ?? null },
      update: { price: price ?? null, currency: currency ?? null },
    });
    return this.findById(id);
  }

  async adminRemoveVariant(
    id: string,
    editionId: string,
    signatureType: 'unsigned' | 'signed' | 'digitally_signed' | 'signed_bookplate',
  ) {
    const link = await this.prisma.saleAnnouncementEdition.findUnique({
      where: { saleId_editionId: { saleId: id, editionId } },
    });
    if (!link) throw new NotFoundException('Edition not linked to this announcement');
    await this.prisma.saleAnnouncementEditionVariant.deleteMany({
      where: { saleAnnouncementEditionId: link.id, signatureType },
    });
  }

  async create(dto: CreateSaleAnnouncementDto) {
    const { editionIds, extraImages, ...data } = dto;

    const announcement = await this.prisma.saleAnnouncement.create({
      data: {
        title: data.title,
        companyId: data.companyId ?? null,
        generalSaleDate: data.generalSaleDate ? new Date(data.generalSaleDate) : null,
        firstAccessDate: data.firstAccessDate ? new Date(data.firstAccessDate) : null,
        earlyAccessDate: data.earlyAccessDate ? new Date(data.earlyAccessDate) : null,
        saleTimezone: data.saleTimezone ?? null,
        basePrice: data.basePrice ?? null,
        currency: data.currency ?? null,
        imageUrl: data.imageUrl ?? null,
        extraImagesJson: extraImages && extraImages.length > 0 ? extraImages : Prisma.DbNull,
        isBundle: data.isBundle ?? false,
        expectedShipping: data.expectedShipping ?? null,
        photoCredit: data.photoCredit ?? null,
        sourceUrl: data.sourceUrl ?? null,
      },
    });

    if (editionIds && editionIds.length > 0) {
      await this.prisma.saleAnnouncementEdition.createMany({
        data: editionIds.map((editionId, i) => ({
          saleId: announcement.id,
          editionId,
          sortOrder: i,
        })),
        skipDuplicates: true,
      });
    }

    await this.indexSale(announcement.id);
    return this.findById(announcement.id);
  }

  async update(id: string, dto: UpdateSaleAnnouncementDto) {
    const existing = await this.prisma.saleAnnouncement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sale announcement not found');

    const { editionIds, extraImages, ...data } = dto;

    await this.prisma.saleAnnouncement.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.companyId !== undefined && { companyId: data.companyId }),
        ...(data.generalSaleDate !== undefined && {
          generalSaleDate: data.generalSaleDate ? new Date(data.generalSaleDate) : null,
        }),
        ...(data.firstAccessDate !== undefined && {
          firstAccessDate: data.firstAccessDate ? new Date(data.firstAccessDate) : null,
        }),
        ...(data.earlyAccessDate !== undefined && {
          earlyAccessDate: data.earlyAccessDate ? new Date(data.earlyAccessDate) : null,
        }),
        ...(data.saleTimezone !== undefined && { saleTimezone: data.saleTimezone }),
        ...(data.basePrice !== undefined && { basePrice: data.basePrice }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(extraImages !== undefined && {
          extraImagesJson: extraImages.length > 0 ? extraImages : Prisma.DbNull,
        }),
        ...(data.isBundle !== undefined && { isBundle: data.isBundle }),
        ...(data.expectedShipping !== undefined && { expectedShipping: data.expectedShipping || null }),
        ...(data.photoCredit !== undefined && { photoCredit: data.photoCredit || null }),
        ...(data.sourceUrl !== undefined && { sourceUrl: data.sourceUrl || null }),
      },
    });

    // Clean up orphaned Cloudinary images
    const oldExtras: string[] = Array.isArray(existing.extraImagesJson) ? existing.extraImagesJson as string[] : [];
    const newExtras = extraImages ?? oldExtras;
    const removedExtras = oldExtras.filter(img => !newExtras.includes(img));

    void this.deleteCloudinaryImages([
      // Main image replaced or removed
      ...(data.imageUrl !== undefined && data.imageUrl !== existing.imageUrl ? [existing.imageUrl] : []),
      // Extra images removed
      ...removedExtras,
    ]);

    if (editionIds !== undefined) {
      await this.prisma.saleAnnouncementEdition.deleteMany({ where: { saleId: id } });
      if (editionIds.length > 0) {
        await this.prisma.saleAnnouncementEdition.createMany({
          data: editionIds.map((editionId, i) => ({
            saleId: id,
            editionId,
            sortOrder: i,
          })),
          skipDuplicates: true,
        });
      }
    }

    await this.indexSale(id);
    return this.findById(id);
  }

  async delete(id: string) {
    const existing = await this.prisma.saleAnnouncement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sale announcement not found');
    const extraImages: string[] = Array.isArray(existing.extraImagesJson) ? existing.extraImagesJson as string[] : [];
    await this.typesense.deleteDocument('sales', id);
    await this.prisma.saleAnnouncement.delete({ where: { id } });
    void this.deleteCloudinaryImages([existing.imageUrl, ...extraImages]);
  }

  async adminUpsertRegion(saleId: string, data: {
    id?: string;
    name: string;
    countryCodes?: string;
    isDefault?: boolean;
    generalSaleDate?: string | null;
    firstAccessDate?: string | null;
    earlyAccessDate?: string | null;
    endsAt?: string | null;
    saleTimezone?: string | null;
    basePrice?: number | null;
    currency?: string | null;
  }) {
    const { id, ...fields } = data;
    const payload = {
      saleId,
      name: fields.name,
      countryCodes: fields.countryCodes ? JSON.parse(fields.countryCodes) : [],
      isDefault: fields.isDefault ?? false,
      generalSaleDate: fields.generalSaleDate ? new Date(fields.generalSaleDate) : null,
      firstAccessDate: fields.firstAccessDate ? new Date(fields.firstAccessDate) : null,
      earlyAccessDate: fields.earlyAccessDate ? new Date(fields.earlyAccessDate) : null,
      endsAt: fields.endsAt ? new Date(fields.endsAt) : null,
      saleTimezone: fields.saleTimezone ?? null,
      basePrice: fields.basePrice ?? null,
      currency: fields.currency ?? null,
    };
    if (id) {
      return this.prisma.saleAnnouncementRegion.update({ where: { id }, data: payload });
    }
    return this.prisma.saleAnnouncementRegion.create({ data: payload });
  }

  async adminDeleteRegion(saleId: string, regionId: string) {
    await this.prisma.saleAnnouncementRegion.deleteMany({ where: { id: regionId, saleId } });
  }

  private async indexSale(saleId: string): Promise<void> {
    try {
      const sale = await this.prisma.saleAnnouncement.findUnique({
        where: { id: saleId },
        select: {
          id: true,
          title: true,
          generalSaleDate: true,
          company: { select: { name: true, slug: true } },
        },
      });
      if (!sale) return;
      await this.typesense.upsertDocument('sales', {
        id: sale.id,
        title: sale.title,
        companyName: sale.company?.name ?? '',
        companySlug: sale.company?.slug ?? '',
        generalSaleDate: sale.generalSaleDate
          ? Math.floor(new Date(sale.generalSaleDate).getTime() / 1000)
          : undefined,
      });
    } catch (err) {
      this.logger.error(`Failed to index sale ${saleId}`, err);
    }
  }
}
