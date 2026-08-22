import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EditionFollowReason {
  type: 'artist' | 'author' | 'book';
  id: string;
  name: string;
}

export const DEBOUNCE_MS = 5 * 60 * 1000;

/**
 * Queues "new edition matches a follow" events into PendingEditionNotification, one row per
 * (userId, editionId), merging/deduping reasons as more matches come in. scheduledFor is set
 * only on the row's first insert (now + 5 min) and never pushed back — the debounce exists to
 * absorb the admin form's multi-request edition-create flow (edition first, artists after),
 * not to guarantee dedup across genuinely separate later edits. The cron in
 * edition-follow-notifications.cron.ts consumes and deletes rows once due.
 */
@Injectable()
export class FollowNotificationsService {
  private readonly logger = new Logger(FollowNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Called from EditionsService.create() — notifies followers of the edition's book and its authors. */
  async notifyOnEditionCreated(editionId: string, bookId: string) {
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: {
        title: true,
        followers: { select: { userId: true } },
        authors: {
          select: {
            author: { select: { id: true, name: true, followers: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!book) return;

    const reasonsByUser = new Map<string, EditionFollowReason[]>();
    for (const f of book.followers) {
      this.addReason(reasonsByUser, f.userId, { type: 'book', id: bookId, name: book.title });
    }
    for (const ba of book.authors) {
      for (const f of ba.author.followers) {
        this.addReason(reasonsByUser, f.userId, { type: 'author', id: ba.author.id, name: ba.author.name });
      }
    }

    await this.enqueueAll(editionId, reasonsByUser);
  }

  /**
   * Called from EditionsService.addArtist() ONLY when the contribution is genuinely new — the
   * caller is responsible for checking that beforehand (a role-only edit on an existing
   * contributor must never reach here).
   *
   * Also notifies followers of the credited artist's studio/collective (if they belong to one)
   * — following a studio means caring about any of its members' individual credits, not just
   * credits given directly to the studio's own Artist row. The reverse (studio credited on the
   * edition → also notify followers of individual members) is intentionally NOT done: a studio
   * credit doesn't imply any specific member worked on it.
   */
  async notifyOnArtistAdded(editionId: string, artistId: string) {
    const artist = await this.prisma.artist.findUnique({
      where: { id: artistId },
      select: {
        name: true,
        followers: { select: { userId: true } },
        studio: { select: { id: true, name: true, followers: { select: { userId: true } } } },
      },
    });
    if (!artist) return;

    const reasonsByUser = new Map<string, EditionFollowReason[]>();
    for (const f of artist.followers) {
      this.addReason(reasonsByUser, f.userId, { type: 'artist', id: artistId, name: artist.name });
    }
    if (artist.studio) {
      for (const f of artist.studio.followers) {
        this.addReason(reasonsByUser, f.userId, { type: 'artist', id: artist.studio.id, name: artist.studio.name });
      }
    }

    await this.enqueueAll(editionId, reasonsByUser);
  }

  private addReason(map: Map<string, EditionFollowReason[]>, userId: string, reason: EditionFollowReason) {
    const list = map.get(userId) ?? [];
    list.push(reason);
    map.set(userId, list);
  }

  private async enqueueAll(editionId: string, reasonsByUser: Map<string, EditionFollowReason[]>) {
    for (const [userId, reasons] of reasonsByUser) {
      try {
        await this.enqueue(userId, editionId, reasons);
      } catch (err) {
        this.logger.error(`Failed to enqueue edition-follow notification for user ${userId}, edition ${editionId}: ${err}`);
      }
    }
  }

  private async enqueue(userId: string, editionId: string, newReasons: EditionFollowReason[]) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pendingEditionNotification.findUnique({
        where: { userId_editionId: { userId, editionId } },
      });

      if (!existing) {
        await tx.pendingEditionNotification.create({
          data: {
            userId,
            editionId,
            reasons: newReasons as any,
            scheduledFor: new Date(Date.now() + DEBOUNCE_MS),
          },
        });
        return;
      }

      const merged = [...(existing.reasons as unknown as EditionFollowReason[])];
      for (const r of newReasons) {
        if (!merged.some((m) => m.type === r.type && m.id === r.id)) merged.push(r);
      }
      await tx.pendingEditionNotification.update({
        where: { userId_editionId: { userId, editionId } },
        data: { reasons: merged as any },
      });
    });
  }
}
