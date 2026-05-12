import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { assertOwnership } from '../../common/utils/assert-ownership.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { SubmitUserEditionImagesDto } from './user-edition-images.dto';


const MAX_IMAGES_PER_EDITION = 5;

@Injectable()
export class UserEditionImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {}

  async getPublicImages(editionSlug: string) {
    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug: editionSlug },
      select: { id: true },
    });
    if (!edition) throw new NotFoundException('Edition not found');

    return this.prisma.userEditionImage.findMany({
      where: {
        editionId: edition.id,
        status: { not: 'REMOVED' },
      },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        cloudinaryId: true,
        url: true,
        sortOrder: true,
        instagramHandle: true,
        status: true,
        createdAt: true,
        user: { select: { username: true } },
      },
    });
  }

  async submitImages(editionSlug: string, userId: string, dto: SubmitUserEditionImagesDto) {
    if (!dto.consentGiven) {
      throw new BadRequestException('You must confirm authorship and consent to submit images');
    }
    if (!dto.images || dto.images.length === 0) {
      throw new BadRequestException('At least one image is required');
    }
    if (dto.images.length > MAX_IMAGES_PER_EDITION) {
      throw new BadRequestException(`Maximum ${MAX_IMAGES_PER_EDITION} images per submission`);
    }

    const edition = await this.prisma.bookEdition.findUnique({
      where: { slug: editionSlug },
      select: { id: true },
    });
    if (!edition) throw new NotFoundException('Edition not found');

    // Only one submission allowed at a time — first uploader locks the slot.
    // Slot reopens only after admin removes all community images.
    const existingCount = await this.prisma.userEditionImage.count({
      where: {
        editionId: edition.id,
        status: { not: 'REMOVED' },
      },
    });
    if (existingCount > 0) {
      throw new ConflictException(
        'This edition already has a community photo submission. The slot opens again only after an admin removes existing photos.',
      );
    }

    const normalizedHandle = dto.instagramHandle
      ? dto.instagramHandle.replace(/^@/, '').toLowerCase()
      : null;

    const consentedAt = new Date();

    const created = await this.prisma.$transaction(
      dto.images.map((img) =>
        this.prisma.userEditionImage.create({
          data: {
            editionId: edition.id,
            userId,
            cloudinaryId: img.cloudinaryId,
            url: img.url,
            sortOrder: img.sortOrder,
            instagramHandle: normalizedHandle,
            consentGiven: true,
            consentedAt,
            status: 'PENDING',
          },
          include: {
            user: { select: { username: true } },
          },
        }),
      ),
    );

    return created;
  }

  // Admin: list edition summaries (count per edition) for a given status
  async adminListEditions(status?: string) {
    const where = status ? { status: status as any } : {};
    const rows = await this.prisma.userEditionImage.groupBy({
      by: ['editionId'],
      where,
      _count: { id: true },
    });
    if (!rows.length) return [];
    const editionIds = rows.map((r) => r.editionId);
    const editions = await this.prisma.bookEdition.findMany({
      where: { id: { in: editionIds } },
      select: { id: true, slug: true, editionName: true },
    });
    const edMap = new Map(editions.map((e) => [e.id, e]));
    return rows.map((r) => ({
      editionId: r.editionId,
      slug: edMap.get(r.editionId)?.slug ?? r.editionId,
      name: edMap.get(r.editionId)?.editionName ?? r.editionId,
      count: r._count.id,
    }));
  }

  // Admin: list images by status, optionally filtered by editionId
  async adminListImages(status?: string, editionId?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status as any;
    if (editionId) where.editionId = editionId;
    return this.prisma.userEditionImage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, username: true, email: true } },
        edition: { select: { id: true, slug: true, editionName: true } },
      },
    });
  }

  // Admin: approve or remove an image
  async adminUpdateStatus(imageId: string, status: 'APPROVED' | 'REMOVED') {
    const img = await this.prisma.userEditionImage.findUnique({ where: { id: imageId } });
    if (!img) throw new NotFoundException('Image not found');

    if (status === 'REMOVED') {
      // Delete from Cloudinary and hard-delete the record
      await this.upload.deleteImage(img.cloudinaryId);
      return this.prisma.userEditionImage.delete({ where: { id: imageId } });
    }

    return this.prisma.userEditionImage.update({
      where: { id: imageId },
      data: { status },
    });
  }

  // Admin: hard delete (removes from Cloudinary too)
  async adminDeleteImage(imageId: string) {
    const img = await this.prisma.userEditionImage.findUnique({ where: { id: imageId } });
    if (!img) throw new NotFoundException('Image not found');

    await this.upload.deleteImage(img.cloudinaryId);
    await this.prisma.userEditionImage.delete({ where: { id: imageId } });
  }

  // Admin: reorder images within an edition
  async adminReorderImages(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.userEditionImage.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  // User: list all their own community photos
  async getMyImages(userId: string) {
    return this.prisma.userEditionImage.findMany({
      where: { userId, status: { not: 'REMOVED' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        cloudinaryId: true,
        url: true,
        sortOrder: true,
        instagramHandle: true,
        status: true,
        createdAt: true,
        edition: {
          select: { slug: true, editionName: true, bookBoxCompany: { select: { name: true } } },
        },
      },
    });
  }

  // User: delete their own image by id (no slug needed — auth check by userId)
  async deleteMyImageById(imageId: string, userId: string) {
    const img = await this.prisma.userEditionImage.findUnique({ where: { id: imageId } });
    if (!img) throw new NotFoundException('Image not found');
    assertOwnership(img.userId, userId);
    await this.upload.deleteImage(img.cloudinaryId);
    await this.prisma.userEditionImage.delete({ where: { id: imageId } });
  }

  // User: delete their own image (by slug route — kept for existing endpoint)
  async userDeleteImage(imageId: string, userId: string) {
    const img = await this.prisma.userEditionImage.findUnique({ where: { id: imageId } });
    if (!img) throw new NotFoundException('Image not found');
    assertOwnership(img.userId, userId);
    await this.upload.deleteImage(img.cloudinaryId);
    await this.prisma.userEditionImage.delete({ where: { id: imageId } });
  }
}
