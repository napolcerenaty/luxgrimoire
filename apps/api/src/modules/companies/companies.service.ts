import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TypesenseService } from '../typesense/typesense.service';
import { UploadService } from '../upload/upload.service';
import { CreateCompanyDto, UpdateCompanyDto, CompanyQueryDto } from './companies.dto';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';

function formatInterval(n: number): string {
  if (n === 1) return 'Monthly';
  if (n === 2) return 'Bimonthly';
  if (n === 3) return 'Quarterly';
  return `Every ${n} months`;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly uploadService: UploadService,
  ) {}

  private deleteCloudinaryImages(ids: (string | null | undefined)[]) {
    const valid = ids.filter((id): id is string => !!id && !id.startsWith('http'));
    if (!valid.length) return;
    return Promise.allSettled(valid.map((id) => this.uploadService.deleteImage(id)));
  }

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
        hasOfficialImagePermission: dto.hasOfficialImagePermission ?? false,
      },
    });
    await this.indexCompany(company);
    return company;
  }

  async findAll(query: CompanyQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

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

    return { data, ...buildPageMeta(total, page, pageSize) };
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
            communityImages: {
              where: { status: 'APPROVED' },
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { url: true },
            },
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
    return {
      ...company,
      editions: company.editions.map((e) => {
        const { communityImages, ...rest } = e as typeof e & { communityImages: Array<{ url: string }> };
        return {
          ...rest,
          communityPhotoCover: (e.additionalImages as string[]).length === 0
            ? (communityImages?.[0]?.url ?? null)
            : null,
        };
      }),
    };
  }

  async update(slug: string, dto: UpdateCompanyDto) {
    const existing = await this.findBySlug(slug);
    const company = await this.prisma.bookBoxCompany.update({ where: { slug }, data: dto });
    // Delete old logo from Cloudinary if it was replaced or cleared
    if (dto.logoUrl !== undefined && dto.logoUrl !== existing.logoUrl) {
      await this.deleteCloudinaryImages([existing.logoUrl]);
    }
    await this.indexCompany(company);
    await this.reindexCompanyRelations(company.id);
    return company;
  }

  async delete(slug: string) {
    const company = await this.findBySlug(slug);
    await this.deleteCloudinaryImages([company.logoUrl]);
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
          id: true, slug: true, name: true, intervalMonths: true, isDiscontinued: true,
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
          type: formatInterval(sub.intervalMonths ?? 1),
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
