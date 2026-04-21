import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto, UpdateReviewDto } from './reviews.dto';

const USER_SELECT = {
  id: true,
  username: true,
  avatarUrl: true,
};

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookReviews(bookId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { bookId };
    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: { user: { select: USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async getUserReviews(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          user: { select: USER_SELECT },
          book: { select: { id: true, slug: true, title: true, coverImage: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async getUserReviewsByUsername(username: string, page = 1, pageSize = 20) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    return this.getUserReviews(user.id, page, pageSize);
  }

  async createReview(userId: string, dto: CreateReviewDto) {
    const existing = await this.prisma.review.findUnique({
      where: { userId_bookId: { userId, bookId: dto.bookId } },
    });
    if (existing) throw new ConflictException('You have already reviewed this book');

    return this.prisma.review.create({
      data: {
        userId,
        bookId: dto.bookId,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        containsSpoilers: dto.containsSpoilers ?? false,
      },
      include: { user: { select: USER_SELECT } },
    });
  }

  async updateReview(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException();

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.containsSpoilers !== undefined && { containsSpoilers: dto.containsSpoilers }),
      },
      include: { user: { select: USER_SELECT } },
    });
  }

  async deleteReview(userId: string, reviewId: string, userRole?: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId && userRole !== 'ADMIN') throw new ForbiddenException();
    await this.prisma.review.delete({ where: { id: reviewId } });
  }

  async markHelpful(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const existing = await this.prisma.reviewHelpful.findUnique({
      where: { userId_reviewId: { userId, reviewId } },
    });
    if (existing) return { helpfulCount: review.helpfulCount };

    await this.prisma.reviewHelpful.create({ data: { userId, reviewId } });
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { helpfulCount: { increment: 1 } },
    });
    return { helpfulCount: updated.helpfulCount };
  }

  async getBookRatingSummary(bookId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { bookId },
      select: { rating: true },
    });

    const count = reviews.length;
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of reviews) {
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
      sum += r.rating;
    }
    const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

    return { average, count, distribution };
  }
}
