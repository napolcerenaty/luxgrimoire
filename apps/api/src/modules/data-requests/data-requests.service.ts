import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DataRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(data: {
    userId?: string;
    type: string;
    name: string;
    description?: string;
    referenceUrl?: string;
  }) {
    const req = await this.prisma.dataRequest.create({
      data: {
        userId: data.userId ?? null,
        type: data.type,
        name: data.name,
        description: data.description ?? null,
        referenceUrl: data.referenceUrl ?? null,
      },
    });

    if (data.userId) {
      await this.notifications.createNotification(
        data.userId,
        'data_request_received',
        '📚 Data request received',
        `Your request for "${data.name}" has been submitted. We'll add it as soon as possible!`,
      );
    }

    return req;
  }

  findAll(page = 1, pageSize = 30, status?: string) {
    const where = status ? { status } : {};
    return Promise.all([
      this.prisma.dataRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, username: true, email: true } } },
      }),
      this.prisma.dataRequest.count({ where }),
    ]).then(([items, total]) => ({ items, total, page, pageSize }));
  }

  async updateStatus(id: string, status: string, adminNote?: string) {
    const req = await this.prisma.dataRequest.update({
      where: { id },
      data: { status, ...(adminNote !== undefined && { adminNote }) },
      include: { user: { select: { id: true } } },
    });

    if (req.userId && (status === 'added' || status === 'declined')) {
      const msg =
        status === 'added'
          ? `✅ Your data request for "${req.name}" has been added to the database!`
          : `Your data request for "${req.name}" has been reviewed.${req.adminNote ? ` Note: ${req.adminNote}` : ''}`;
      await this.notifications.createNotification(
        req.userId,
        `data_request_${status}`,
        status === 'added' ? '✅ Data added!' : 'Data request update',
        msg,
      );
    }

    return req;
  }

  remove(id: string) {
    return this.prisma.dataRequest.delete({ where: { id } });
  }

  findMine(userId: string) {
    return this.prisma.dataRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}