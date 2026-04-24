import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BugReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(data: {
    userId?: string;
    title: string;
    description: string;
    pageUrl?: string;
    category?: string;
  }) {
    const report = await this.prisma.bugReport.create({
      data: {
        userId: data.userId ?? null,
        title: data.title,
        description: data.description,
        pageUrl: data.pageUrl ?? null,
        category: data.category ?? 'general',
      },
    });

    // Notify submitting user that their report was received
    if (data.userId) {
      await this.notifications.createNotification(
        data.userId,
        'bug_report_received',
        '🐛 Bug report received',
        `Your report "${data.title}" has been submitted. We'll look into it!`,
      );
    }

    return report;
  }

  findAll(page = 1, pageSize = 30, status?: string) {
    const where = status ? { status } : {};
    return Promise.all([
      this.prisma.bugReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, username: true, email: true } },
        },
      }),
      this.prisma.bugReport.count({ where }),
    ]).then(([items, total]) => ({ items, total, page, pageSize }));
  }

  async updateStatus(id: string, status: string) {
    const report = await this.prisma.bugReport.update({
      where: { id },
      data: { status },
      include: { user: { select: { id: true } } },
    });

    // Notify user when report is resolved or marked wontfix
    if (report.userId && (status === 'resolved' || status === 'wontfix')) {
      const msg =
        status === 'resolved'
          ? `✅ Your bug report "${report.title}" has been resolved. Thank you for the report!`
          : `Your bug report "${report.title}" has been reviewed and marked as won't fix.`;
      await this.notifications.createNotification(
        report.userId,
        `bug_report_${status}`,
        status === 'resolved' ? '✅ Bug resolved' : 'Bug report update',
        msg,
      );
    }

    return report;
  }

  remove(id: string) {
    return this.prisma.bugReport.delete({ where: { id } });
  }
}
