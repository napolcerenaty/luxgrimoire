import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddToCollectionDto, UpdateCollectionEntryDto } from './collection.dto';

@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getCollection(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.userBookEntry.findMany({
        where,
        include: {
          edition: {
            include: {
              bookBoxCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
              book: {
                select: {
                  id: true, slug: true, title: true, altTitle: true,
                  seriesName: true, volumeNumber: true, coverImage: true, language: true,
                  authors: {
                    select: {
                      author: { select: { id: true, name: true, slug: true, photoUrl: true } },
                    },
                  },
                },
              },
              tags: {
                where: { userId },
                select: { tag: true },
              },
            },
          },
          purchaseGroup: { select: { id: true, currency: true, purchasedAt: true } },
          purchaseFees: { select: { id: true, name: true, amount: true, currency: true, category: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.userBookEntry.count({ where }),
    ]);
    // Flatten tags to string[]
    const dataWithTags = data.map((entry) => ({
      ...entry,
      tags: (entry.edition?.tags ?? []).map((t) => t.tag),
      edition: entry.edition
        ? { ...entry.edition, tags: undefined }
        : entry.edition,
    }));
    return { data: dataWithTags, total, page, pageSize };
  }

  async getUserTags(userId: string): Promise<string[]> {
    const rows = await this.prisma.userEditionTag.findMany({
      where: { userId },
      select: { tag: true },
      distinct: ['tag'],
      orderBy: { tag: 'asc' },
    });
    return rows.map((r) => r.tag);
  }

  async setEditionTags(userId: string, editionId: string, tags: string[]): Promise<string[]> {
    const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    await this.prisma.$transaction([
      this.prisma.userEditionTag.deleteMany({ where: { userId, editionId } }),
      ...(cleaned.length > 0
        ? [
            this.prisma.userEditionTag.createMany({
              data: cleaned.map((tag) => ({ userId, editionId, tag })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    return cleaned;
  }

  async addToCollection(userId: string, dto: AddToCollectionDto) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { id: dto.bookEditionId } });
    if (!edition) throw new NotFoundException('Book edition not found');
    return this.prisma.userBookEntry.create({
      data: {
        userId,
        bookId: edition.bookId,
        editionId: dto.bookEditionId,
        condition: dto.condition,
        ownershipStatus: dto.ownershipStatus ?? 'OWNED',
        readingStatus: dto.readingStatus ?? 'UNREAD',
      },
    });
  }

  async updateEntry(userId: string, entryId: string, dto: UpdateCollectionEntryDto) {
    const existing = await this.prisma.userBookEntry.findUnique({ where: { id: entryId } });
    if (!existing) throw new NotFoundException('Entry not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    return this.prisma.userBookEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.condition !== undefined && { condition: dto.condition }),
        ...(dto.ownershipStatus !== undefined && { ownershipStatus: dto.ownershipStatus }),
        ...(dto.readingStatus !== undefined && { readingStatus: dto.readingStatus }),
      },
    });
  }

  async removeFromCollection(userId: string, entryId: string) {
    const existing = await this.prisma.userBookEntry.findUnique({ where: { id: entryId } });
    if (!existing) throw new NotFoundException('Entry not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.userBookEntry.delete({ where: { id: entryId } });
  }

  async getStats(userId: string) {
    const [totalOwned, groupResult] = await Promise.all([
      this.prisma.userBookEntry.count({ where: { userId } }),
      this.prisma.userBookEntry.groupBy({
        by: ['editionId'],
        where: { userId, editionId: { not: null } },
        _count: { editionId: true },
      }),
    ]);
    return {
      totalOwned,
      totalWishlist: 0,
      totalEditions: groupResult.length,
    };
  }
}
