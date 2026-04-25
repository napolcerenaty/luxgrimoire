import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSaleAnnouncementDto, UpdateSaleAnnouncementDto } from './announcements.dto';

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

const regionsInclude = {
  orderBy: { createdAt: 'asc' as const },
};

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { page?: number; pageSize?: number; upcoming?: boolean }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 50);
    const skip = (page - 1) * pageSize;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Record<string, unknown> = { editions: { some: {} } };
    if (query.upcoming) {
      where.generalSaleDate = { gte: today };
    }

    const [data, total] = await Promise.all([
      this.prisma.saleAnnouncement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: query.upcoming ? { generalSaleDate: 'asc' } : { createdAt: 'desc' },
        include: { editions: editionsInclude, regions: regionsInclude },
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

  async adminFindAll() {
    return this.prisma.saleAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { editions: editionsInclude, regions: regionsInclude },
    });
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
    signatureType: 'unsigned' | 'signed' | 'digitally_signed',
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
    signatureType: 'unsigned' | 'signed' | 'digitally_signed',
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
        extraImagesJson: extraImages && extraImages.length > 0 ? JSON.stringify(extraImages) : null,
        isBundle: data.isBundle ?? false,
        expectedShipping: data.expectedShipping ?? null,
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
          extraImagesJson: extraImages.length > 0 ? JSON.stringify(extraImages) : null,
        }),
        ...(data.isBundle !== undefined && { isBundle: data.isBundle }),
        ...(data.expectedShipping !== undefined && { expectedShipping: data.expectedShipping || null }),
      },
    });

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

    return this.findById(id);
  }

  async delete(id: string) {
    const existing = await this.prisma.saleAnnouncement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sale announcement not found');
    await this.prisma.saleAnnouncement.delete({ where: { id } });
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
      countryCodes: fields.countryCodes ?? '[]',
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
}
