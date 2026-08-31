import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { paginatedQuery } from '../../common/prisma.utils';

@Injectable()
export class BugReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async create(data: {
    userId?: string;
    title: string;
    description: string;
    pageUrl?: string;
    category?: string;
    contactEmail?: string;
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

    // Contact Us page only — never throws, so a mail outage can't fail the submission
    if (data.contactEmail) {
      await this.mail.sendContactMessage({
        email: data.contactEmail,
        subject: data.title,
        message: data.description,
      });
    }

    return report;
  }

  findAll(page = 1, pageSize = 30, status?: string) {
    const where = status ? { status } : {};
    return paginatedQuery(
      page, pageSize,
      (skip, take) => this.prisma.bugReport.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
        include: { user: { select: { id: true, username: true, email: true } } },
      }),
      () => this.prisma.bugReport.count({ where }),
    );
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
