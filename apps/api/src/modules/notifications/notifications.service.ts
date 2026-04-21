import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(userId: string, page = 1, pageSize = 20, unreadOnly?: boolean) {
    const skip = (page - 1) * pageSize;
    const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
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
    if (notification.userId !== userId) throw new ForbiddenException();
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

  async getUnreadCount(userId: string) {
    const count = await this.prisma.userNotification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async createNotification(
    userId: string,
    type: string,
    title: string,
    body?: string,
    entityType?: string,
    entityId?: string,
  ) {
    const link = entityType && entityId ? `${entityType}:${entityId}` : undefined;
    return this.prisma.userNotification.create({
      data: { userId, type, title, body, link },
    });
  }
}
