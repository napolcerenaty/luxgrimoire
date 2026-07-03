import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { assertOwnership } from '../../common/utils/assert-ownership.util';
import { recordOwnershipHistoryAsync } from '../../common/utils/ownership-history.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureType } from '@prisma/client';
import { AddToCollectionDto, UpdateCollectionEntryDto } from './collection.dto';
import { CrowdStatsService } from '../crowd-stats/crowd-stats.service';
import { StatsService } from '../stats/stats.service';
import { parsePagination } from '../../common/pagination';

type ReadingHistoryDelegate = {
  create(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<{ id: string } | null>;
  update(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  delete(args: unknown): Promise<unknown>;
};

@Injectable()
export class CollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crowdStatsService: CrowdStatsService,
    private readonly statsService: StatsService,
  ) {}

  private get readingHistory() {
    return (this.prisma as PrismaService & { readingHistory: ReadingHistoryDelegate }).readingHistory;
  }

  async getCollection(userId: string, page = 1, pageSize = 20, isWishlist?: boolean, slim = false, ownershipStatus?: string, search?: string, companyName?: string, tag?: string) {
    const { skip, take, page: p } = parsePagination({ page, pageSize });
    pageSize = take;
    page = p;
    const where: any = { userId };
    if (isWishlist !== undefined) where.isWishlist = isWishlist;
    if (ownershipStatus !== undefined) where.ownershipStatus = ownershipStatus;
    if (search) where.edition = { ...where.edition, book: { title: { contains: search, mode: 'insensitive' } } };
    if (companyName) where.edition = { ...where.edition, bookBoxCompany: { name: companyName } };
    if (tag) where.entryTags = { some: { tag, userId } };

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
                bookBoxCompany: { select: { id: true, name: true, slug: true, brandColors: true } },
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
          trackingNumbers: { select: { id: true, trackingNumber: true, label: true, addedAt: true }, orderBy: { addedAt: 'asc' } },
          orderNumber: true,
          isOriginalPrint: true,
          saleAnnouncementEditionId: true,
          saleAnnouncementEdition: {
            select: {
              id: true,
              isReprint: true,
              announcement: { select: { id: true, title: true, generalSaleDate: true } },
            },
          },
          edition: {
            select: {
              id: true,
              slug: true,
              publisher: true,
              additionalImages: true,
              bookBoxCompany: { select: { id: true, slug: true, name: true, logoUrl: true, brandColors: true } },
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
          subscriptionEntryId: true,
          subscriptionEntry: {
            select: {
              subscription: { select: { id: true, name: true, parentSubscriptionId: true } },
            },
          },
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

  async getCollectionSubscriptions(userId: string): Promise<{ id: string; name: string; parentSubscriptionId: string | null }[]> {
    const rows = await this.prisma.userBookEntry.findMany({
      where: { userId, isWishlist: false, subscriptionEntryId: { not: null } },
      select: {
        subscriptionEntry: {
          select: {
            subscription: { select: { id: true, name: true, parentSubscriptionId: true } },
          },
        },
      },
    });
    const seen = new Map<string, { id: string; name: string; parentSubscriptionId: string | null }>();
    for (const r of rows) {
      const sub = r.subscriptionEntry?.subscription;
      if (sub && !seen.has(sub.id)) seen.set(sub.id, sub);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
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
    const isReprint = dto.saleAnnouncementEditionId ? true : undefined;
    const acquiredAt = dto.acquiredAt ? new Date(dto.acquiredAt) : undefined;
    const entry = await this.prisma.userBookEntry.create({
      data: {
        userId,
        bookId: edition.bookId,
        editionId: dto.bookEditionId,
        condition: dto.condition,
        isWishlist: dto.isWishlist ?? false,
        ownershipStatus: dto.ownershipStatus ?? 'OWNED',
        readingStatus: dto.readingStatus ?? 'UNREAD',
        // If added via a reprint SA, mark as not original; otherwise default true (original)
        isOriginalPrint: isReprint ? false : true,
        ...(dto.saleAnnouncementEditionId && { saleAnnouncementEditionId: dto.saleAnnouncementEditionId }),
        ...(acquiredAt && { acquiredAt }),
      },
    });
    recordOwnershipHistoryAsync(this.prisma, entry.id, entry.ownershipStatus, acquiredAt);
    this.statsService.markStatsStale(userId);
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
    recordOwnershipHistoryAsync(this.prisma, created.id, created.ownershipStatus);
    this.statsService.markStatsStale(userId);
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
          trackingNumbers: { select: { id: true, trackingNumber: true, label: true, addedAt: true }, orderBy: { addedAt: 'asc' } },
          orderNumber: true,
          salePrice: true,
          saleCurrency: true,
          saleDate: true,
          saleVenue: true,
          saleNotes: true,
          signatureType: true,
          subscriptionEntryId: true,
          subscriptionEntry: {
            select: {
              subscription: {
                select: { id: true, name: true, parentSubscriptionId: true },
              },
            },
          },
          saleAnnouncementEditionId: true,
          isOriginalPrint: true,
          saleAnnouncementEdition: {
            select: {
              id: true,
              isReprint: true,
              announcement: {
                select: { id: true, title: true, generalSaleDate: true },
              },
            },
          },
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
          saleEntries: {
            select: {
              saleGroupId: true,
              saleGroup: {
                select: {
                  title: true,
                  _count: { select: { entries: true } },
                },
              },
            },
            take: 1,
          },
        },
      });
    return entries.map((entry) => {
      const saleEntry = (entry.saleEntries as Array<{ saleGroupId: string; saleGroup: { title: string | null; _count: { entries: number } } | null }> | undefined)?.[0];
      return {
        ...entry,
        tags: (entry.entryTags ?? []).map((t) => t.tag),
        entryTags: undefined,
        saleGroupId: saleEntry?.saleGroupId ?? null,
        saleGroupTitle: saleEntry?.saleGroup?.title ?? null,
        saleGroupEntryCount: saleEntry?.saleGroup?._count?.entries ?? null,
        saleEntries: undefined,
      };
    });
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
      select: { id: true, userId: true, editionId: true },
    });
    if (!entry || entry.userId !== userId) return null;
    return entry;
  }

  async updateEntry(userId: string, entryId: string, dto: UpdateCollectionEntryDto) {
    const existing = await this.prisma.userBookEntry.findUnique({ where: { id: entryId } });
    if (!existing) throw new NotFoundException('Entry not found');
    assertOwnership(existing.userId, userId);

    const effectiveOwnershipStatus = dto.ownershipStatus;

    const updated = await this.prisma.userBookEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.condition !== undefined && { condition: dto.condition }),
        ...(effectiveOwnershipStatus !== undefined && { ownershipStatus: effectiveOwnershipStatus }),
        ...(dto.readingStatus !== undefined && { readingStatus: dto.readingStatus }),
        ...(dto.isWishlist !== undefined && { isWishlist: dto.isWishlist }),
        ...(dto.acquiredAt !== undefined && { acquiredAt: new Date(dto.acquiredAt) }),
        ...(dto.orderNumber !== undefined && { orderNumber: dto.orderNumber }),
        ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
        ...(dto.saleCurrency !== undefined && { saleCurrency: dto.saleCurrency }),
        ...(dto.saleDate !== undefined && { saleDate: dto.saleDate }),
        ...(dto.saleVenue !== undefined && { saleVenue: dto.saleVenue }),
        ...(dto.saleNotes !== undefined && { saleNotes: dto.saleNotes }),
        ...(dto.signatureType !== undefined && { signatureType: (dto.signatureType ?? null) as SignatureType | null }),
        ...(dto.saleAnnouncementEditionId !== undefined && { saleAnnouncementEditionId: dto.saleAnnouncementEditionId ?? null }),
        // When saleAnnouncementEditionId is explicitly set/cleared, derive isOriginalPrint automatically
        // unless isOriginalPrint is explicitly provided in the DTO
        ...(dto.saleAnnouncementEditionId !== undefined && dto.isOriginalPrint === undefined && {
          isOriginalPrint: !dto.saleAnnouncementEditionId,
        }),
        ...(dto.isOriginalPrint !== undefined && { isOriginalPrint: dto.isOriginalPrint }),
      },
    });
    if (effectiveOwnershipStatus !== undefined && effectiveOwnershipStatus !== existing.ownershipStatus) {
      const saleDate = dto.saleDate
        ? new Date(dto.saleDate)
        : (existing.saleDate as Date | null) ?? undefined;
      recordOwnershipHistoryAsync(this.prisma, 
        entryId,
        effectiveOwnershipStatus,
        effectiveOwnershipStatus === 'SOLD' ? saleDate : undefined,
      );
    }
    // Auto-create reading history sessions on status transitions
    if (dto.readingStatus !== undefined && dto.readingStatus !== existing.readingStatus) {
      if (dto.readingStatus === 'READING') {
        this.readingHistory.create({
          data: { userBookEntryId: entryId, startedAt: new Date(), isDnf: false },
        }).catch(() => {});
      } else if (dto.readingStatus === 'READ' || dto.readingStatus === 'DNF') {
        // Close any open reading session
        this.readingHistory.findFirst({
          where: { userBookEntryId: entryId, finishedAt: null },
          orderBy: { startedAt: 'desc' },
        }).then((open) => {
          if (open) {
            return this.readingHistory.update({
              where: { id: open.id },
              data: {
                finishedAt: new Date(),
                isDnf: dto.readingStatus === 'DNF',
              },
            });
          }
          // No open session — create a finished one
          return this.readingHistory.create({
            data: {
              userBookEntryId: entryId,
              finishedAt: new Date(),
              isDnf: dto.readingStatus === 'DNF',
            },
          });
        }).catch(() => {});
      }
    }
    // Sync sale crowd stats when sale info is updated
    const editionId = existing.editionId;
    if (editionId && (dto.salePrice !== undefined || dto.saleCurrency !== undefined || dto.saleDate !== undefined)) {
      const oldPrice = existing.salePrice !== null ? Number(existing.salePrice) : null;
      const oldCurrency = existing.saleCurrency as string | null;
      const oldDate = existing.saleDate as Date | null;

      const newPrice = dto.salePrice !== undefined ? (dto.salePrice ? Number(dto.salePrice) : null) : oldPrice;
      const newCurrency = (dto.saleCurrency !== undefined ? dto.saleCurrency : oldCurrency) ?? 'EUR';
      const newDate = (dto.saleDate !== undefined ? (dto.saleDate ? new Date(dto.saleDate) : null) : oldDate) ?? new Date();

      const oldSale = (oldPrice !== null && oldCurrency !== null && oldDate !== null)
        ? { price: oldPrice, currency: oldCurrency, date: oldDate }
        : null;
      const newSale = newPrice !== null
        ? { price: newPrice, currency: newCurrency, date: newDate }
        : null;

      if (oldSale || newSale) {
        this.crowdStatsService.rebuildEditionSaleStats(editionId).catch(() => {});
      }
    }
    this.statsService.markStatsStale(userId);
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
        recordOwnershipHistoryAsync(this.prisma, e.id, ownershipStatus);
      }
    }

    this.statsService.markStatsStale(userId);
    return { updatedCount: entries.length };
  }

  async getOwnershipHistory(userId: string, entryId: string) {
    const entry = await this.prisma.userBookEntry.findUnique({
      where: { id: entryId },
      select: { userId: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    assertOwnership(entry.userId, userId);

    return this.prisma.ownershipStatusHistory.findMany({
      where: { userBookEntryId: entryId },
      orderBy: { changedAt: 'asc' },
      select: { id: true, status: true, changedAt: true },
    });
  }

  async addOwnershipHistoryEntry(userId: string, entryId: string, dto: { status: string; changedAt?: string }) {
    const entry = await this.prisma.userBookEntry.findUnique({ where: { id: entryId }, select: { userId: true } });
    if (!entry) throw new NotFoundException('Entry not found');
    assertOwnership(entry.userId, userId);
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
    assertOwnership(entry.userId, userId);
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
    assertOwnership(entry.userId, userId);
    await this.prisma.ownershipStatusHistory.delete({ where: { id: historyId } });
    return { success: true };
  }

  private async assertEntryOwnership(userId: string, entryId: string) {
    const entry = await this.prisma.userBookEntry.findUnique({ where: { id: entryId }, select: { userId: true } });
    if (!entry) throw new NotFoundException('Entry not found');
    assertOwnership(entry.userId, userId);
  }

  async getReadingHistory(userId: string, entryId: string) {
    await this.assertEntryOwnership(userId, entryId);
    return this.readingHistory.findMany({
      where: { userBookEntryId: entryId },
      orderBy: { startedAt: 'asc' },
      select: { id: true, startedAt: true, finishedAt: true, isDnf: true, notes: true, createdAt: true },
    });
  }

  async addReadingHistory(userId: string, entryId: string, dto: { startedAt?: string; finishedAt?: string; isDnf?: boolean; notes?: string }) {
    await this.assertEntryOwnership(userId, entryId);
    return this.readingHistory.create({
      data: {
        userBookEntryId: entryId,
        ...(dto.startedAt && { startedAt: new Date(dto.startedAt) }),
        ...(dto.finishedAt && { finishedAt: new Date(dto.finishedAt) }),
        isDnf: dto.isDnf ?? false,
        notes: dto.notes ?? null,
      },
      select: { id: true, startedAt: true, finishedAt: true, isDnf: true, notes: true, createdAt: true },
    });
  }

  async updateReadingHistory(userId: string, entryId: string, historyId: string, dto: { startedAt?: string | null; finishedAt?: string | null; isDnf?: boolean; notes?: string | null }) {
    await this.assertEntryOwnership(userId, entryId);
    return this.readingHistory.update({
      where: { id: historyId },
      data: {
        ...(dto.startedAt !== undefined && { startedAt: dto.startedAt ? new Date(dto.startedAt) : null }),
        ...(dto.finishedAt !== undefined && { finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : null }),
        ...(dto.isDnf !== undefined && { isDnf: dto.isDnf }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      select: { id: true, startedAt: true, finishedAt: true, isDnf: true, notes: true, createdAt: true },
    });
  }

  async deleteReadingHistory(userId: string, entryId: string, historyId: string) {
    await this.assertEntryOwnership(userId, entryId);
    await this.readingHistory.delete({ where: { id: historyId } });
    return { success: true };
  }

  async removeFromCollection(userId: string, entryId: string) {
    const existing = await this.prisma.userBookEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        userId: true,
        editionId: true,
        isWishlist: true,
        purchaseGroupId: true,
        saleEntries: {
          select: {
            allocatedAmount: true,
            saleGroup: { select: { currency: true, soldAt: true } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Entry not found');
    assertOwnership(existing.userId, userId);
    await this.prisma.userBookEntry.delete({ where: { id: entryId } });
    // Clean up crowd stats for any sale entries linked to this book (non-fatal)
    if (existing.editionId && existing.saleEntries?.length) {
      this.crowdStatsService.rebuildEditionSaleStats(existing.editionId).catch(() => {});
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
    this.statsService.markStatsStale(userId);
    return existing;
  }

  async addTracking(userId: string, entryId: string, trackingNumber: string, label?: string) {
    const entry = await this.prisma.userBookEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry not found');
    assertOwnership(entry.userId, userId);
    return this.prisma.userBookEntryTracking.create({
      data: { userBookEntryId: entryId, trackingNumber, label: label ?? null },
    });
  }

  async updateTracking(userId: string, entryId: string, trackingId: string, trackingNumber: string, label?: string | null) {
    const tracking = await this.prisma.userBookEntryTracking.findUnique({
      where: { id: trackingId },
      include: { entry: { select: { userId: true } } },
    });
    if (!tracking || tracking.entry.userId !== userId) throw new NotFoundException('Tracking not found');
    return this.prisma.userBookEntryTracking.update({
      where: { id: trackingId },
      data: { trackingNumber, label: label ?? null },
    });
  }

  async removeTracking(userId: string, entryId: string, trackingId: string) {
    const tracking = await this.prisma.userBookEntryTracking.findUnique({
      where: { id: trackingId },
      include: { entry: { select: { userId: true } } },
    });
    if (!tracking || tracking.entry.userId !== userId) throw new NotFoundException('Tracking not found');
    return this.prisma.userBookEntryTracking.delete({ where: { id: trackingId } });
  }

  async getStats(userId: string) {
    const [totalOwned, totalWishlist, groupResult, aggregates] = await Promise.all([
      this.prisma.userBookEntry.count({ where: { userId, isWishlist: false, ownershipStatus: { not: 'SOLD' } } }),
      this.prisma.userBookEntry.count({ where: { userId, isWishlist: true } }),
      this.prisma.userBookEntry.groupBy({
        by: ['editionId'],
        where: { userId, editionId: { not: null }, isWishlist: false },
        _count: { editionId: true },
      }),
      // Single SQL query for series + author counts across the full collection (not paged)
      this.prisma.$queryRaw<[{ unique_series: bigint; unique_authors: bigint }]>`
        SELECT
          COUNT(DISTINCT b."seriesId")    FILTER (WHERE b."seriesId" IS NOT NULL AND e."ownershipStatus" != 'SOLD') AS unique_series,
          COUNT(DISTINCT ba."authorId")   FILTER (WHERE e."ownershipStatus" != 'SOLD')                               AS unique_authors
        FROM "user_book_entries" e
        JOIN "book_editions" ed ON ed.id = e."editionId"
        JOIN "books"          b  ON b.id  = ed."bookId"
        LEFT JOIN "book_authors" ba ON ba."bookId" = b.id
        WHERE e."userId" = ${userId}
          AND e."isWishlist" = false
      `,
    ]);

    const { unique_series, unique_authors } = aggregates[0];
    return {
      totalOwned,
      totalWishlist,
      totalEditions: groupResult.length,
      uniqueSeries: Number(unique_series),
      uniqueAuthors: Number(unique_authors),
    };
  }
}
