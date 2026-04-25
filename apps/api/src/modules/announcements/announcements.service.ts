import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSaleAnnouncementDto, UpdateSaleAnnouncementDto } from './announcements.dto';

const editionsInclude = {
  orderBy: { sortOrder: 'asc' as const },
  include: {
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

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 50);
    const skip = (page - 1) * pageSize;

    const where = { isPublished: true };

    const [data, total] = await Promise.all([
      this.prisma.saleAnnouncement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { editions: editionsInclude },
      }),
      this.prisma.saleAnnouncement.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    const announcement = await this.prisma.saleAnnouncement.findUnique({
      where: { id },
      include: { editions: editionsInclude },
    });
    if (!announcement) throw new NotFoundException('Sale announcement not found');
    return announcement;
  }

  async adminFindAll() {
    return this.prisma.saleAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { editions: true } },
      },
    });
  }

  async create(dto: CreateSaleAnnouncementDto) {
    const { editionIds, extraImages, ...data } = dto;

    const announcement = await this.prisma.saleAnnouncement.create({
      data: {
        title: data.title,
        companyId: data.companyId ?? null,
        description: data.description ?? null,
        generalSaleDate: data.generalSaleDate ? new Date(data.generalSaleDate) : null,
        firstAccessDate: data.firstAccessDate ? new Date(data.firstAccessDate) : null,
        earlyAccessDate: data.earlyAccessDate ? new Date(data.earlyAccessDate) : null,
        saleTimezone: data.saleTimezone ?? null,
        basePrice: data.basePrice ?? null,
        currency: data.currency ?? null,
        imageUrl: data.imageUrl ?? null,
        extraImagesJson: extraImages && extraImages.length > 0 ? JSON.stringify(extraImages) : null,
        isPublished: data.isPublished ?? false,
        isBundle: data.isBundle ?? false,
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
        ...(data.description !== undefined && { description: data.description }),
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
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        ...(data.isBundle !== undefined && { isBundle: data.isBundle }),
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
}
