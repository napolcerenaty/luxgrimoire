import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { SubmitUserEditionImagesDto } from './user-edition-images.dto';


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
        }),
      ),
    );

    return created;
  }

  // Admin: list images by status
  async adminListImages(status?: string) {
    const where = status ? { status: status as any } : {};
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
}
