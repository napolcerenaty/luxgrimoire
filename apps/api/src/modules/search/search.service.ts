import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TypesenseService } from '../typesense/typesense.service'
import { EditionsService } from '../editions/editions.service'
import { mapAssetFields } from '../../common/media-asset.helper'

const COMPANY_ASSET_SELECT = { logoAsset: { select: { publicId: true } } } as const
function mapCompanyAsset(company: any) {
  return mapAssetFields(company, { logoUrl: 'logoAsset' })
}

const LIMIT_PER_GROUP = 6

/**
 * For Typesense: replace " and " with " & " so it's treated as a token separator
 * (Typesense strips &, making "Barnes and Noble" → "Barnes Noble" tokens).
 */
function normForTypesense(q: string): string {
  return q.replace(/\s+and\s+/gi, ' & ').replace(/\s+/g, ' ').trim()
}

/**
 * Returns unique query variants covering both & and "and" forms.
 * Used for Postgres fallback where contains is an exact substring match.
 */
function andVariants(q: string): string[] {
  const variants = new Set<string>([q])
  variants.add(q.replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim())
  variants.add(q.replace(/\band\b/gi, '&').replace(/\s+/g, ' ').trim())
  return [...variants].filter(v => v.length >= 2)
}

function formatSearchInterval(n: number): string {
  if (n === 1) return 'Monthly';
  if (n === 2) return 'Bimonthly';
  if (n === 3) return 'Quarterly';
  return `Every ${n} months`;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
    private readonly editionsService: EditionsService,
  ) {}

  async search(q: string, filter = 'all') {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      return { books: [], editions: [], authors: [], artists: [], subscriptions: [], companies: [], sales: [], query: q, filter }
    }

    if (this.typesense.isAvailable()) {
      try {
        return await this.typesenseSearch(trimmed, filter)
      } catch (err) {
        this.logger.error('Typesense search failed, falling back to Postgres', err)
      }
    }

    return this.postgresSearch(trimmed, filter)
  }

  private async typesenseSearch(trimmed: string, filter: string) {
    const all = filter === 'all'
    const tsQ = normForTypesense(trimmed)

    const searches = [
      (all || filter === 'books')
        ? { collection: 'books', q: tsQ, query_by: 'title,seriesName,authorNames', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'editions')
        ? { collection: 'editions', q: tsQ, query_by: 'bookTitle,authorNames,publisher,companyName', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'authors')
        ? { collection: 'authors', q: tsQ, query_by: 'name', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'artists')
        ? { collection: 'artists', q: tsQ, query_by: 'name', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'subscriptions')
        ? { collection: 'subscriptions', q: tsQ, query_by: 'name,companyName', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'companies')
        ? { collection: 'companies', q: tsQ, query_by: 'name', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'sales')
        ? { collection: 'sales', q: tsQ, query_by: 'title,companyName', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
    ]

    const activeSearches = searches.filter((s): s is NonNullable<typeof s> => s !== null)

    const results = await this.typesense.multiSearch(activeSearches)

    let ri = 0
    const getIds = (idx: number): string[] => {
      if (searches[idx] === null) return []
      const r = results[ri++]
      return r?.hits?.map((h: any) => h.document.id as string) ?? []
    }

    const bookIds = getIds(0)
    const editionIds = getIds(1)
    const authorIds = getIds(2)
    const artistIds = getIds(3)
    const subscriptionIds = getIds(4)
    const companyIds = getIds(5)
    const saleIds = getIds(6)

    // If Typesense returned no hits at all, collections are likely not indexed yet
    // Fall back to Postgres full-text search
    const totalHits = bookIds.length + editionIds.length + authorIds.length + artistIds.length +
      subscriptionIds.length + companyIds.length + saleIds.length
    if (totalHits === 0) {
      return this.postgresSearch(trimmed, filter)
    }

    const [books, editions, authors, artists, subscriptions, companies, sales] = await Promise.all([
      bookIds.length
        ? this.prisma.book.findMany({
            where: { id: { in: bookIds } },
            select: {
              id: true,
              slug: true,
              title: true,
              seriesName: true,
              volumeNumbers: true,
              authors: {
                select: { author: { select: { id: true, name: true, slug: true } } },
                take: 1,
              },
              editions: {
                select: {
                  bookBoxCompany: { select: { slug: true, name: true, logoUrl: true, ...COMPANY_ASSET_SELECT } },
                },
                orderBy: { createdAt: 'desc' as const },
                take: 1,
              },
            },
          })
        : [],

      editionIds.length
        ? this.prisma.bookEdition.findMany({
            where: { id: { in: editionIds } },
            select: {
              id: true,
              slug: true,
              additionalImages: true,
              publisher: true,
              generalSaleDate: true,
              variantLabel: true,
              bookBoxCompany: { select: { name: true, slug: true, logoUrl: true, ...COMPANY_ASSET_SELECT } },
              communityImages: {
                where: { status: 'APPROVED' },
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: { url: true },
              },
              book: {
                select: {
                  id: true, slug: true, title: true, seriesName: true, volumeNumbers: true,
                  authors: { select: { author: { select: { name: true } } }, take: 1 },
                },
              },
            },
          })
        : [],

      authorIds.length
        ? this.prisma.author.findMany({
            where: { id: { in: authorIds } },
            select: {
              id: true, name: true, slug: true, photoUrl: true, nationality: true,
              photoAsset: { select: { publicId: true } },
              _count: { select: { books: true } },
            },
          })
        : [],

      artistIds.length
        ? this.prisma.artist.findMany({
            where: { id: { in: artistIds } },
            select: { id: true, name: true, slug: true, photoUrl: true, specialty: true, photoAsset: { select: { publicId: true } } },
          })
        : [],

      subscriptionIds.length
        ? this.prisma.subscription.findMany({
            where: { id: { in: subscriptionIds }, isHidden: false },
            select: {
              id: true, slug: true, name: true, coverImage: true, intervalMonths: true, isDiscontinued: true,
              coverImageAsset: { select: { publicId: true } },
              company: { select: { slug: true, name: true, logoUrl: true, ...COMPANY_ASSET_SELECT } },
            },
          })
        : [],

      companyIds.length
        ? this.prisma.bookBoxCompany.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, slug: true, name: true, logoUrl: true, country: true, ...COMPANY_ASSET_SELECT },
          })
        : [],

      saleIds.length
        ? this.prisma.saleAnnouncement.findMany({
            where: { id: { in: saleIds } },
            select: {
              id: true,
              title: true,
              imageUrl: true,
              imageAsset: { select: { publicId: true } },
              generalSaleDate: true,
              isBundle: true,
              availableForPurchase: true,
              company: { select: { name: true, slug: true, logoUrl: true, ...COMPANY_ASSET_SELECT } },
              // Selects every tier (not just regionId: null) plus each region's isDefault flag so
              // getEarliestTierDate can resolve client-side via the default region, the same
              // fallback resolveEditionSaleDate uses server-side — a sale with tiers only on its
              // regions (no top-level default set) still resolves instead of coming back empty.
              tiers: { orderBy: { date: 'asc' as const }, select: { name: true, date: true, regionId: true } },
              regions: { select: { id: true, isDefault: true } },
            },
          })
        : [],
    ])

    const resolvedEditionDates = await this.editionsService.resolveEditionSaleDates(editions.map((e) => e.id))

    return {
      books: books.map((b: any) => ({
        ...b,
        editions: b.editions.map((be: any) => ({ ...be, bookBoxCompany: mapCompanyAsset(be.bookBoxCompany) })),
      })),
      editions: editions.map((e: any) => {
        const { communityImages, ...rest } = e;
        const resolved = resolvedEditionDates.get(e.id) ?? null;
        return {
          ...rest,
          bookBoxCompany: mapCompanyAsset(rest.bookBoxCompany),
          communityPhotoCover: (e.additionalImages as string[]).length === 0 ? (communityImages?.[0]?.url ?? null) : null,
          resolvedSaleDate: resolved ? { label: resolved.label, date: resolved.date } : null,
        };
      }),
      authors: authors.map((a: any) => mapAssetFields(a, { photoUrl: 'photoAsset' })),
      artists: artists.map((a: any) => mapAssetFields(a, { photoUrl: 'photoAsset' })),
      subscriptions: subscriptions.map((s: any) => {
        const { intervalMonths, ...rest } = s;
        return { ...mapAssetFields(rest, { coverImage: 'coverImageAsset' }), company: mapCompanyAsset(rest.company), type: formatSearchInterval(intervalMonths ?? 1) };
      }),
      companies: companies.map((c: any) => mapCompanyAsset(c)),
      sales: sales.map((s: any) => ({ ...mapAssetFields(s, { imageUrl: 'imageAsset' }), company: mapCompanyAsset(s.company) })),
      query: trimmed,
      filter,
    }
  }

  private async postgresSearch(trimmed: string, filter: string) {
    const all = filter === 'all'
    const take = LIMIT_PER_GROUP
    const v = andVariants(trimmed)

    const [books, editions, authors, artists, subscriptions, companies, rawSales] = await Promise.all([
      // ── Books ──────────────────────────────────────────────────────────────
      (all || filter === 'books')
        ? this.prisma.book.findMany({
            where: {
              OR: [
                ...v.map(q => ({ title: { contains: q, mode: 'insensitive' as const } })),
                ...v.map(q => ({ seriesName: { contains: q, mode: 'insensitive' as const } })),
                ...v.map(q => ({ authors: { some: { author: { name: { contains: q, mode: 'insensitive' as const } } } } })),
              ],
            },
            select: {
              id: true,
              slug: true,
              title: true,
              seriesName: true,
              volumeNumbers: true,
              authors: {
                select: { author: { select: { id: true, name: true, slug: true } } },
                take: 1,
              },
              editions: {
                select: {
                  bookBoxCompany: { select: { slug: true, name: true, logoUrl: true, ...COMPANY_ASSET_SELECT } },
                },
                orderBy: { createdAt: 'desc' as const },
                take: 1,
              },
            },
            take,
          })
        : [],

      // ── Editions ───────────────────────────────────────────────────────────
      (all || filter === 'editions')
        ? this.prisma.bookEdition.findMany({
            where: {
              OR: [
                ...v.map(q => ({ book: { title: { contains: q, mode: 'insensitive' as const } } })),
                ...v.map(q => ({ publisher: { contains: q, mode: 'insensitive' as const } })),
                ...v.map(q => ({ bookBoxCompany: { name: { contains: q, mode: 'insensitive' as const } } })),
              ],
            },
            select: {
              id: true,
              slug: true,
              additionalImages: true,
              publisher: true,
              generalSaleDate: true,
              variantLabel: true,
              bookBoxCompany: { select: { name: true, slug: true, logoUrl: true, ...COMPANY_ASSET_SELECT } },
              communityImages: {
                where: { status: 'APPROVED' },
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: { url: true },
              },
              book: {
                select: {
                  id: true, slug: true, title: true, seriesName: true, volumeNumbers: true,
                  authors: { select: { author: { select: { name: true } } }, take: 1 },
                },
              },
            },
            orderBy: { createdAt: 'desc' as const },
            take,
          })
        : [],

      // ── Authors ────────────────────────────────────────────────────────────
      (all || filter === 'authors')
        ? this.prisma.author.findMany({
            where: { OR: v.map(q => ({ name: { contains: q, mode: 'insensitive' as const } })) },
            select: {
              id: true, name: true, slug: true, photoUrl: true, nationality: true,
              photoAsset: { select: { publicId: true } },
              _count: { select: { books: true } },
            },
            take,
          })
        : [],

      // ── Artists ────────────────────────────────────────────────────────────
      (all || filter === 'artists')
        ? this.prisma.artist.findMany({
            where: { OR: v.map(q => ({ name: { contains: q, mode: 'insensitive' as const } })) },
            select: { id: true, name: true, slug: true, photoUrl: true, specialty: true, photoAsset: { select: { publicId: true } } },
            take,
          })
        : [],

      // ── Subscriptions ──────────────────────────────────────────────────────
      (all || filter === 'subscriptions')
        ? this.prisma.subscription.findMany({
            where: { isHidden: false, OR: v.map(q => ({ name: { contains: q, mode: 'insensitive' as const } })) },
            select: {
              id: true, slug: true, name: true, coverImage: true, intervalMonths: true, isDiscontinued: true,
              coverImageAsset: { select: { publicId: true } },
              company: { select: { slug: true, name: true, logoUrl: true, ...COMPANY_ASSET_SELECT } },
            },
            take,
          })
        : [],

      // ── Companies ──────────────────────────────────────────────────────────
      (all || filter === 'companies')
        ? this.prisma.bookBoxCompany.findMany({
            where: { OR: v.map(q => ({ name: { contains: q, mode: 'insensitive' as const } })) },
            select: { id: true, slug: true, name: true, logoUrl: true, country: true, ...COMPANY_ASSET_SELECT },
            take,
          })
        : [],

      // ── Sale Announcements ─────────────────────────────────────────────────
      // generalSaleDate is a legacy column the sale-tier redesign superseded (see
      // project_pending_sale_tier_column_drops memory — scheduled for removal), and ordering by
      // it left every tier-based sale null, degrading this to insertion order. Every historical
      // sale with a populated legacy date got an equivalent SaleTier row via the sale_tiers
      // migration's backfill, so tiers[0] (earliest, since ordered asc) is a complete replacement
      // — no need to select or fall back to generalSaleDate here at all. Over-fetch a bounded
      // candidate pool, then sort/slice by resolved date in application code (Prisma can't
      // ORDER BY a one-to-many relation's aggregate directly).
      (all || filter === 'sales')
        ? this.prisma.saleAnnouncement.findMany({
            where: {
              OR: [
                ...v.map(q => ({ title: { contains: q, mode: 'insensitive' as const } })),
                ...v.map(q => ({ company: { name: { contains: q, mode: 'insensitive' as const } } })),
                ...v.map(q => ({ editions: { some: { edition: { book: { title: { contains: q, mode: 'insensitive' as const } } } } } })),
              ],
            },
            select: {
              id: true,
              title: true,
              imageUrl: true,
              imageAsset: { select: { publicId: true } },
              isBundle: true,
              availableForPurchase: true,
              company: { select: { name: true, slug: true, logoUrl: true, ...COMPANY_ASSET_SELECT } },
              // Selects every tier (not just regionId: null) plus each region's isDefault flag so
              // getEarliestTierDate can resolve client-side via the default region, the same
              // fallback resolveEditionSaleDate uses server-side — a sale with tiers only on its
              // regions (no top-level default set) still resolves instead of coming back empty.
              tiers: { orderBy: { date: 'asc' as const }, select: { name: true, date: true, regionId: true } },
              regions: { select: { id: true, isDefault: true } },
            },
            take: 100,
          })
        : [],
    ])

    const sales = rawSales
      .map((s) => ({ ...s, _earliestTierDate: s.tiers[0]?.date ?? null }))
      .sort((a, b) => {
        if (!a._earliestTierDate) return b._earliestTierDate ? 1 : 0;
        if (!b._earliestTierDate) return -1;
        return b._earliestTierDate.getTime() - a._earliestTierDate.getTime();
      })
      .slice(0, take)
      .map(({ _earliestTierDate, ...s }) => s)

    const resolvedEditionDates = await this.editionsService.resolveEditionSaleDates((editions as any[]).map((e) => e.id))

    return {
      books: (books as any[]).map((b) => ({
        ...b,
        editions: b.editions.map((be: any) => ({ ...be, bookBoxCompany: mapCompanyAsset(be.bookBoxCompany) })),
      })),
      editions: (editions as any[]).map((e) => {
        const { communityImages, ...rest } = e;
        const resolved = resolvedEditionDates.get(e.id) ?? null;
        return {
          ...rest,
          bookBoxCompany: mapCompanyAsset(rest.bookBoxCompany),
          communityPhotoCover: (e.additionalImages as string[]).length === 0 ? (communityImages?.[0]?.url ?? null) : null,
          resolvedSaleDate: resolved ? { label: resolved.label, date: resolved.date } : null,
        };
      }),
      authors: (authors as any[]).map((a) => mapAssetFields(a, { photoUrl: 'photoAsset' })),
      artists: (artists as any[]).map((a) => mapAssetFields(a, { photoUrl: 'photoAsset' })),
      subscriptions: (subscriptions as any[]).map((s) => {
        const { intervalMonths, ...rest } = s;
        return { ...mapAssetFields(rest, { coverImage: 'coverImageAsset' }), company: mapCompanyAsset(rest.company), type: formatSearchInterval(intervalMonths ?? 1) };
      }),
      companies: (companies as any[]).map((c) => mapCompanyAsset(c)),
      sales: sales.map((s: any) => ({ ...mapAssetFields(s, { imageUrl: 'imageAsset' }), company: mapCompanyAsset(s.company) })),
      query: trimmed,
      filter,
    }
  }
}
