import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SaleAnnouncementRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(data: { userId?: string; url: string; notes?: string }) {
    const req = await this.prisma.saleAnnouncementRequest.create({
      data: {
        userId: data.userId ?? null,
        url: data.url,
        notes: data.notes ?? null,
      },
    });

    if (data.userId) {
      await this.notifications.createNotification(
        data.userId,
        'sale_announcement_request_received',
        '🛒 Sale announcement request received',
        `Your sale announcement submission has been received. We'll review it shortly!`,
      );
    }

    return req;
  }

  findAll(page = 1, pageSize = 30, status?: string) {
    const where = status ? { status } : {};
    return Promise.all([
      this.prisma.saleAnnouncementRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, username: true, email: true } } },
      }),
      this.prisma.saleAnnouncementRequest.count({ where }),
    ]).then(([items, total]) => ({ items, total, page, pageSize }));
  }

  async updateStatus(id: string, status: string, adminNote?: string) {
    const req = await this.prisma.saleAnnouncementRequest.update({
      where: { id },
      data: { status, ...(adminNote !== undefined && { adminNote }) },
      include: { user: { select: { id: true } } },
    });

    if (req.userId && (status === 'processed' || status === 'declined')) {
      const msg =
        status === 'processed'
          ? `✅ The sale announcement you submitted has been added to the database!`
          : `Your sale announcement submission has been reviewed.${req.adminNote ? ` Note: ${req.adminNote}` : ''}`;
      await this.notifications.createNotification(
        req.userId,
        `sale_announcement_request_${status}`,
        status === 'processed' ? '✅ Sale announcement added!' : 'Sale announcement request update',
        msg,
      );
    }

    return req;
  }

  remove(id: string) {
    return this.prisma.saleAnnouncementRequest.delete({ where: { id } });
  }

  findMine(userId: string) {
    return this.prisma.saleAnnouncementRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}