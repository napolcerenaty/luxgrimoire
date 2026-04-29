import { Controller, Get, Post, Patch, Delete, Put, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { AddToCollectionDto, UpdateCollectionEntryDto, SetEditionTagsDto, AddToWishlistDto, UpdateEditionOwnershipDto } from './collection.dto';
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
      entityName: dto._entityName,
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
      entityName: dto._entityName,
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
        entityType: 'edition',
        entityId: result.editionId ?? undefined,
        value: dto.readingStatus,
      });
    }
    if (dto.ownershipStatus) {
      this.analyticsService.track({
        eventType: 'collection_status',
        userId: user.id,
        entityType: 'edition',
        entityId: result.editionId ?? undefined,
        value: dto.ownershipStatus,
      });
    }
    if (dto.trackingNumber && dto.trackingNumber.trim()) {
      this.analyticsService.track({
        eventType: 'tracking_add',
        userId: user.id,
        entityType: 'edition',
        entityId: result.editionId ?? undefined,
      });
    }
    return result;
  }

  @Post(':id/tracking-click')
  async trackTrackingClick(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    // Fire-and-forget: log that user clicked the tracking link (no tracking number stored — GDPR)
    const entry = await this.collectionService.getEntryForTracking(id, user.id);
    this.analyticsService.track({
      eventType: 'tracking_click',
      userId: user.id,
      entityType: 'edition',
      entityId: entry?.editionId ?? undefined,
      // value intentionally omitted — tracking numbers are personal data (GDPR)
    });
    return { ok: true };
  }

  @Delete(':id')
  async removeFromCollection(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const entry = await this.collectionService.removeFromCollection(user.id, id);
    this.analyticsService.track({
      eventType: 'collection_remove',
      userId: user.id,
      entityType: 'edition',
      entityId: entry?.editionId ?? undefined,
    });
  }

  @Patch('edition/:editionId/ownership')
  async updateEditionOwnership(
    @CurrentUser() user: { id: string },
    @Param('editionId') editionId: string,
    @Body() dto: UpdateEditionOwnershipDto,
  ) {
    return this.collectionService.updateByEdition(user.id, editionId, dto.ownershipStatus);
  }

  @Get('entry/:entryId/history')
  getOwnershipHistory(
    @CurrentUser() user: { id: string },
    @Param('entryId') entryId: string,
  ) {
    return this.collectionService.getOwnershipHistory(user.id, entryId);
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
