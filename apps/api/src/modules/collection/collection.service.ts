import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddToCollectionDto, UpdateCollectionEntryDto } from './collection.dto';


@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getCollection(userId: string, page = 1, pageSize = 20, isWishlist?: boolean) {
    const skip = (page - 1) * pageSize;
    const where: { userId: string; isWishlist?: boolean } = { userId };
    if (isWishlist !== undefined) where.isWishlist = isWishlist;
    const [data, total] = await Promise.all([
      this.prisma.userBookEntry.findMany({
        where,
        select: {
          id: true,
          condition: true,
          isWishlist: true,
          ownershipStatus: true,
          readingStatus: true,
          acquiredAt: true,
          signatureType: true,
          trackingNumber: true,
          createdAt: true,
          edition: {
            select: {
              id: true,
              slug: true,
              publisher: true,
              additionalImages: true,
              bookBoxCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
              book: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  seriesName: true,
                  volumeNumber: true,
                  authors: {
                    select: {
                      author: { select: { id: true, name: true, slug: true } },
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
          entryTags: {
            where: { userId },
            select: { tag: true },
          },
          salePrice: true,
          saleCurrency: true,
          purchaseGroup: { select: { id: true, currency: true, purchasedAt: true, totalAmount: true, shippingAmount: true, fromSubscription: true, _count: { select: { bookEntries: true } } } },
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
      tags: (entry.entryTags ?? []).map((t) => t.tag),
      entryTags: undefined,
      edition: entry.edition
        ? { ...entry.edition, tags: undefined }
        : entry.edition,
    }));
    return { data: dataWithTags, total, page, pageSize };
  }

  async getUserTags(userId: string): Promise<string[]> {
    const rows = await this.prisma.userBookEntryTag.findMany({
      where: { userId },
      select: { tag: true },
      distinct: ['tag'],
      orderBy: { tag: 'asc' },
    });
    return rows.map((r) => r.tag);
  }

  async setEntryTags(userId: string, entryId: string, tags: string[]): Promise<string[]> {
    const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    await this.prisma.$transaction([
      this.prisma.userBookEntryTag.deleteMany({ where: { userId, entryId } }),
      ...(cleaned.length > 0
        ? [
            this.prisma.userBookEntryTag.createMany({
              data: cleaned.map((tag) => ({ userId, entryId, tag })),
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
    const entry = await this.prisma.userBookEntry.create({
      data: {
        userId,
        bookId: edition.bookId,
        editionId: dto.bookEditionId,
        condition: dto.condition,
        isWishlist: dto.isWishlist ?? false,
        ownershipStatus: dto.ownershipStatus ?? 'OWNED',
        readingStatus: dto.readingStatus ?? 'UNREAD',
      },
    });
    this.recordStatusChange(entry.id, entry.ownershipStatus);
    return entry;
  }

  async addToWishlist(userId: string, bookEditionId: string) {
    const edition = await this.prisma.bookEdition.findUnique({ where: { id: bookEditionId } });
    if (!edition) throw new NotFoundException('Book edition not found');

    const existing = await this.prisma.userBookEntry.findFirst({
      where: { userId, editionId: bookEditionId },
    });
    if (existing) {
      if (!existing.isWishlist) throw new ConflictException('Edition already in your collection');
      return existing;
    }
    return this.prisma.userBookEntry.create({
      data: {
        userId,
        bookId: edition.bookId,
        editionId: bookEditionId,
        isWishlist: true,
        ownershipStatus: 'OWNED',
        readingStatus: 'UNREAD',
      },
    });
  }

  async getEntriesByEditionId(userId: string, editionId: string) {
    const [entries, tags] = await Promise.all([
      this.prisma.userBookEntry.findMany({
        where: { userId, editionId, isWishlist: false },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          readingStatus: true,
          ownershipStatus: true,
          addedAt: true,
          acquiredAt: true,
          trackingNumber: true,
          salePrice: true,
          saleCurrency: true,
          saleDate: true,
          saleVenue: true,
          saleNotes: true,
          signatureType: true,
          subscriptionEntryId: true,
          entryTags: {
            where: { userId },
            select: { tag: true },
          },
          purchaseGroup: {
            select: {
              id: true,
              title: true,
              totalAmount: true,
              currency: true,
              shippingAmount: true,
              purchasedAt: true,
              fromSubscription: true,
              notes: true,
              saleAnnouncementId: true,
              fees: {
                select: { id: true, name: true, amount: true, currency: true, category: true, date: true },
                orderBy: { createdAt: 'asc' },
              },
              discounts: {
                select: { id: true, name: true, amount: true, currency: true },
                orderBy: { date: 'asc' },
              },
              refunds: {
                select: { id: true, amount: true, currency: true, date: true, reason: true },
                orderBy: { date: 'asc' },
              },
            },
          },
        },
      }),
    ]);
    return entries.map((entry) => ({
      ...entry,
      tags: (entry.entryTags ?? []).map((t) => t.tag),
      entryTags: undefined,
    }));
  }

  async getEntryStatus(userId: string, editionId: string) {
    const entry = await this.prisma.userBookEntry.findFirst({
      where: { userId, editionId },
      select: { id: true, isWishlist: true },
    });
    if (!entry) return { status: 'none' as const };
    return {
      status: entry.isWishlist ? ('wishlist' as const) : ('collection' as const),
      entryId: entry.id,
    };
  }

  async getEntryForTracking(entryId: string, userId: string) {
    const entry = await this.prisma.userBookEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true, editionId: true, trackingNumber: true },
    });
    if (!entry || entry.userId !== userId) return null;
    return entry;
  }

  async updateEntry(userId: string, entryId: string, dto: UpdateCollectionEntryDto) {
    const existing = await this.prisma.userBookEntry.findUnique({ where: { id: entryId } });
    if (!existing) throw new NotFoundException('Entry not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    // Auto-promote PREORDER → SHIPPING when a tracking number is added
    const addingTracking = dto.trackingNumber !== undefined
      && dto.trackingNumber !== null
      && dto.trackingNumber.trim() !== ''
      && !existing.trackingNumber;
    const autoStatus =
      addingTracking && existing.ownershipStatus === 'PREORDER' ? 'SHIPPING' : undefined;
    const effectiveOwnershipStatus = dto.ownershipStatus ?? autoStatus;

    const updated = await this.prisma.userBookEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.condition !== undefined && { condition: dto.condition }),
        ...(effectiveOwnershipStatus !== undefined && { ownershipStatus: effectiveOwnershipStatus }),
        ...(dto.readingStatus !== undefined && { readingStatus: dto.readingStatus }),
        ...(dto.isWishlist !== undefined && { isWishlist: dto.isWishlist }),
        ...(dto.acquiredAt !== undefined && { acquiredAt: new Date(dto.acquiredAt) }),
        ...(dto.trackingNumber !== undefined && { trackingNumber: dto.trackingNumber }),
        ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
        ...(dto.saleCurrency !== undefined && { saleCurrency: dto.saleCurrency }),
        ...(dto.saleDate !== undefined && { saleDate: dto.saleDate }),
        ...(dto.saleVenue !== undefined && { saleVenue: dto.saleVenue }),
        ...(dto.saleNotes !== undefined && { saleNotes: dto.saleNotes }),
      },
    });
    if (effectiveOwnershipStatus !== undefined && effectiveOwnershipStatus !== existing.ownershipStatus) {
      this.recordStatusChange(entryId, effectiveOwnershipStatus);
    }
    return updated;
  }

  async updateByEdition(
    userId: string,
    editionId: string,
    ownershipStatus: string,
  ): Promise<{ updatedCount: number }> {
    const entries = await this.prisma.userBookEntry.findMany({
      where: { userId, editionId, isWishlist: false, ownershipStatus: { not: 'SOLD' } },
      select: { id: true, ownershipStatus: true },
    });
    if (entries.length === 0) throw new NotFoundException('No collection entries found for this edition');

    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.userBookEntry.update({
          where: { id: e.id },
          data: { ownershipStatus },
        }),
      ),
    );

    for (const e of entries) {
      if (e.ownershipStatus !== ownershipStatus) {
        this.recordStatusChange(e.id, ownershipStatus);
      }
    }

    return { updatedCount: entries.length };
  }

  async getOwnershipHistory(userId: string, entryId: string) {
    const entry = await this.prisma.userBookEntry.findUnique({
      where: { id: entryId },
      select: { userId: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.userId !== userId) throw new ForbiddenException();

    return this.prisma.ownershipStatusHistory.findMany({
      where: { userBookEntryId: entryId },
      orderBy: { changedAt: 'asc' },
      select: { id: true, status: true, changedAt: true },
    });
  }

  private recordStatusChange(userBookEntryId: string, status: string): void {
    this.prisma.ownershipStatusHistory
      .create({ data: { userBookEntryId, status } })
      .catch(() => {});
  }

  async removeFromCollection(userId: string, entryId: string) {
    const existing = await this.prisma.userBookEntry.findUnique({ where: { id: entryId } });
    if (!existing) throw new NotFoundException('Entry not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.userBookEntry.delete({ where: { id: entryId } });
    return existing;
  }

  async getStats(userId: string) {
    const [totalOwned, totalWishlist, groupResult] = await Promise.all([
      this.prisma.userBookEntry.count({ where: { userId, isWishlist: false } }),
      this.prisma.userBookEntry.count({ where: { userId, isWishlist: true } }),
      this.prisma.userBookEntry.groupBy({
        by: ['editionId'],
        where: { userId, editionId: { not: null }, isWishlist: false },
        _count: { editionId: true },
      }),
    ]);
    return {
      totalOwned,
      totalWishlist,
      totalEditions: groupResult.length,
    };
  }
}
