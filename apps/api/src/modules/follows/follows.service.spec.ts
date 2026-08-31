/**
 * Unit tests for FollowsService — follow/unfollow/status for artist/author/book, and the
 * combined listing used by the "My follows" settings page.
 */
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { FollowsService } from './follows.service';

const USER_ID = 'user-1';

describe('FollowsService', () => {
  let service: FollowsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new FollowsService(prisma);
  });

  // ─── Artist ────────────────────────────────────────────────────────────────

  describe('artist follows', () => {
    it('followArtist upserts a UserArtistFollow row keyed on userId+artistId', async () => {
      (prisma.userArtistFollow.upsert as jest.Mock).mockResolvedValue({ userId: USER_ID, artistId: 'artist-1' });

      await service.followArtist(USER_ID, 'artist-1');

      expect(prisma.userArtistFollow.upsert).toHaveBeenCalledWith({
        where: { userId_artistId: { userId: USER_ID, artistId: 'artist-1' } },
        create: { userId: USER_ID, artistId: 'artist-1' },
        update: {},
      });
    });

    it('unfollowArtist deletes the row and returns ok', async () => {
      (prisma.userArtistFollow.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.unfollowArtist(USER_ID, 'artist-1');

      expect(prisma.userArtistFollow.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, artistId: 'artist-1' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('artistStatus reports following=true when a row exists', async () => {
      (prisma.userArtistFollow.findUnique as jest.Mock).mockResolvedValue({ userId: USER_ID, artistId: 'artist-1' });

      const result = await service.artistStatus(USER_ID, 'artist-1');

      expect(result).toEqual({ following: true });
    });

    it('artistStatus reports following=false when no row exists', async () => {
      (prisma.userArtistFollow.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.artistStatus(USER_ID, 'artist-1');

      expect(result).toEqual({ following: false });
    });
  });

  // ─── Author ────────────────────────────────────────────────────────────────

  describe('author follows', () => {
    it('followAuthor upserts a UserAuthorFollow row keyed on userId+authorId', async () => {
      (prisma.userAuthorFollow.upsert as jest.Mock).mockResolvedValue({ userId: USER_ID, authorId: 'author-1' });

      await service.followAuthor(USER_ID, 'author-1');

      expect(prisma.userAuthorFollow.upsert).toHaveBeenCalledWith({
        where: { userId_authorId: { userId: USER_ID, authorId: 'author-1' } },
        create: { userId: USER_ID, authorId: 'author-1' },
        update: {},
      });
    });

    it('unfollowAuthor deletes the row and returns ok', async () => {
      (prisma.userAuthorFollow.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.unfollowAuthor(USER_ID, 'author-1');

      expect(prisma.userAuthorFollow.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, authorId: 'author-1' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('authorStatus reports following=true when a row exists', async () => {
      (prisma.userAuthorFollow.findUnique as jest.Mock).mockResolvedValue({ userId: USER_ID, authorId: 'author-1' });

      const result = await service.authorStatus(USER_ID, 'author-1');

      expect(result).toEqual({ following: true });
    });

    it('authorStatus reports following=false when no row exists', async () => {
      (prisma.userAuthorFollow.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.authorStatus(USER_ID, 'author-1');

      expect(result).toEqual({ following: false });
    });
  });

  // ─── Book ──────────────────────────────────────────────────────────────────

  describe('book follows', () => {
    it('followBook upserts a UserBookFollow row keyed on userId+bookId', async () => {
      (prisma.userBookFollow.upsert as jest.Mock).mockResolvedValue({ userId: USER_ID, bookId: 'book-1' });

      await service.followBook(USER_ID, 'book-1');

      expect(prisma.userBookFollow.upsert).toHaveBeenCalledWith({
        where: { userId_bookId: { userId: USER_ID, bookId: 'book-1' } },
        create: { userId: USER_ID, bookId: 'book-1' },
        update: {},
      });
    });

    it('unfollowBook deletes the row and returns ok', async () => {
      (prisma.userBookFollow.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.unfollowBook(USER_ID, 'book-1');

      expect(prisma.userBookFollow.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, bookId: 'book-1' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('bookStatus reports following=true when a row exists', async () => {
      (prisma.userBookFollow.findUnique as jest.Mock).mockResolvedValue({ userId: USER_ID, bookId: 'book-1' });

      const result = await service.bookStatus(USER_ID, 'book-1');

      expect(result).toEqual({ following: true });
    });

    it('bookStatus reports following=false when no row exists', async () => {
      (prisma.userBookFollow.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.bookStatus(USER_ID, 'book-1');

      expect(result).toEqual({ following: false });
    });
  });

  // ─── per-type paginated listings (My Follows page) ──────────────────────────

  describe('findArtistFollows', () => {
    it('unwraps each join row down to the followed artist and paginates', async () => {
      (prisma.userArtistFollow.findMany as jest.Mock).mockResolvedValue([
        { artist: { id: 'artist-1', slug: 'artist-1', name: 'Artist One' } },
      ]);
      (prisma.userArtistFollow.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findArtistFollows(USER_ID, 1, 20);

      expect(result).toEqual({
        data: [{ id: 'artist-1', slug: 'artist-1', name: 'Artist One' }],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('scopes to the given userId and applies skip/take from the requested page', async () => {
      (prisma.userArtistFollow.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userArtistFollow.count as jest.Mock).mockResolvedValue(0);

      await service.findArtistFollows(USER_ID, 2, 20);

      expect(prisma.userArtistFollow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID }, skip: 20, take: 20 }),
      );
      expect(prisma.userArtistFollow.count).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    });
  });

  describe('findAuthorFollows', () => {
    it('unwraps each join row down to the followed author and paginates', async () => {
      (prisma.userAuthorFollow.findMany as jest.Mock).mockResolvedValue([
        { author: { id: 'author-1', slug: 'author-1', name: 'Author One' } },
      ]);
      (prisma.userAuthorFollow.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAuthorFollows(USER_ID, 1, 20);

      expect(result).toEqual({
        data: [{ id: 'author-1', slug: 'author-1', name: 'Author One' }],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });
  });

  describe('findBookFollows', () => {
    it('unwraps each join row down to the followed book and paginates', async () => {
      (prisma.userBookFollow.findMany as jest.Mock).mockResolvedValue([
        { book: { id: 'book-1', slug: 'book-1', title: 'Book One' } },
      ]);
      (prisma.userBookFollow.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findBookFollows(USER_ID, 1, 20);

      expect(result).toEqual({
        data: [{ id: 'book-1', slug: 'book-1', title: 'Book One' }],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('returns an empty page for a user following nothing, without erroring', async () => {
      (prisma.userBookFollow.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userBookFollow.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findBookFollows(USER_ID, 1, 20);

      expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    });
  });
});
