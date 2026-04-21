import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const USER_SELECT = {
  id: true,
  username: true,
  avatarUrl: true,
  bio: true,
};

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) throw new ConflictException('Cannot follow yourself');

    const existing = await this.prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (existing) throw new ConflictException('Already following this user');

    const result = await this.prisma.userFollow.create({
      data: { followerId, followingId },
    });

    const follower = await this.prisma.user.findUnique({
      where: { id: followerId },
      select: { username: true },
    });

    await this.notifications.createNotification(
      followingId,
      'NEW_FOLLOWER',
      `${follower?.username ?? 'Someone'} started following you`,
      undefined,
      'user',
      followerId,
    );

    return result;
  }

  async unfollowUser(followerId: string, followingId: string) {
    const existing = await this.prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (!existing) throw new NotFoundException('Not following this user');

    await this.prisma.userFollow.delete({
      where: { followerId_followingId: { followerId, followingId } },
    });
  }

  async getFollowers(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { followingId: userId };
    const [data, total] = await Promise.all([
      this.prisma.userFollow.findMany({
        where,
        include: { follower: { select: USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.userFollow.count({ where }),
    ]);
    return { data: data.map((f) => f.follower), total, page, pageSize };
  }

  async getFollowing(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { followerId: userId };
    const [data, total] = await Promise.all([
      this.prisma.userFollow.findMany({
        where,
        include: { following: { select: USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.userFollow.count({ where }),
    ]);
    return { data: data.map((f) => f.following), total, page, pageSize };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const record = await this.prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return !!record;
  }

  async getFollowCounts(userId: string) {
    const [followers, following] = await Promise.all([
      this.prisma.userFollow.count({ where: { followingId: userId } }),
      this.prisma.userFollow.count({ where: { followerId: userId } }),
    ]);
    return { followers, following };
  }

  async getActivityFeed(userId: string, page = 1, pageSize = 20) {
    const followingList = await this.prisma.userFollow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = followingList.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return { data: [], total: 0, page, pageSize };
    }

    const [reviews, collectionEntries] = await Promise.all([
      this.prisma.review.findMany({
        where: { userId: { in: followingIds } },
        include: {
          user: { select: USER_SELECT },
          book: { select: { id: true, slug: true, title: true, coverImage: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.userBookEntry.findMany({
        where: { userId: { in: followingIds } },
        include: {
          user: { select: USER_SELECT },
          book: { select: { id: true, slug: true, title: true, coverImage: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const feedItems = [
      ...reviews.map((r) => ({
        type: 'review' as const,
        user: r.user,
        book: r.book,
        rating: r.rating,
        title: r.title,
        body: r.body,
        createdAt: r.createdAt,
      })),
      ...collectionEntries.map((e) => ({
        type: 'collection' as const,
        user: e.user,
        book: e.book,
        createdAt: e.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice((page - 1) * pageSize, page * pageSize);

    return { data: feedItems, page, pageSize };
  }
}
