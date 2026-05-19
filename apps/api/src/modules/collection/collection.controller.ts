import { Controller, Get, Post, Patch, Delete, Put, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { AddToCollectionDto, UpdateCollectionEntryDto, SetEditionTagsDto, AddToWishlistDto, UpdateEditionOwnershipDto, AddTrackingDto, UpdateTrackingDto } from './collection.dto';
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

  @Get('subscriptions')
  getCollectionSubscriptions(@CurrentUser() user: { id: string }) {
    return this.collectionService.getCollectionSubscriptions(user.id);
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
    @Query('slim') slim?: string,
    @Query('ownershipStatus') ownershipStatus?: string,
  ) {
    const wishlistFilter = isWishlist !== undefined ? isWishlist === 'true' : undefined;
    const slimMode = slim === 'true';
    return this.collectionService.getCollection(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      wishlistFilter,
      slimMode,
      ownershipStatus,
    );
  }

  @Get('status/:editionId')
  getEntryStatus(
    @CurrentUser() user: { id: string },
    @Param('editionId') editionId: string,
  ) {
    return this.collectionService.getEntryStatus(user.id, editionId);
  }

  @Get('edition/:editionId/entry')
  getEntryByEdition(
    @CurrentUser() user: { id: string },
    @Param('editionId') editionId: string,
  ) {
    return this.collectionService.getEntriesByEditionId(user.id, editionId);
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

  @Post(':id/tracking')
  async addTracking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: AddTrackingDto,
  ) {
    const result = await this.collectionService.addTracking(user.id, id, dto.trackingNumber, dto.label);
    this.analyticsService.track({ eventType: 'tracking_add', userId: user.id });
    return result;
  }

  @Patch(':id/tracking/:trackingId')
  async updateTracking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('trackingId') trackingId: string,
    @Body() dto: UpdateTrackingDto,
  ) {
    return this.collectionService.updateTracking(user.id, id, trackingId, dto.trackingNumber, dto.label);
  }

  @Delete(':id/tracking/:trackingId')
  async removeTracking(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('trackingId') trackingId: string,
  ) {
    return this.collectionService.removeTracking(user.id, id, trackingId);
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

  @Post('entry/:entryId/history')
  addOwnershipHistoryEntry(
    @CurrentUser() user: { id: string },
    @Param('entryId') entryId: string,
    @Body() dto: { status: string; changedAt?: string },
  ) {
    return this.collectionService.addOwnershipHistoryEntry(user.id, entryId, dto);
  }

  @Patch('entry/:entryId/history/:historyId')
  updateOwnershipHistoryEntry(
    @CurrentUser() user: { id: string },
    @Param('entryId') entryId: string,
    @Param('historyId') historyId: string,
    @Body() dto: { status?: string; changedAt?: string },
  ) {
    return this.collectionService.updateOwnershipHistoryEntry(user.id, entryId, historyId, dto);
  }

  @Delete('entry/:entryId/history/:historyId')
  deleteOwnershipHistoryEntry(
    @CurrentUser() user: { id: string },
    @Param('entryId') entryId: string,
    @Param('historyId') historyId: string,
  ) {
    return this.collectionService.deleteOwnershipHistoryEntry(user.id, entryId, historyId);
  }

  @Put('entry/:entryId/tags')
  setEntryTags(
    @CurrentUser() user: { id: string },
    @Param('entryId') entryId: string,
    @Body() dto: SetEditionTagsDto,
  ) {
    return this.collectionService.setEntryTags(user.id, entryId, dto.tags);
  }
}
