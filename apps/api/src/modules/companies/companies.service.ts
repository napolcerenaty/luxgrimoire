import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { CreateCompanyDto, UpdateCompanyDto, CompanyQueryDto } from './companies.dto';
import { generateSlug } from '../../common/utils/slug.util';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
  ) {}

  async create(dto: CreateCompanyDto) {
    const slug = generateSlug(dto.name);
    const company = await this.prisma.bookBoxCompany.create({
      data: {
        slug,
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        website: dto.website,
        country: dto.country,
        defaultCurrency: dto.defaultCurrency,
        instagram: dto.instagram,
        threads: dto.threads,
        tiktok: dto.tiktok,
        facebook: dto.facebook,
        x: dto.x,
        bluesky: dto.bluesky,
        iossImplemented: dto.iossImplemented ?? false,
      },
    });
    await this.indexCompany(company);
    return company;
  }

  async findAll(query: CompanyQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.country) where.country = query.country;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.bookBoxCompany.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          subscriptions: {
            select: { id: true, slug: true, name: true, isDiscontinued: true },
          },
          _count: {
            select: {
              collections: true,
              editions: { where: { collectionId: null } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.bookBoxCompany.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findBySlug(slug: string) {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { slug },
      include: {
        subscriptions: {
          select: { id: true, slug: true, name: true, isDiscontinued: true, logoUrl: true },
        },
        collections: {
          select: { id: true, slug: true, name: true },
        },
        sponsoredSlots: {
          where: { isActive: true },
          select: { isActive: true, type: true },
        },
        editions: {
          select: {
            id: true,
            slug: true,
            editionName: true,
            additionalImages: true,
            collectionId: true,
            subscriptionId: true,
            collection: { select: { id: true, name: true, slug: true } },
            book: {
              select: {
                id: true,
                slug: true,
                title: true,
                seriesName: true,
                volumeNumber: true,
                authors: {
                  select: {
                    author: { select: { id: true, name: true, slug: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!company) throw new NotFoundException(`Company '${slug}' not found`);
    return company;
  }

  async update(slug: string, dto: UpdateCompanyDto) {
    await this.findBySlug(slug);
    const company = await this.prisma.bookBoxCompany.update({ where: { slug }, data: dto });
    await this.indexCompany(company);
    await this.reindexCompanyRelations(company.id);
    return company;
  }

  async delete(slug: string) {
    const company = await this.findBySlug(slug);
    await this.typesense.deleteDocument('companies', company.id);
    return this.prisma.bookBoxCompany.delete({ where: { slug } });
  }

  async setBrandColors(slug: string, colors: string[]): Promise<string[]> {
    await this.findBySlug(slug);
    const normalized = colors.map((c) => (c.startsWith('#') ? c : `#${c}`));
    await this.prisma.bookBoxCompany.update({ where: { slug }, data: { brandColors: normalized } });
    return normalized;
  }

  private async indexCompany(company: { id: string; slug: string; name: string; country?: string | null }): Promise<void> {
    try {
      await this.typesense.upsertDocument('companies', {
        id: company.id,
        slug: company.slug,
        name: company.name,
        country: company.country ?? '',
      });
    } catch (err) {
      this.logger.error(`Failed to index company ${company.id}`, err);
    }
  }

  private async reindexCompanyRelations(companyId: string): Promise<void> {
    try {
      const subscriptions = await this.prisma.subscription.findMany({
        where: { companyId },
        select: {
          id: true, slug: true, name: true, type: true, isDiscontinued: true,
          company: { select: { name: true } },
        },
        take: 50,
      });
      for (const sub of subscriptions) {
        await this.typesense.upsertDocument('subscriptions', {
          id: sub.id,
          slug: sub.slug,
          name: sub.name,
          companyName: sub.company?.name ?? '',
          type: sub.type ?? '',
          isDiscontinued: sub.isDiscontinued,
        });
      }

      const editions = await this.prisma.bookEdition.findMany({
        where: { bookBoxCompanyId: companyId },
        select: {
          id: true,
          publisher: true,
          createdAt: true,
          book: {
            select: {
              id: true,
              title: true,
              authors: { select: { author: { select: { name: true } } } },
            },
          },
          bookBoxCompany: { select: { name: true, slug: true } },
        },
        take: 50,
      });
      for (const ed of editions) {
        await this.typesense.upsertDocument('editions', {
          id: ed.id,
          bookId: ed.book.id,
          bookTitle: ed.book.title,
          authorNames: ed.book.authors.map((a) => a.author.name),
          publisher: ed.publisher ?? '',
          companyName: ed.bookBoxCompany?.name ?? '',
          companySlug: ed.bookBoxCompany?.slug ?? '',
          createdAt: Math.floor(new Date(ed.createdAt).getTime() / 1000),
        });
      }
    } catch (err) {
      this.logger.error(`Failed to reindex company relations for ${companyId}`, err);
    }
  }
}
