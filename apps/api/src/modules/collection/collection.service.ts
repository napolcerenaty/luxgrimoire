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
              book: {
                include: {
                  authors: { include: { author: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.userBookEntry.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async addToCollection(userId: string, dto: AddToCollectionDto) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { id: dto.bookEditionId } });
    if (!edition) throw new NotFoundException('Book edition not found');
    return this.prisma.userBookEntry.create({
      data: {
        userId,
        bookId: edition.bookId,
        editionId: dto.bookEditionId,
        purchasedAt: dto.acquiredDate ? new Date(dto.acquiredDate) : undefined,
        source: dto.condition,
        notes: dto.notes,
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
        ...(dto.acquiredDate !== undefined && { purchasedAt: new Date(dto.acquiredDate) }),
        ...(dto.condition !== undefined && { source: dto.condition }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
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
    const [totalOwned, uniqueEditions] = await Promise.all([
      this.prisma.userBookEntry.count({ where: { userId } }),
      this.prisma.userBookEntry.findMany({
        where: { userId, editionId: { not: null } },
        select: { editionId: true },
        distinct: ['editionId'],
      }),
    ]);
    return {
      totalOwned,
      totalWishlist: 0,
      totalEditions: uniqueEditions.length,
    };
  }
}
