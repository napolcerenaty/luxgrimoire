import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
        subscriptions: true,
        collections: true,
        sponsoredSlots: { where: { isActive: true } },
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
                coverImage: true,
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
    return this.prisma.bookBoxCompany.update({ where: { slug }, data: dto });
  }

  async delete(slug: string) {
    await this.findBySlug(slug);
    return this.prisma.bookBoxCompany.delete({ where: { slug } });
  }

  async extractBrandColors(slug: string): Promise<string[]> {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { slug },
      select: { id: true, website: true },
    });
    if (!company) throw new NotFoundException(`Company '${slug}' not found`);
    if (!company.website) throw new BadRequestException('Company has no website URL configured');

    // Fetch website HTML
    const res = await fetch(company.website, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LuxgrimoireBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new BadRequestException(`Failed to fetch website: HTTP ${res.status}`);
    const html = await res.text();

    // Parse og:image (handle both attribute orderings + HTML entities)
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

    if (!ogMatch?.[1]) throw new BadRequestException('Could not find og:image or twitter:image on the website');

    let imageUrl = ogMatch[1].replace(/&amp;/g, '&').replace(/&#x2F;/g, '/');

    // Resolve relative URLs
    if (imageUrl.startsWith('//')) {
      imageUrl = `https:${imageUrl}`;
    } else if (imageUrl.startsWith('/')) {
      const base = new URL(company.website);
      imageUrl = `${base.protocol}//${base.host}${imageUrl}`;
    }

    // Extract colors with node-vibrant
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VibrantModule = require('node-vibrant') as { default: { from: (src: string) => { getPalette: () => Promise<Record<string, { hex: string } | null>> } } };
    const Vibrant = VibrantModule.default;
    const palette = await Vibrant.from(imageUrl).getPalette();

    const primary = palette['Vibrant']?.hex ?? palette['LightVibrant']?.hex ?? '#c8b48c';
    const dark = palette['DarkVibrant']?.hex ?? palette['DarkMuted']?.hex ?? '#2a1f14';
    const muted = palette['Muted']?.hex ?? palette['LightMuted']?.hex ?? '#6b5a45';

    const colors = [primary, dark, muted];

    await this.prisma.bookBoxCompany.update({
      where: { slug },
      data: { brandColors: colors },
    });

    return colors;
  }
}
