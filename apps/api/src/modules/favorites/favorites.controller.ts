import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { AddFavoriteDto, FavoriteEntityType } from './favorites.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('check')
  isFavorited(
    @CurrentUser() user: { id: string },
    @Query('entityType') entityType: FavoriteEntityType,
    @Query('entityId') entityId: string,
  ) {
    return this.favoritesService.isFavorited(user.id, entityType, entityId);
  }

  @Get()
  getFavorites(
    @CurrentUser() user: { id: string },
    @Query('entityType') entityType?: FavoriteEntityType,
  ) {
    return this.favoritesService.getFavorites(user.id, entityType);
  }

  @Post()
  addFavorite(@CurrentUser() user: { id: string }, @Body() dto: AddFavoriteDto) {
    return this.favoritesService.addFavorite(user.id, dto);
  }

  @Delete(':entityType/:entityId')
  removeFavorite(
    @CurrentUser() user: { id: string },
    @Param('entityType') entityType: FavoriteEntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.favoritesService.removeFavorite(user.id, entityType, entityId);
  }
}
