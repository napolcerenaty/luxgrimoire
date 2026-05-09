import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureType } from '@prisma/client';
import { AddToCollectionDto, UpdateCollectionEntryDto } from './collection.dto';
import { CrowdStatsService } from '../crowd-stats/crowd-stats.service';


@Injectable()
export class CollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crowdStatsService: CrowdStatsService,
  ) {}

  async getCollection(userId: string, page = 1, pageSize = 20, isWishlist?: boolean, slim = false) {
    const skip = (page - 1) * pageSize;
    const where: { userId: string; isWishlist?: boolean } = { userId };
    if (isWishlist !== undefined) where.isWishlist = isWishlist;

    if (slim) {
      const [data, total] = await Promise.all([
        this.prisma.userBookEntry.findMany({
          where,
          select: {
            id: true,
            isWishlist: true,
            edition: {
              select: {
                id: true,
                slug: true,
                additionalImages: true,
                bookBoxCompany: { select: { id: true, name: true, slug: true } },
                communityImages: {
                  where: { status: 'APPROVED' },
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                  select: { url: true },
                },
                book: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    seriesName: true,
                    volumeNumber: true,
                    authors: { select: { author: { select: { id: true, name: true, slug: true } } } },
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
      const slimMapped = data.map((entry) => {
        const edition = entry.edition as typeof entry.edition & { communityImages?: Array<{ url: string }> };
        if (!edition) return entry;
        const { communityImages, ...editionRest } = edition;
        return {
          ...entry,
          edition: {
            ...editionRest,
            communityPhotoCover: (edition.additionalImages as string[]).length === 0
              ? (communityImages?.[0]?.url ?? null)
              : null,
          },
        };
      });
      return { data: slimMapped, total, page, pageSize };
    }

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
              communityImages: {
                where: { status: 'APPROVED' },
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: { url: true },
              },
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
          purchaseGroup: {
            select: {
              id: true, currency: true, purchasedAt: true, totalAmount: true,
              shippingAmount: true, fromSubscription: true,
              _count: { select: { bookEntries: true } },
              fees: { select: { id: true, amount: true, currency: true, date: true } },
              discounts: { select: { id: true, amount: true, currency: true, date: true } },
              refunds: { select: { id: true, amount: true, currency: true, date: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.userBookEntry.count({ where }),
    ]);
    // Flatten tags to string[]
    const dataWithTags = data.map((entry) => {
      const edition = entry.edition as typeof entry.edition & { communityImages?: Array<{ url: string }> };
      return {
        ...entry,
        tags: (entry.entryTags ?? []).map((t) => t.tag),
        entryTags: undefined,
        edition: edition
          ? {
              ...edition,
              tags: undefined,
              communityImages: undefined,
              communityPhotoCover: (edition.additionalImages as string[]).length === 0
                ? (edition.communityImages?.[0]?.url ?? null)
                : null,
            }
          : edition,
      };
    });
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
    if (entry.editionId && !entry.isWishlist) {
      this.crowdStatsService.incrementCollectionCount(entry.editionId).catch(() => {});
    }
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
    const created = await this.prisma.userBookEntry.create({
      data: {
        userId,
        bookId: edition.bookId,
        editionId: bookEditionId,
        isWishlist: true,
        ownershipStatus: 'OWNED',
        readingStatus: 'UNREAD',
      },
    });
    this.recordStatusChange(created.id, created.ownershipStatus);
    return created;
  }

  async getEntriesByEditionId(userId: string, editionId: string) {
    const entries = await this.prisma.userBookEntry.findMany({
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
              isSecondHand: true,
              sourcePlatform: true,
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
              _count: { select: { bookEntries: true } },
            },
          },
        },
      });
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

    const effectiveOwnershipStatus = dto.ownershipStatus;

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
        ...(dto.signatureType !== undefined && { signatureType: (dto.signatureType ?? null) as SignatureType | null }),
      },
    });
    if (effectiveOwnershipStatus !== undefined && effectiveOwnershipStatus !== existing.ownershipStatus) {
      this.recordStatusChange(entryId, effectiveOwnershipStatus);
    }
    // Track wishlist ↔ collection transitions
    if (dto.isWishlist !== undefined && dto.isWishlist !== existing.isWishlist && existing.editionId) {
      if (!dto.isWishlist) {
        // promoted from wishlist → collection
        this.crowdStatsService.incrementCollectionCount(existing.editionId).catch(() => {});
      } else {
        // moved from collection → wishlist
        this.crowdStatsService.decrementCollectionCount(existing.editionId).catch(() => {});
      }
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

  async addOwnershipHistoryEntry(userId: string, entryId: string, dto: { status: string; changedAt?: string }) {
    const entry = await this.prisma.userBookEntry.findUnique({ where: { id: entryId }, select: { userId: true } });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.userId !== userId) throw new ForbiddenException();
    return this.prisma.ownershipStatusHistory.create({
      data: {
        userBookEntryId: entryId,
        status: dto.status,
        ...(dto.changedAt && { changedAt: new Date(dto.changedAt) }),
      },
      select: { id: true, status: true, changedAt: true },
    });
  }

  async updateOwnershipHistoryEntry(userId: string, entryId: string, historyId: string, dto: { status?: string; changedAt?: string }) {
    const entry = await this.prisma.userBookEntry.findUnique({ where: { id: entryId }, select: { userId: true } });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.userId !== userId) throw new ForbiddenException();
    return this.prisma.ownershipStatusHistory.update({
      where: { id: historyId },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.changedAt !== undefined && { changedAt: new Date(dto.changedAt) }),
      },
      select: { id: true, status: true, changedAt: true },
    });
  }

  async deleteOwnershipHistoryEntry(userId: string, entryId: string, historyId: string) {
    const entry = await this.prisma.userBookEntry.findUnique({ where: { id: entryId }, select: { userId: true } });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.userId !== userId) throw new ForbiddenException();
    await this.prisma.ownershipStatusHistory.delete({ where: { id: historyId } });
    return { success: true };
  }

  private recordStatusChange(userBookEntryId: string, status: string): void {
    this.prisma.ownershipStatusHistory
      .create({ data: { userBookEntryId, status } })
      .catch(() => {});
  }

  async removeFromCollection(userId: string, entryId: string) {
    const existing = await this.prisma.userBookEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true, editionId: true, isWishlist: true, purchaseGroupId: true },
    });
    if (!existing) throw new NotFoundException('Entry not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.userBookEntry.delete({ where: { id: entryId } });
    if (existing.editionId && !existing.isWishlist) {
      this.crowdStatsService.decrementCollectionCount(existing.editionId).catch(() => {});
    }
    // Clean up the purchase group if it's now empty
    if (existing.purchaseGroupId) {
      const remaining = await this.prisma.userBookEntry.count({
        where: { purchaseGroupId: existing.purchaseGroupId },
      });
      if (remaining === 0) {
        await this.prisma.userPurchaseGroup.delete({ where: { id: existing.purchaseGroupId } }).catch(() => {});
      }
    }
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
