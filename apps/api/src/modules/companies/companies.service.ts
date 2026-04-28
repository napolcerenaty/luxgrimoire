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

  async setBrandColors(slug: string, colors: string[]): Promise<string[]> {
    await this.findBySlug(slug);
    const normalized = colors.map((c) => (c.startsWith('#') ? c : `#${c}`));
    await this.prisma.bookBoxCompany.update({ where: { slug }, data: { brandColors: normalized } });
    return normalized;
  }

  async extractBrandColors(slug: string): Promise<string[]> {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { slug },
      select: { id: true, website: true, logoUrl: true },
    });
    if (!company) throw new NotFoundException(`Company '${slug}' not found`);
    if (!company.website && !company.logoUrl) throw new BadRequestException('Company has no website or logo URL configured');

    type VibrantSwatch = { hex: string; hsl: [number, number, number]; population: number } | null;
    type VibrantPalette = Record<string, VibrantSwatch>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Vibrant } = require('node-vibrant/node') as { Vibrant: { from: (src: Buffer) => { getPalette: () => Promise<VibrantPalette> } } };

    const SWATCH_KEYS = ['Vibrant', 'LightVibrant', 'DarkVibrant', 'Muted', 'DarkMuted', 'LightMuted'];
    const HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    let themeColor: string | null = null;
    let imageUrl: string | null = null;

    // ── 1. Parse website HTML ─────────────────────────────────────────────
    if (company.website) {
      try {
        const res = await fetch(company.website, {
          headers: HEADERS,
          signal: AbortSignal.timeout(15000),
          redirect: 'follow',
        });

        if (res.ok) {
          const html = await res.text();

          // A. theme-color / msapplication-TileColor — direct brand hex, no image needed
          const themePatterns = [
            /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
            /<meta[^>]+name=["']msapplication-TileColor["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']msapplication-TileColor["']/i,
          ];
          for (const p of themePatterns) {
            const m = html.match(p);
            if (m?.[1] && /^#[0-9a-fA-F]{3,8}$/.test(m[1].trim())) {
              themeColor = m[1].trim();
              break;
            }
          }

          // B. Image meta tags (og:image preferred, apple-touch-icon last resort)
          const imagePatterns = [
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
            /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
            /<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]+href=["']([^"']+)["']/i,
            /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon(?:-precomposed)?["']/i,
          ];
          for (const p of imagePatterns) {
            const m = html.match(p);
            if (m?.[1]) {
              imageUrl = m[1].replace(/&amp;/g, '&').replace(/&#x2F;/g, '/');
              break;
            }
          }

          // Resolve relative URLs
          if (imageUrl) {
            if (imageUrl.startsWith('//')) imageUrl = `https:${imageUrl}`;
            else if (imageUrl.startsWith('/')) {
              const base = new URL(company.website);
              imageUrl = `${base.protocol}//${base.host}${imageUrl}`;
            }
          }
        }
      } catch {
        // Website fetch failed — continue to logoUrl fallback
      }
    }

    // ── 2. Fall back to logoUrl if no image from website ─────────────────
    if (!imageUrl && company.logoUrl) {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
      imageUrl = company.logoUrl.startsWith('http')
        ? company.logoUrl
        : `https://res.cloudinary.com/${cloudName}/image/upload/${company.logoUrl}`;
    }

    // ── 3. Try image extraction ───────────────────────────────────────────
    let imageColors: string[] | null = null;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        });
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const palette = await Vibrant.from(imgBuffer).getPalette();

          // Sort all non-null swatches by saturation descending
          const swatches = SWATCH_KEYS
            .map((k) => palette[k])
            .filter((s): s is NonNullable<VibrantSwatch> => s !== null && s !== undefined)
            .sort((a, b) => (b.hsl[1] ?? 0) - (a.hsl[1] ?? 0));

          // Only use image colors if at least one swatch has meaningful saturation (>0.1)
          if (swatches.length > 0 && (swatches[0].hsl[1] ?? 0) > 0.1) {
            imageColors = swatches.slice(0, 3).map((s) => s.hex);
            while (imageColors.length < 3) imageColors.push(imageColors[imageColors.length - 1]);
          }
        }
      } catch {
        // Image extraction failed — continue
      }
    }

    // ── 4. Compose final colors ───────────────────────────────────────────
    // Prefer image colors (most vibrant). If image was grey/mono, use theme-color.
    // If we have a theme-color and no good image, build a 3-color set from the theme-color.
    let colors: string[];
    if (imageColors) {
      // If we also have a theme-color and the image's primary seems grey, inject theme-color
      if (themeColor && imageColors[0]) {
        const hex = imageColors[0].replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b); const min = Math.min(r, g, b);
        const sat = max === min ? 0 : (max - min) / (((max + min) < 1) ? max + min : 2 - max - min);
        if (sat < 0.15) {
          // Image primary is still grey — prepend theme-color
          colors = [themeColor, imageColors[0], imageColors[1] ?? imageColors[0]];
        } else {
          colors = imageColors;
        }
      } else {
        colors = imageColors;
      }
    } else if (themeColor) {
      // No usable image — use theme-color as primary, derive dark/muted variants
      colors = [themeColor, themeColor, themeColor];
    } else {
      throw new BadRequestException(
        'Could not extract brand colors: website blocked or returned no images or theme-color. Use manual color picker instead.',
      );
    }

    await this.prisma.bookBoxCompany.update({ where: { slug }, data: { brandColors: colors } });
    return colors;
  }
}
