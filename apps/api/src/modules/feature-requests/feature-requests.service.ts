import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FeatureRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async submit(data: { title: string; description: string; userId?: string }) {
    const req = await this.prisma.featureRequest.create({
      data: {
        title: data.title,
        description: data.description,
        userId: data.userId ?? null,
      },
    });

    if (data.userId) {
      await this.notifications.createNotification(
        data.userId,
        'feature_request_received',
        '💡 Feature request received',
        `Your feature request "${data.title}" has been submitted and will be reviewed soon!`,
      );
    }

    return req;
  }

  async findPublic(query: { page?: number; pageSize?: number; userId?: string }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 50);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.featureRequest.findMany({
        where: { status: 'accepted' },
        include: {
          _count: { select: { votes: true } },
          votes: query.userId ? { where: { userId: query.userId } } : false,
          user: { select: { id: true, username: true } },
        },
        orderBy: [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.featureRequest.count({ where: { status: 'accepted' } }),
    ]);

    return {
      data: items.map(r => ({
        ...r,
        voteCount: r._count.votes,
        userHasVoted: query.userId ? r.votes.length > 0 : false,
        votes: undefined,
        _count: undefined,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findMine(userId: string) {
    const items = await this.prisma.featureRequest.findMany({
      where: { userId },
      include: { _count: { select: { votes: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(r => ({ ...r, voteCount: r._count.votes, _count: undefined }));
  }

  async adminFindAll(query: { page?: number; pageSize?: number; status?: string }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 30, 100);
    const skip = (page - 1) * pageSize;
    const where = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      this.prisma.featureRequest.findMany({
        where,
        include: {
          _count: { select: { votes: true } },
          user: { select: { id: true, username: true, email: true } },
        },
        orderBy: [
          // pending first, then by votes desc
          { createdAt: 'desc' },
        ],
        skip,
        take: pageSize,
      }),
      this.prisma.featureRequest.count({ where }),
    ]);

    return {
      data: items.map(r => ({ ...r, voteCount: r._count.votes, _count: undefined })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async review(id: string, data: { status: 'accepted' | 'rejected'; adminNote?: string }) {
    const req = await this.prisma.featureRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true } } },
    });
    if (!req) throw new NotFoundException('Feature request not found');

    const updated = await this.prisma.featureRequest.update({
      where: { id },
      data: { status: data.status, adminNote: data.adminNote ?? null },
    });

    if (req.userId) {
      const msg =
        data.status === 'accepted'
          ? `✅ Your feature request "${req.title}" has been accepted and is now open for voting!`
          : `Your feature request "${req.title}" has been reviewed and won't be added at this time.${data.adminNote ? ` Note: ${data.adminNote}` : ''}`;
      await this.notifications.createNotification(
        req.userId,
        `feature_request_${data.status}`,
        data.status === 'accepted' ? '✅ Feature request accepted!' : 'Feature request reviewed',
        msg,
      );
    }

    return updated;
  }

  async toggleVote(featureRequestId: string, userId: string) {
    const req = await this.prisma.featureRequest.findUnique({ where: { id: featureRequestId } });
    if (!req) throw new NotFoundException('Feature request not found');
    if (req.status !== 'accepted') throw new ConflictException('Can only vote on accepted requests');

    const existing = await this.prisma.featureVote.findUnique({
      where: { featureRequestId_userId: { featureRequestId, userId } },
    });

    if (existing) {
      await this.prisma.featureVote.delete({ where: { id: existing.id } });
      return { voted: false };
    } else {
      await this.prisma.featureVote.create({ data: { featureRequestId, userId } });
      return { voted: true };
    }
  }

  async remove(id: string) {
    const req = await this.prisma.featureRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Feature request not found');
    await this.prisma.featureRequest.delete({ where: { id } });
  }
}
