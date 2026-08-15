import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Artist ──────────────────────────────────────────────────────────────

  async followArtist(userId: string, artistId: string) {
    return this.prisma.userArtistFollow.upsert({
      where: { userId_artistId: { userId, artistId } },
      create: { userId, artistId },
      update: {},
    });
  }

  async unfollowArtist(userId: string, artistId: string) {
    await this.prisma.userArtistFollow.deleteMany({ where: { userId, artistId } });
    return { ok: true };
  }

  async artistStatus(userId: string, artistId: string) {
    const follow = await this.prisma.userArtistFollow.findUnique({
      where: { userId_artistId: { userId, artistId } },
    });
    return { following: !!follow };
  }

  // ─── Author ──────────────────────────────────────────────────────────────

  async followAuthor(userId: string, authorId: string) {
    return this.prisma.userAuthorFollow.upsert({
      where: { userId_authorId: { userId, authorId } },
      create: { userId, authorId },
      update: {},
    });
  }

  async unfollowAuthor(userId: string, authorId: string) {
    await this.prisma.userAuthorFollow.deleteMany({ where: { userId, authorId } });
    return { ok: true };
  }

  async authorStatus(userId: string, authorId: string) {
    const follow = await this.prisma.userAuthorFollow.findUnique({
      where: { userId_authorId: { userId, authorId } },
    });
    return { following: !!follow };
  }

  // ─── Book ────────────────────────────────────────────────────────────────

  async followBook(userId: string, bookId: string) {
    return this.prisma.userBookFollow.upsert({
      where: { userId_bookId: { userId, bookId } },
      create: { userId, bookId },
      update: {},
    });
  }

  async unfollowBook(userId: string, bookId: string) {
    await this.prisma.userBookFollow.deleteMany({ where: { userId, bookId } });
    return { ok: true };
  }

  async bookStatus(userId: string, bookId: string) {
    const follow = await this.prisma.userBookFollow.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    return { following: !!follow };
  }

  // ─── "My follows" page ──────────────────────────────────────────────────

  async findAll(userId: string) {
    const [artists, authors, books] = await Promise.all([
      this.prisma.userArtistFollow.findMany({
        where: { userId },
        include: { artist: { select: { id: true, slug: true, name: true, photoUrl: true, specialty: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userAuthorFollow.findMany({
        where: { userId },
        include: { author: { select: { id: true, slug: true, name: true, photoUrl: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userBookFollow.findMany({
        where: { userId },
        include: { book: { select: { id: true, slug: true, title: true, seriesName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      artists: artists.map((f) => f.artist),
      authors: authors.map((f) => f.author),
      books: books.map((f) => f.book),
    };
  }
}
