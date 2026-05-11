import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TypesenseService } from '../typesense/typesense.service'

const LIMIT_PER_GROUP = 6

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

    const searches = [
      (all || filter === 'books')
        ? { collection: 'books', q: trimmed, query_by: 'title,seriesName,authorNames', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'editions')
        ? { collection: 'editions', q: trimmed, query_by: 'bookTitle,authorNames,publisher,companyName', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'authors')
        ? { collection: 'authors', q: trimmed, query_by: 'name', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'artists')
        ? { collection: 'artists', q: trimmed, query_by: 'name', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'subscriptions')
        ? { collection: 'subscriptions', q: trimmed, query_by: 'name,companyName', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'companies')
        ? { collection: 'companies', q: trimmed, query_by: 'name', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
        : null,
      (all || filter === 'sales')
        ? { collection: 'sales', q: trimmed, query_by: 'title,companyName', per_page: LIMIT_PER_GROUP, drop_tokens_threshold: 0 }
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
              volumeNumber: true,
              authors: {
                select: { author: { select: { id: true, name: true, slug: true } } },
                take: 1,
              },
              editions: {
                select: {
                  bookBoxCompany: { select: { slug: true, name: true, logoUrl: true } },
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
              bookBoxCompany: { select: { name: true, slug: true, logoUrl: true } },
              communityImages: {
                where: { status: 'APPROVED' },
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: { url: true },
              },
              book: {
                select: {
                  id: true, slug: true, title: true, seriesName: true, volumeNumber: true,
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
              _count: { select: { books: true } },
            },
          })
        : [],

      artistIds.length
        ? this.prisma.artist.findMany({
            where: { id: { in: artistIds } },
            select: { id: true, name: true, slug: true, photoUrl: true, specialty: true },
          })
        : [],

      subscriptionIds.length
        ? this.prisma.subscription.findMany({
            where: { id: { in: subscriptionIds } },
            select: {
              id: true, slug: true, name: true, coverImage: true, intervalMonths: true, isDiscontinued: true,
              company: { select: { slug: true, name: true, logoUrl: true } },
            },
          })
        : [],

      companyIds.length
        ? this.prisma.bookBoxCompany.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, slug: true, name: true, logoUrl: true, country: true },
          })
        : [],

      saleIds.length
        ? this.prisma.saleAnnouncement.findMany({
            where: { id: { in: saleIds } },
            select: {
              id: true,
              title: true,
              imageUrl: true,
              generalSaleDate: true,
              isBundle: true,
              availableForPurchase: true,
              company: { select: { name: true, slug: true, logoUrl: true } },
            },
          })
        : [],
    ])

    return { books, editions: editions.map((e: any) => {
      const { communityImages, ...rest } = e;
      return { ...rest, communityPhotoCover: (e.additionalImages as string[]).length === 0 ? (communityImages?.[0]?.url ?? null) : null };
    }), authors, artists, subscriptions: subscriptions.map((s: any) => {
      const { intervalMonths, ...rest } = s;
      return { ...rest, type: formatSearchInterval(intervalMonths ?? 1) };
    }), companies, sales, query: trimmed, filter }
  }

  private async postgresSearch(trimmed: string, filter: string) {
    const all = filter === 'all'
    const take = LIMIT_PER_GROUP

    const [books, editions, authors, artists, subscriptions, companies, sales] = await Promise.all([
      // ── Books ──────────────────────────────────────────────────────────────
      (all || filter === 'books')
        ? this.prisma.book.findMany({
            where: {
              OR: [
                { title: { contains: trimmed, mode: 'insensitive' } },
                { seriesName: { contains: trimmed, mode: 'insensitive' } },
                { authors: { some: { author: { name: { contains: trimmed, mode: 'insensitive' } } } } },
              ],
            },
            select: {
              id: true,
              slug: true,
              title: true,
              seriesName: true,
              volumeNumber: true,
              authors: {
                select: { author: { select: { id: true, name: true, slug: true } } },
                take: 1,
              },
              editions: {
                select: {
                  bookBoxCompany: { select: { slug: true, name: true, logoUrl: true } },
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
                { book: { title: { contains: trimmed, mode: 'insensitive' } } },
                { publisher: { contains: trimmed, mode: 'insensitive' } },
                { bookBoxCompany: { name: { contains: trimmed, mode: 'insensitive' } } },
              ],
            },
            select: {
              id: true,
              slug: true,
              additionalImages: true,
              publisher: true,
              generalSaleDate: true,
              bookBoxCompany: { select: { name: true, slug: true, logoUrl: true } },
              communityImages: {
                where: { status: 'APPROVED' },
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: { url: true },
              },
              book: {
                select: {
                  id: true, slug: true, title: true, seriesName: true, volumeNumber: true,
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
            where: { name: { contains: trimmed, mode: 'insensitive' } },
            select: {
              id: true, name: true, slug: true, photoUrl: true, nationality: true,
              _count: { select: { books: true } },
            },
            take,
          })
        : [],

      // ── Artists ────────────────────────────────────────────────────────────
      (all || filter === 'artists')
        ? this.prisma.artist.findMany({
            where: { name: { contains: trimmed, mode: 'insensitive' } },
            select: { id: true, name: true, slug: true, photoUrl: true, specialty: true },
            take,
          })
        : [],

      // ── Subscriptions ──────────────────────────────────────────────────────
      (all || filter === 'subscriptions')
        ? this.prisma.subscription.findMany({
            where: { name: { contains: trimmed, mode: 'insensitive' } },
            select: {
              id: true, slug: true, name: true, coverImage: true, intervalMonths: true, isDiscontinued: true,
              company: { select: { slug: true, name: true, logoUrl: true } },
            },
            take,
          })
        : [],

      // ── Companies ──────────────────────────────────────────────────────────
      (all || filter === 'companies')
        ? this.prisma.bookBoxCompany.findMany({
            where: { name: { contains: trimmed, mode: 'insensitive' } },
            select: { id: true, slug: true, name: true, logoUrl: true, country: true },
            take,
          })
        : [],

      // ── Sale Announcements ─────────────────────────────────────────────────
      (all || filter === 'sales')
        ? this.prisma.saleAnnouncement.findMany({
            where: {
              OR: [
                { title: { contains: trimmed, mode: 'insensitive' } },
                { company: { name: { contains: trimmed, mode: 'insensitive' } } },
                { editions: { some: { edition: { book: { title: { contains: trimmed, mode: 'insensitive' } } } } } },
              ],
            },
            select: {
              id: true,
              title: true,
              imageUrl: true,
              generalSaleDate: true,
              isBundle: true,
              availableForPurchase: true,
              company: { select: { name: true, slug: true, logoUrl: true } },
            },
            orderBy: { generalSaleDate: 'desc' as const },
            take,
          })
        : [],
    ])

    return { books, editions: (editions as any[]).map((e) => {
      const { communityImages, ...rest } = e;
      return { ...rest, communityPhotoCover: (e.additionalImages as string[]).length === 0 ? (communityImages?.[0]?.url ?? null) : null };
    }), authors, artists, subscriptions: (subscriptions as any[]).map((s) => {
      const { intervalMonths, ...rest } = s;
      return { ...rest, type: formatSearchInterval(intervalMonths ?? 1) };
    }), companies, sales, query: trimmed, filter }
  }
}
