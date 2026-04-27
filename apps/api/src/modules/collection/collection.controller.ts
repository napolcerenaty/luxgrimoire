import { Controller, Get, Post, Patch, Delete, Put, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { AddToCollectionDto, UpdateCollectionEntryDto, SetEditionTagsDto, AddToWishlistDto } from './collection.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('collection')
@ApiBearerAuth()
@Controller('collection')
export class CollectionController {
  constructor(
    private readonly collectionService: CollectionService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('stats')
  getStats(@CurrentUser() user: { id: string }) {
    return this.collectionService.getStats(user.id);
  }

  @Get('tags')
  getUserTags(@CurrentUser() user: { id: string }) {
    return this.collectionService.getUserTags(user.id);
  }

  @Get()
  getCollection(
    @CurrentUser() user: { id: string },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('isWishlist') isWishlist?: string,
  ) {
    const wishlistFilter = isWishlist !== undefined ? isWishlist === 'true' : undefined;
    return this.collectionService.getCollection(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      wishlistFilter,
    );
  }

  @Get('status/:editionId')
  getEntryStatus(
    @CurrentUser() user: { id: string },
    @Param('editionId') editionId: string,
  ) {
    return this.collectionService.getEntryStatus(user.id, editionId);
  }

  @Post('wishlist')
  async addToWishlist(
    @CurrentUser() user: { id: string },
    @Body() dto: AddToWishlistDto,
  ) {
    const result = await this.collectionService.addToWishlist(user.id, dto.bookEditionId);
    this.analyticsService.track({
      eventType: 'wishlist_add',
      userId: user.id,
      entityType: 'edition',
      entityId: dto.bookEditionId,
    });
    return result;
  }

  @Post()
  async addToCollection(@CurrentUser() user: { id: string }, @Body() dto: AddToCollectionDto) {
    const result = await this.collectionService.addToCollection(user.id, dto);
    this.analyticsService.track({
      eventType: 'collection_add',
      userId: user.id,
      entityType: 'edition',
      entityId: dto.bookEditionId ?? undefined,
    });
    return result;
  }

  @Patch(':id')
  async updateEntry(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCollectionEntryDto,
  ) {
    const result = await this.collectionService.updateEntry(user.id, id, dto);
    if (dto.readingStatus) {
      this.analyticsService.track({
        eventType: 'book_status_change',
        userId: user.id,
        value: dto.readingStatus,
      });
    }
    return result;
  }

  @Delete(':id')
  removeFromCollection(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.collectionService.removeFromCollection(user.id, id);
  }

  @Put('edition/:editionId/tags')
  setEditionTags(
    @CurrentUser() user: { id: string },
    @Param('editionId') editionId: string,
    @Body() dto: SetEditionTagsDto,
  ) {
    return this.collectionService.setEditionTags(user.id, editionId, dto.tags);
  }
}
