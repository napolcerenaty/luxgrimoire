import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [books, authors, artists, companies] = await Promise.all([
      this.prisma.book.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { description: { contains: q, mode: 'insensitive' as const } },
          ],
        },
        include: { authors: { include: { author: true } } },
        take: pageSize,
        skip,
      }),
      this.prisma.author.findMany({
        where: { name: { contains: q, mode: 'insensitive' as const } },
        take: pageSize,
        skip,
      }),
      this.prisma.artist.findMany({
        where: { name: { contains: q, mode: 'insensitive' as const } },
        take: pageSize,
        skip,
      }),
      this.prisma.bookBoxCompany.findMany({
        where: { name: { contains: q, mode: 'insensitive' as const } },
        take: pageSize,
        skip,
      }),
    ]);
    return { books, authors, artists, companies, query: q };
  }
}
