import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const LIMIT_PER_GROUP = 6;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, filter = 'all') {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      return { books: [], authors: [], artists: [], subscriptions: [], companies: [], query: q, filter };
    }

    const all = filter === 'all';
    const take = LIMIT_PER_GROUP;

    const [books, authors, artists, subscriptions, companies] = await Promise.all([
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
              coverImage: true,
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
              id: true, slug: true, name: true, coverImage: true, type: true, isDiscontinued: true,
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
    ]);

    return { books, authors, artists, subscriptions, companies, query: trimmed, filter };
  }
}
