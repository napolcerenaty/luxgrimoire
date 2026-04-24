import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BugReportsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId?: string;
    title: string;
    description: string;
    pageUrl?: string;
    category?: string;
  }) {
    return this.prisma.bugReport.create({
      data: {
        userId: data.userId ?? null,
        title: data.title,
        description: data.description,
        pageUrl: data.pageUrl ?? null,
        category: data.category ?? 'general',
      },
    });
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

  updateStatus(id: string, status: string) {
    return this.prisma.bugReport.update({ where: { id }, data: { status } });
  }

  remove(id: string) {
    return this.prisma.bugReport.delete({ where: { id } });
  }
}
