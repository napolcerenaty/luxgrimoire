import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, page = 1, pageSize = 20) {
    // Bound user-controllable inputs.
    const safePageSize = Math.min(Math.max(pageSize, 1), 50);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safePageSize;
    const [books, authors, artists, companies] = await Promise.all([
      this.prisma.book.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { description: { contains: q, mode: 'insensitive' as const } },
          ],
        },
        select: {
          id: true,
          slug: true,
          title: true,
          coverImage: true,
          authors: {
            select: { author: { select: { id: true, name: true, slug: true } } },
          },
        },
        take: safePageSize,
        skip,
      }),
      this.prisma.author.findMany({
        where: { name: { contains: q, mode: 'insensitive' as const } },
        select: { id: true, name: true, slug: true, photoUrl: true },
        take: safePageSize,
        skip,
      }),
      this.prisma.artist.findMany({
        where: { name: { contains: q, mode: 'insensitive' as const } },
        select: { id: true, name: true, slug: true, photoUrl: true },
        take: safePageSize,
        skip,
      }),
      this.prisma.bookBoxCompany.findMany({
        where: { name: { contains: q, mode: 'insensitive' as const } },
        select: { id: true, name: true, slug: true, logoUrl: true, country: true },
        take: safePageSize,
        skip,
      }),
    ]);
    return { books, authors, artists, companies, query: q };
  }
}
