import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { assertOwnership } from '../../common/utils/assert-ownership.util';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { parsePagination } from '../../common/pagination';

const DEFAULT_TTL_KEY = 'notification.default_ttl_days';
const DEFAULT_TTL_DAYS = 30;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ─── User-facing ────────────────────────────────────────────────────────────

  async getNotifications(userId: string, page = 1, pageSize = 20, unreadOnly?: boolean) {
    const { skip, take, page: p } = parsePagination({ page, pageSize });
    pageSize = take;
    page = p;
    const where: any = {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.userNotification.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.userNotification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException('Notification not found');
    assertOwnership(notification.userId, userId);
    return this.prisma.userNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async deleteNotification(userId: string, notificationId: string) {
    const notification = await this.prisma.userNotification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException('Notification not found');
    assertOwnership(notification.userId, userId);
    await this.prisma.userNotification.delete({ where: { id: notificationId } });
    return { ok: true };
  }

  async deleteAllRead(userId: string) {
    const { count } = await this.prisma.userNotification.deleteMany({
      where: { userId, readAt: { not: null } },
    });
    return { deleted: count };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.userNotification.count({
      where: {
        userId,
        readAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    return { count };
  }

  // ─── Admin-facing ───────────────────────────────────────────────────────────

  async sendNotification(dto: {
    targetType: 'users' | 'role' | 'all';
    userIds?: string[];
    role?: string;
    title: string;
    body?: string;
    link?: string;
    type?: string;
    expiresInDays?: number;
    actor?: { id: string; username: string };
  }) {
    const { targetType, userIds, role, title, body, link, type = 'admin', expiresInDays, actor } = dto;

    const ttlDays = expiresInDays ?? (await this.getDefaultTtlDays());
    const expiresAt = ttlDays > 0 ? new Date(Date.now() + ttlDays * 86_400_000) : null;

    // Direct list of user IDs — send in one synchronous batch
    if (targetType === 'users') {
      if (!userIds?.length) return { sent: 0 };
      await this.prisma.userNotification.createMany({
        data: userIds.map((uid) => ({ userId: uid, type, title, body: body ?? null, link: link ?? null, expiresAt })),
      });
      void this.auditService.log({
        userId: actor?.id,
        username: actor?.username,
        action: 'send_notification',
        entityType: 'notification',
        metadata: { targetType, title, sentCount: userIds.length },
      });
      return { sent: userIds.length };
    }

    // For 'role' and 'all': fire-and-forget background fanout so the HTTP request returns immediately
    const BATCH_SIZE = 1000;
    const whereClause = targetType === 'role' && role ? { role: role as any } : {};

    // Estimate count to return in the immediate response
    const estimatedCount = await this.prisma.user.count({ where: whereClause });

    void this.auditService.log({
      userId: actor?.id,
      username: actor?.username,
      action: 'send_notification',
      entityType: 'notification',
      metadata: { targetType, role, title, estimatedCount },
    });

    setImmediate(async () => {
      let skip = 0;
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 3;
      while (true) {
        try {
          const batch = await this.prisma.user.findMany({
            where: whereClause,
            select: { id: true },
            skip,
            take: BATCH_SIZE,
            orderBy: { createdAt: 'asc' },
          });

          if (batch.length === 0) break;

          await this.prisma.userNotification.createMany({
            data: batch.map((u) => ({
              userId: u.id,
              type,
              title,
              body: body ?? null,
              link: link ?? null,
              expiresAt,
            })),
          });

          consecutiveFailures = 0;
          skip += batch.length;
          if (batch.length < BATCH_SIZE) break;
        } catch (err) {
          consecutiveFailures++;
          this.logger.error(
            `Background notification fanout error at skip=${skip} (failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${err}`,
          );
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            this.logger.error(
              `Aborting notification fanout after ${consecutiveFailures} consecutive failures at skip=${skip}`,
            );
            break;
          }
          // Exponential backoff before retrying same offset.
          await new Promise((r) => setTimeout(r, 1000 * 2 ** consecutiveFailures));
        }
      }
      this.logger.log(`Notification fanout finished, processed ${skip} users`);
    });

    return { sent: estimatedCount, queued: true };
  }

  /** Runs daily at 03:00 UTC — removes notifications whose expiresAt is in the past. */
  @Cron('0 3 * * *')
  async cleanupExpired() {
    const { count } = await this.prisma.userNotification.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return { deleted: count };
  }

  // ─── TTL settings ────────────────────────────────────────────────────────────

  async getDefaultTtlDays(): Promise<number> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: DEFAULT_TTL_KEY } });
    return setting ? Number(setting.value) : DEFAULT_TTL_DAYS;
  }

  async setDefaultTtlDays(days: number) {
    await this.prisma.appSetting.upsert({
      where: { key: DEFAULT_TTL_KEY },
      create: { key: DEFAULT_TTL_KEY, value: String(days) },
      update: { value: String(days) },
    });
    return { ttlDays: days };
  }

  async getSettings() {
    const ttlDays = await this.getDefaultTtlDays();
    return { ttlDays };
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  async createNotification(
    userId: string,
    type: string,
    title: string,
    body?: string,
    entityType?: string,
    entityId?: string,
  ) {
    const link = entityType && entityId ? `${entityType}:${entityId}` : undefined;
    const ttlDays = await this.getDefaultTtlDays();
    const expiresAt = ttlDays > 0 ? new Date(Date.now() + ttlDays * 86_400_000) : null;
    return this.prisma.userNotification.create({
      data: { userId, type, title, body, link, expiresAt },
    });
  }
}
