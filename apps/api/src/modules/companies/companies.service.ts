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
      select: { id: true, website: true, logoUrl: true },
    });
    if (!company) throw new NotFoundException(`Company '${slug}' not found`);
    if (!company.website && !company.logoUrl) throw new BadRequestException('Company has no website or logo URL configured');

    let imageUrl: string | null = null;

    // ── 1. Try to find an image from the website ───────────────────────────
    if (company.website) {
      try {
        const res = await fetch(company.website, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
          signal: AbortSignal.timeout(15000),
          redirect: 'follow',
        });

        if (res.ok) {
          const html = await res.text();

          // Try multiple meta image patterns in priority order
          const patterns = [
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
            /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
            /<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]+href=["']([^"']+)["']/i,
            /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon(?:-precomposed)?["']/i,
          ];

          for (const pattern of patterns) {
            const m = html.match(pattern);
            if (m?.[1]) {
              imageUrl = m[1].replace(/&amp;/g, '&').replace(/&#x2F;/g, '/');
              break;
            }
          }

          // Resolve relative URLs
          if (imageUrl) {
            if (imageUrl.startsWith('//')) {
              imageUrl = `https:${imageUrl}`;
            } else if (imageUrl.startsWith('/')) {
              const base = new URL(company.website);
              imageUrl = `${base.protocol}//${base.host}${imageUrl}`;
            }
          }
        }
      } catch {
        // Website fetch failed — will fall back to logoUrl below
      }
    }

    // ── 2. Fall back to company logoUrl if no image found from website ─────
    if (!imageUrl && company.logoUrl) {
      // logoUrl is stored as a Cloudinary public ID — resolve to full URL
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
      imageUrl = company.logoUrl.startsWith('http')
        ? company.logoUrl
        : `https://res.cloudinary.com/${cloudName}/image/upload/${company.logoUrl}`;
    }

    if (!imageUrl) throw new BadRequestException('Could not find any image to extract colors from (no og:image on website and no logo URL stored)');

    // ── 3. Fetch image as Buffer (node-vibrant/node requires Buffer, not URL) ─
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!imgRes.ok) throw new BadRequestException(`Failed to fetch image for color extraction: HTTP ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // ── 4. Extract colors with node-vibrant ──────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Vibrant } = require('node-vibrant/node') as { Vibrant: { from: (src: Buffer) => { getPalette: () => Promise<Record<string, { hex: string } | null>> } } };
    const palette = await Vibrant.from(imgBuffer).getPalette();

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
