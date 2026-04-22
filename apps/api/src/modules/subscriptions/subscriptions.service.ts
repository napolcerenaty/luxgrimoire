import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreateMonthDto,
  UpdateMonthDto,
  AddMonthBookDto,
  SubscriptionQueryDto,
} from './subscriptions.dto';
import { generateSlugFromParts } from '../../common/utils/slug.util';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSubscriptionDto) {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) throw new NotFoundException(`Company '${dto.companyId}' not found`);

    const slug = generateSlugFromParts(company.name, dto.name);
    return this.prisma.subscription.create({
      data: {
        slug,
        companyId: dto.companyId,
        name: dto.name,
        description: dto.description,
        coverImage: dto.coverImage,
        genre: dto.genre,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isDiscontinued: dto.isDiscontinued ?? false,
        currency: dto.currency ?? 'EUR',
      },
    });
  }

  async findAll(query: SubscriptionQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.companySlug) where.company = { slug: query.companySlug };
    if (query.genre) where.genre = query.genre;
    if (query.isDiscontinued !== undefined) {
      where.isDiscontinued = query.isDiscontinued;
    }

    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          company: { select: { id: true, slug: true, name: true, logoUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { slug },
      include: {
        company: true,
        months: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          include: {
            books: {
              include: {
                book: {
                    select: {
                      title: true,
                      slug: true,
                      coverImage: true,
                      authors: { select: { author: { select: { name: true, slug: true } } } },
                    },
                  },
                edition: { select: { slug: true, coverImage: true } },
              },
            },
          },
        },
      },
    });
    if (!subscription) throw new NotFoundException(`Subscription '${slug}' not found`);
    return subscription;
  }

  async update(slug: string, dto: UpdateSubscriptionDto) {
    await this.findBySlug(slug);
    const data: Record<string, unknown> = { ...dto };
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    return this.prisma.subscription.update({ where: { slug }, data });
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.subscription.delete({ where: { slug } });
  }

  private async getSubscriptionMonths(slug: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { slug } });
    if (!subscription) throw new NotFoundException(`Subscription '${slug}' not found`);
    return subscription;
  }

  async getMonths(slug: string) {
    const subscription = await this.findBySlug(slug);
    return subscription.months;
  }

  async addMonth(subscriptionSlug: string, dto: CreateMonthDto) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);

    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: {
          subscriptionId: subscription.id,
          year: dto.year,
          month: dto.month,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Month ${dto.month}/${dto.year} already exists for this subscription`,
      );
    }

    return this.prisma.subscriptionMonth.create({
      data: {
        subscriptionId: subscription.id,
        year: dto.year,
        month: dto.month,
        theme: dto.theme,
        coverImage: dto.coverImage,
        spoilerImage: dto.spoilerImage,
        isSpoiler: dto.isSpoiler ?? false,
      },
    });
  }

  async updateMonth(
    subscriptionSlug: string,
    year: number,
    month: number,
    dto: UpdateMonthDto,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: { subscriptionId: subscription.id, year, month },
      },
    });
    if (!existing) throw new NotFoundException(`Month ${month}/${year} not found`);

    return this.prisma.subscriptionMonth.update({
      where: { id: existing.id },
      data: dto,
    });
  }

  async deleteMonth(subscriptionSlug: string, year: number, month: number) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: { subscriptionId: subscription.id, year, month },
      },
    });
    if (!existing) throw new NotFoundException(`Month ${month}/${year} not found`);

    return this.prisma.subscriptionMonth.delete({ where: { id: existing.id } });
  }

  private async getMonth(subscriptionId: string, year: number, month: number) {
    const existing = await this.prisma.subscriptionMonth.findUnique({
      where: {
        subscriptionId_year_month: { subscriptionId, year, month },
      },
    });
    if (!existing) throw new NotFoundException(`Month ${month}/${year} not found`);
    return existing;
  }

  async addBookToMonth(
    subscriptionSlug: string,
    year: number,
    month: number,
    dto: AddMonthBookDto,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    try {
      return await this.prisma.subscriptionMonthBook.create({
        data: {
          monthId: monthRecord.id,
          bookId: dto.bookId,
          editionId: dto.editionId,
          isMainBook: dto.isMainBook ?? true,
        },
      });
    } catch {
      throw new ConflictException('Book already added to this month');
    }
  }

  async removeBookFromMonth(
    subscriptionSlug: string,
    year: number,
    month: number,
    bookId: string,
  ) {
    const subscription = await this.getSubscriptionMonths(subscriptionSlug);
    const monthRecord = await this.getMonth(subscription.id, year, month);

    return this.prisma.subscriptionMonthBook.delete({
      where: { monthId_bookId: { monthId: monthRecord.id, bookId } },
    });
  }
}
