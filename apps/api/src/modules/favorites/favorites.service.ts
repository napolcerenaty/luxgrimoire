import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddFavoriteDto, FavoriteEntityType } from './favorites.dto';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async getFavorites(userId: string, entityType?: FavoriteEntityType) {
    if (entityType) {
      return this.getFavoritesByType(userId, entityType);
    }
    const [books, authors, artists, companies, editions] = await Promise.all([
      this.prisma.userFavoriteBook.findMany({ where: { userId } }),
      this.prisma.userFavoriteAuthor.findMany({ where: { userId } }),
      this.prisma.userFavoriteArtist.findMany({ where: { userId } }),
      this.prisma.userFavoriteCompany.findMany({ where: { userId } }),
      this.prisma.userFavoriteEdition.findMany({ where: { userId } }),
    ]);
    return { BOOK: books, AUTHOR: authors, ARTIST: artists, COMPANY: companies, EDITION: editions };
  }

  private async getFavoritesByType(userId: string, entityType: FavoriteEntityType) {
    switch (entityType) {
      case 'BOOK': return this.prisma.userFavoriteBook.findMany({ where: { userId } });
      case 'AUTHOR': return this.prisma.userFavoriteAuthor.findMany({ where: { userId } });
      case 'ARTIST': return this.prisma.userFavoriteArtist.findMany({ where: { userId } });
      case 'COMPANY': return this.prisma.userFavoriteCompany.findMany({ where: { userId } });
      case 'EDITION': return this.prisma.userFavoriteEdition.findMany({ where: { userId } });
    }
  }

  async addFavorite(userId: string, dto: AddFavoriteDto) {
    switch (dto.entityType) {
      case 'BOOK':
        return this.prisma.userFavoriteBook.createMany({
          data: [{ userId, bookId: dto.entityId }],
          skipDuplicates: true,
        });
      case 'AUTHOR':
        return this.prisma.userFavoriteAuthor.createMany({
          data: [{ userId, authorId: dto.entityId }],
          skipDuplicates: true,
        });
      case 'ARTIST':
        return this.prisma.userFavoriteArtist.createMany({
          data: [{ userId, artistId: dto.entityId }],
          skipDuplicates: true,
        });
      case 'COMPANY':
        return this.prisma.userFavoriteCompany.createMany({
          data: [{ userId, companyId: dto.entityId }],
          skipDuplicates: true,
        });
      case 'EDITION':
        return this.prisma.userFavoriteEdition.createMany({
          data: [{ userId, editionId: dto.entityId }],
          skipDuplicates: true,
        });
    }
  }

  async removeFavorite(userId: string, entityType: FavoriteEntityType, entityId: string) {
    switch (entityType) {
      case 'BOOK':
        return this.prisma.userFavoriteBook.delete({ where: { userId_bookId: { userId, bookId: entityId } } });
      case 'AUTHOR':
        return this.prisma.userFavoriteAuthor.delete({ where: { userId_authorId: { userId, authorId: entityId } } });
      case 'ARTIST':
        return this.prisma.userFavoriteArtist.delete({ where: { userId_artistId: { userId, artistId: entityId } } });
      case 'COMPANY':
        return this.prisma.userFavoriteCompany.delete({ where: { userId_companyId: { userId, companyId: entityId } } });
      case 'EDITION':
        return this.prisma.userFavoriteEdition.delete({ where: { userId_editionId: { userId, editionId: entityId } } });
    }
  }

  async isFavorited(userId: string, entityType: FavoriteEntityType, entityId: string): Promise<boolean> {
    let result: unknown;
    switch (entityType) {
      case 'BOOK':
        result = await this.prisma.userFavoriteBook.findUnique({ where: { userId_bookId: { userId, bookId: entityId } } });
        break;
      case 'AUTHOR':
        result = await this.prisma.userFavoriteAuthor.findUnique({ where: { userId_authorId: { userId, authorId: entityId } } });
        break;
      case 'ARTIST':
        result = await this.prisma.userFavoriteArtist.findUnique({ where: { userId_artistId: { userId, artistId: entityId } } });
        break;
      case 'COMPANY':
        result = await this.prisma.userFavoriteCompany.findUnique({ where: { userId_companyId: { userId, companyId: entityId } } });
        break;
      case 'EDITION':
        result = await this.prisma.userFavoriteEdition.findUnique({ where: { userId_editionId: { userId, editionId: entityId } } });
        break;
    }
    return result !== null;
  }
}
