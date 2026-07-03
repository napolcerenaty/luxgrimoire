import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, SaleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { CreateSaleAnnouncementDto, UpdateSaleAnnouncementDto, UpsertSaleAnnouncementItemDto } from './announcements.dto';
import { deleteCloudinaryImages } from '../../common/cloudinary.helper';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { ScheduledRemindersService } from '../notifications/scheduled-reminders.service';

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
        bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
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
    private readonly mediaAssetsService: MediaAssetsService,
    @Optional() private readonly scheduledReminders?: ScheduledRemindersService,
  ) {}

  private async deleteCloudinaryImages(ids: (string | null | undefined)[]): Promise<void> {
    await deleteCloudinaryImages(ids, this.uploadService);
  }

  private mapAnnouncementAssets(announcement: any) {
    if (!announcement) return announcement;
    return {
      ...announcement,
      imageUrl: announcement.imageAsset?.publicId ?? announcement.imageUrl,
    };
  }

  private async syncExtraImageAssets(announcementId: string, extraImages: string[]) {
    await (this.prisma as any).saleAnnouncementMediaAsset.deleteMany({ where: { announcementId } });
    if (!extraImages.length) return;

    const rows = await Promise.all(extraImages.map(async (publicId, sortOrder) => {
      const asset = await this.mediaAssetsService.ensureForPublicId(publicId);
      return asset ? { announcementId, assetId: asset.id, sortOrder } : null;
    }));
    const data = rows.filter(Boolean);
    if (data.length > 0) {
      await (this.prisma as any).saleAnnouncementMediaAsset.createMany({
        data,
        skipDuplicates: true,
      });
    }
  }

  async findAll(query: { page?: number; pageSize?: number; upcoming?: boolean; search?: string; sort?: 'date' | 'recent'; companyId?: string; dateFrom?: string; dateTo?: string; saleType?: SaleType }) {
    const { skip, take: pageSize, page } = parsePagination({ page: query.page, pageSize: query.pageSize ?? 20 });

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    // OVERSTOCK and SALE are visible without linked editions; other types require at least one
    const andConditions: Prisma.SaleAnnouncementWhereInput[] = [{
      OR: [
        { editions: { some: {} } },
        { saleType: { in: ['OVERSTOCK', 'SALE'] } },
      ],
    }];

    // saleType filter
    if (query.saleType) {
      andConditions.push({ saleType: query.saleType });
    }

    // Date range filter — any of FA, EA, GS falls in [dateFrom, dateTo]
    if (query.dateFrom || query.dateTo) {
      const from = query.dateFrom ? new Date(query.dateFrom) : undefined;
      const to = query.dateTo ? new Date(query.dateTo) : undefined;
      const dateFilter: Prisma.DateTimeNullableFilter = {};
      if (from) dateFilter.gte = from;
      if (to) dateFilter.lte = to;
      andConditions.push({
        OR: [
          { firstAccessDate: dateFilter },
          { earlyAccessDate: dateFilter },
          { generalSaleDate: dateFilter },
          { regions: { some: { OR: [{ firstAccessDate: dateFilter }, { earlyAccessDate: dateFilter }, { generalSaleDate: dateFilter }] } } },
        ],
      });
    } else if (query.upcoming) {
      // "upcoming/active" logic differs per sale type.
      // When no saleType filter: show all types that are currently active.
      const typeFilter = query.saleType ?? null;
      const activeSaleCondition: Prisma.SaleAnnouncementWhereInput[] = [];

      // LIMITED_PREORDER / OVERSTOCK: active when any date is today or upcoming,
      // OR when an explicit endsAt is set and still in the future.
      // Rule: no endsAt = expires at end of generalSaleDate day (so only show if date >= today).
      const lpOrOsActive: Prisma.SaleAnnouncementWhereInput = {
        OR: [
          { generalSaleDate: { gte: today } },  // upcoming or live today
          { earlyAccessDate: { gte: today } },
          { firstAccessDate: { gte: today } },
          { regions: { some: { OR: [{ generalSaleDate: { gte: today } }, { earlyAccessDate: { gte: today } }, { firstAccessDate: { gte: today } }] } } },
          { endsAt: { gt: now } },               // explicit end date still in the future
        ],
      };

      if (!typeFilter || typeFilter === 'LIMITED_PREORDER') {
        activeSaleCondition.push({ AND: [{ saleType: 'LIMITED_PREORDER' }, lpOrOsActive] });
      }

      if (!typeFilter || typeFilter === 'OPEN_PREORDER') {
        // Open preorder: runs indefinitely once started — only expires when endsAt is set
        activeSaleCondition.push({
          AND: [
            { saleType: 'OPEN_PREORDER' },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        });
      }

      if (!typeFilter || typeFilter === 'OVERSTOCK') {
        activeSaleCondition.push({ AND: [{ saleType: 'OVERSTOCK' }, lpOrOsActive] });
      }

      if (!typeFilter || typeFilter === 'SALE') {
        activeSaleCondition.push({ AND: [{ saleType: 'SALE' }, lpOrOsActive] });
      }

      andConditions.push({ OR: activeSaleCondition });
    }

    if (query.search) {
      const term = query.search.trim();
      andConditions.push({ title: { contains: term, mode: 'insensitive' } });
    }
    if (query.companyId) {
      andConditions.push({ companyId: query.companyId });
    }

    const where: Prisma.SaleAnnouncementWhereInput = andConditions.length === 1 ? andConditions[0] : { AND: andConditions };

    const [data, total] = await Promise.all([
      (this.prisma.saleAnnouncement as any).findMany({
        where,
        skip,
        take: pageSize,
        orderBy: query.sort === 'date' ? { generalSaleDate: 'asc' } : { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          imageUrl: true,
          imageAsset: { select: { id: true, publicId: true } },
          basePrice: true,
          subscriberBasePrice: true,
          currency: true,
          availableForPurchase: true,
          generalSaleDate: true,
          firstAccessDate: true,
          earlyAccessDate: true,
          endsAt: true,
          saleType: true,
          isSoldOut: true,
          isBundle: true,
          notes: true,
          company: { select: { name: true, slug: true, brandColors: true } },
          editions: {
            take: 1,
            orderBy: { sortOrder: 'asc' as const },
            select: {
              edition: { select: { additionalImages: true } },
            },
          },
          regions: {
            select: { id: true, name: true, isDefault: true, firstAccessDate: true, earlyAccessDate: true, generalSaleDate: true, endsAt: true, isSoldOut: true, countryCodes: true, currency: true },
          },
        },
      }),
      this.prisma.saleAnnouncement.count({ where }),
    ]);

    return { data: data.map((item: any) => this.mapAnnouncementAssets(item)), ...buildPageMeta(total, page, pageSize) };
  }

  async findById(id: string) {
    const announcement = await (this.prisma.saleAnnouncement as any).findUnique({
      where: { id },
      include: {
        imageAsset: { select: { id: true, publicId: true } },
        editions: {
          ...editionsInclude,
          include: { ...editionsInclude.include, item: { select: { id: true, name: true } } },
        },
        items: { orderBy: { sortOrder: 'asc' as const } },
        regions: regionsInclude,
        company: { select: { name: true, slug: true, brandColors: true } },
      },
    });
    if (!announcement) throw new NotFoundException('Sale announcement not found');
    return this.mapAnnouncementAssets(announcement);
  }

  async findTrending(limit = 6) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 24)) : 6;
    const grouped = await this.prisma.userSaleInterest.groupBy({
      by: ['announcementId'],
      _count: { announcementId: true },
      orderBy: { _count: { announcementId: 'desc' } },
      take: safeLimit,
    });

    if (grouped.length === 0) return [];

    const ids = grouped.map((item) => item.announcementId);
    const announcements = await (this.prisma.saleAnnouncement as any).findMany({
      where: {
        id: { in: ids },
        generalSaleDate: { gte: new Date() },
      },
      include: {
        editions: editionsInclude,
        company: { select: { name: true, slug: true, brandColors: true } },
      },
    });

    const countsById = new Map(grouped.map((item, index) => [
      item.announcementId,
      { count: item._count.announcementId, index },
    ]));

    const result: any[] = announcements
      .map((announcement: any) => {
        const meta = countsById.get(announcement.id);
        if (!meta) return null;
        return {
          ...announcement,
          interestCount: meta.count,
        };
      })
      .filter((announcement: any) => Boolean(announcement));

    return result.sort((a, b) => countsById.get(a.id)!.index - countsById.get(b.id)!.index);
  }

  async adminFindAll(query: { page?: number; pageSize?: number; search?: string; companyId?: string }) {
    const { skip, take: pageSize, page } = parsePagination({ page: query.page, pageSize: query.pageSize ?? 10 });

    const where: Prisma.SaleAnnouncementWhereInput = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { company: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      (this.prisma.saleAnnouncement as any).findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          imageAsset: { select: { id: true, publicId: true } },
          editions: editionsIncludeAdmin,
          regions: regionsInclude,
          items: { orderBy: { sortOrder: 'asc' as const } },
          company: { select: { id: true, name: true, slug: true, logoUrl: true } },
        },
      }),
      this.prisma.saleAnnouncement.count({ where }),
    ]);

    return { data: data.map((item: any) => this.mapAnnouncementAssets(item)), ...buildPageMeta(total, page, pageSize) };
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
    signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped',
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

  async adminSetReprint(id: string, editionId: string, isReprint: boolean) {
    const link = await this.prisma.saleAnnouncementEdition.findUnique({
      where: { saleId_editionId: { saleId: id, editionId } },
    });
    if (!link) throw new NotFoundException('Edition not linked to this announcement');
    await this.prisma.saleAnnouncementEdition.update({
      where: { id: link.id },
      data: { isReprint },
    });
    return this.findById(id);
  }

  async adminSetStandalone(id: string, editionId: string, isStandalone: boolean) {
    const link = await this.prisma.saleAnnouncementEdition.findUnique({
      where: { saleId_editionId: { saleId: id, editionId } },
    });
    if (!link) throw new NotFoundException('Edition not linked to this announcement');
    await this.prisma.saleAnnouncementEdition.update({
      where: { id: link.id },
      data: { isStandalone },
    });
    return this.findById(id);
  }

  async adminSetAllReprint(id: string, isReprint: boolean) {
    const existing = await this.prisma.saleAnnouncement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sale announcement not found');
    await this.prisma.saleAnnouncementEdition.updateMany({
      where: { saleId: id },
      data: { isReprint },
    });
    return this.findById(id);
  }

  async adminRemoveVariant(
    id: string,
    editionId: string,
    signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped',
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
    const imageAsset = data.imageUrl ? await this.mediaAssetsService.ensureForPublicId(data.imageUrl) : null;

    const announcement = await (this.prisma.saleAnnouncement as any).create({
      data: {
        title: data.title,
        companyId: data.companyId ?? null,
        generalSaleDate: data.generalSaleDate ? new Date(data.generalSaleDate) : null,
        firstAccessDate: data.firstAccessDate ? new Date(data.firstAccessDate) : null,
        earlyAccessDate: data.earlyAccessDate ? new Date(data.earlyAccessDate) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        saleType: data.saleType ?? 'LIMITED_PREORDER',
        isSoldOut: data.isSoldOut ?? false,
        notes: data.notes ?? null,
        saleTimezone: data.saleTimezone ?? null,
        basePrice: data.basePrice ?? null,
        currency: data.currency ?? null,
        subscriberBasePrice: data.subscriberBasePrice ?? null,
        imageUrl: data.imageUrl ?? null,
        imageAssetId: imageAsset?.id ?? null,
        extraImagesJson: extraImages && extraImages.length > 0 ? extraImages : Prisma.DbNull,
        isBundle: data.isBundle ?? false,
        expectedShipping: data.expectedShipping ?? null,
        photoCredit: data.photoCredit ?? null,
        sourceUrl: data.sourceUrl ?? null,
      },
    });
    await this.syncExtraImageAssets(announcement.id, extraImages ?? []);

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
    const updateData: Record<string, unknown> = {
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
      ...(data.endsAt !== undefined && {
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
      }),
      ...(data.saleType !== undefined && { saleType: data.saleType }),
      ...(data.isSoldOut !== undefined && { isSoldOut: data.isSoldOut }),
      ...(data.notes !== undefined && { notes: data.notes ?? null }),
      ...(data.saleTimezone !== undefined && { saleTimezone: data.saleTimezone }),
      ...(data.basePrice !== undefined && { basePrice: data.basePrice }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.subscriberBasePrice !== undefined && { subscriberBasePrice: data.subscriberBasePrice }),
      ...(extraImages !== undefined && {
        extraImagesJson: extraImages.length > 0 ? extraImages : Prisma.DbNull,
      }),
      ...(data.isBundle !== undefined && { isBundle: data.isBundle }),
      ...(data.expectedShipping !== undefined && { expectedShipping: data.expectedShipping || null }),
      ...(data.photoCredit !== undefined && { photoCredit: data.photoCredit || null }),
      ...(data.sourceUrl !== undefined && { sourceUrl: data.sourceUrl || null }),
    };
    if (data.imageUrl !== undefined) {
      const imageAsset = data.imageUrl ? await this.mediaAssetsService.ensureForPublicId(data.imageUrl) : null;
      updateData.imageUrl = data.imageUrl;
      updateData.imageAssetId = imageAsset?.id ?? null;
    }

    await (this.prisma.saleAnnouncement as any).update({
      where: { id },
      data: updateData,
    });
    // If dates changed, recalculate all pending sale reminders for this announcement
    const dateChanged = data.generalSaleDate !== undefined || data.firstAccessDate !== undefined || data.earlyAccessDate !== undefined || data.endsAt !== undefined;
    if (dateChanged) {
      this.scheduledReminders?.recalculateForAnnouncement(id).catch(() => {});
    }
    if (extraImages !== undefined) {
      await this.syncExtraImageAssets(id, extraImages);
    }

    // Clean up orphaned Cloudinary images — only if no other model still references them
    const oldExtras: string[] = Array.isArray(existing.extraImagesJson) ? existing.extraImagesJson as string[] : [];
    const newExtras = extraImages ?? oldExtras;
    const removedExtras = oldExtras.filter(img => !newExtras.includes(img));

    const toMaybeDelete: (string | null | undefined)[] = [
      // Main image replaced or removed
      ...(data.imageUrl !== undefined && data.imageUrl !== existing.imageUrl ? [existing.imageUrl] : []),
      // Extra images removed
      ...removedExtras,
    ];
    void Promise.allSettled(
      toMaybeDelete
        .filter((id): id is string => !!id && !id.startsWith('http'))
        .map(id => this.mediaAssetsService.deleteIfUnused(id, this.uploadService)),
    );

    if (editionIds !== undefined) {
      // Only remove editions no longer in the list (preserves variants on kept editions)
      await this.prisma.saleAnnouncementEdition.deleteMany({
        where: { saleId: id, editionId: { notIn: editionIds } },
      });
      // Add new editions (skip those already present)
      if (editionIds.length > 0) {
        const existing = await this.prisma.saleAnnouncementEdition.findMany({
          where: { saleId: id },
          select: { editionId: true },
        });
        const existingIds = new Set(existing.map(e => e.editionId));
        const toAdd = editionIds.filter(eid => !existingIds.has(eid));
        if (toAdd.length > 0) {
          await this.prisma.saleAnnouncementEdition.createMany({
            data: toAdd.map((editionId, i) => ({
              saleId: id,
              editionId,
              sortOrder: existingIds.size + i,
            })),
            skipDuplicates: true,
          });
        }
        // Update sort order for all editions to match new ordering
        await Promise.all(
          editionIds.map((editionId, i) =>
            this.prisma.saleAnnouncementEdition.updateMany({
              where: { saleId: id, editionId },
              data: { sortOrder: i },
            }),
          ),
        );
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

  async duplicate(id: string) {
    const source = await (this.prisma.saleAnnouncement as any).findUnique({
      where: { id },
      include: {
        editions: { include: { variants: true }, orderBy: { sortOrder: 'asc' } },
        regions: { orderBy: { createdAt: 'asc' } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!source) throw new NotFoundException('Sale announcement not found');

    const copy = await (this.prisma.saleAnnouncement as any).create({
      data: {
        title: `${source.title} (Copy)`,
        companyId: source.companyId,
        generalSaleDate: source.generalSaleDate,
        firstAccessDate: source.firstAccessDate,
        earlyAccessDate: source.earlyAccessDate,
        endsAt: source.endsAt,
        saleType: source.saleType,
        isSoldOut: false,
        notes: source.notes,
        saleTimezone: source.saleTimezone,
        basePrice: source.basePrice,
        currency: source.currency,
        subscriberBasePrice: source.subscriberBasePrice,
        imageUrl: source.imageUrl,
        imageAssetId: source.imageAssetId,
        extraImagesJson: source.extraImagesJson ?? Prisma.DbNull,
        isBundle: source.isBundle,
        availableForPurchase: false,
        expectedShipping: source.expectedShipping,
        photoCredit: source.photoCredit,
        sourceUrl: source.sourceUrl,
      },
    });
    const sourceExtraImages = Array.isArray(source.extraImagesJson) ? source.extraImagesJson as string[] : [];
    await this.syncExtraImageAssets(copy.id, sourceExtraImages);

    // Copy items and build old→new item id map
    const itemIdMap = new Map<string, string>();
    for (const item of (source.items ?? [])) {
      const newItem = await (this.prisma as any).saleAnnouncementItem.create({
        data: { saleId: copy.id, name: item.name, sortOrder: item.sortOrder },
      });
      itemIdMap.set(item.id, newItem.id);
    }

    for (const edition of source.editions) {
      const newEdition = await this.prisma.saleAnnouncementEdition.create({
        data: {
          saleId: copy.id,
          editionId: edition.editionId,
          sortOrder: edition.sortOrder,
          isReprint: edition.isReprint,
          itemId: edition.itemId ? (itemIdMap.get(edition.itemId) ?? null) : null,
        },
      });
      if (edition.variants.length > 0) {
        await this.prisma.saleAnnouncementEditionVariant.createMany({
          data: edition.variants.map((v: any) => ({
            saleAnnouncementEditionId: newEdition.id,
            signatureType: v.signatureType,
            price: v.price,
            currency: v.currency,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (source.regions.length > 0) {
      await this.prisma.saleAnnouncementRegion.createMany({
        data: source.regions.map((r: any) => ({
          saleId: copy.id,
          name: r.name,
          countryCodes: r.countryCodes as Prisma.InputJsonValue,
          isDefault: r.isDefault,
          generalSaleDate: r.generalSaleDate,
          firstAccessDate: r.firstAccessDate,
          earlyAccessDate: r.earlyAccessDate,
          endsAt: r.endsAt,
          isSoldOut: false,
          saleTimezone: r.saleTimezone,
          basePrice: r.basePrice,
          currency: r.currency,
          subscriberBasePrice: r.subscriberBasePrice,
        })),
      });
    }

    await this.indexSale(copy.id);
    return this.findById(copy.id);
  }

  async adminAssignEditionToItem(saleId: string, editionId: string, itemId: string | null) {
    const link = await this.prisma.saleAnnouncementEdition.findUnique({
      where: { saleId_editionId: { saleId, editionId } },
    });
    if (!link) throw new NotFoundException('Edition not linked to this announcement');
    await this.prisma.saleAnnouncementEdition.update({
      where: { id: link.id },
      data: { itemId },
    });
    return this.findById(saleId);
  }

  async adminCreateItem(saleId: string, dto: UpsertSaleAnnouncementItemDto) {
    const existing = await this.prisma.saleAnnouncement.findUnique({ where: { id: saleId } });
    if (!existing) throw new NotFoundException('Sale announcement not found');
    const maxOrder = await (this.prisma as any).saleAnnouncementItem.aggregate({
      where: { saleId },
      _max: { sortOrder: true },
    });
    return (this.prisma as any).saleAnnouncementItem.create({
      data: {
        saleId,
        name: dto.name ?? null,
        sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async adminUpdateItem(saleId: string, itemId: string, dto: UpsertSaleAnnouncementItemDto) {
    const item = await (this.prisma as any).saleAnnouncementItem.findFirst({ where: { id: itemId, saleId } });
    if (!item) throw new NotFoundException('Item not found');
    return (this.prisma as any).saleAnnouncementItem.update({
      where: { id: itemId },
      data: {
        ...(dto.name !== undefined && { name: dto.name ?? null }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async adminDeleteItem(saleId: string, itemId: string) {
    const item = await (this.prisma as any).saleAnnouncementItem.findFirst({ where: { id: itemId, saleId } });
    if (!item) throw new NotFoundException('Item not found');
    // Unlink editions from this item before deleting
    await this.prisma.saleAnnouncementEdition.updateMany({
      where: { saleId, itemId },
      data: { itemId: null },
    });
    await (this.prisma as any).saleAnnouncementItem.delete({ where: { id: itemId } });
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
    isSoldOut?: boolean;
    saleTimezone?: string | null;
    basePrice?: number | null;
    currency?: string | null;
    subscriberBasePrice?: number | null;
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
      isSoldOut: fields.isSoldOut ?? false,
      saleTimezone: fields.saleTimezone ?? null,
      basePrice: fields.basePrice ?? null,
      currency: fields.currency ?? null,
      subscriberBasePrice: fields.subscriberBasePrice ?? null,
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
