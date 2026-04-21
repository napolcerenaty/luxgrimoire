import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto, CompanyQueryDto } from './companies.dto';
import { generateSlug } from '../../common/utils/slug.util';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    const slug = generateSlug(dto.name);
    return this.prisma.bookBoxCompany.create({
      data: {
        slug,
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        website: dto.website,
        country: dto.country,
      },
    });
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
        subscriptions: true,
        sponsoredSlots: { where: { isActive: true } },
      },
    });
    if (!company) throw new NotFoundException(`Company '${slug}' not found`);
    return company;
  }

  async update(slug: string, dto: UpdateCompanyDto) {
    await this.findBySlug(slug);
    return this.prisma.bookBoxCompany.update({ where: { slug }, data: dto });
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.bookBoxCompany.delete({ where: { slug } });
  }
}
