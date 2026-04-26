import { Controller, Get, Post, Patch, Delete, Put, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { AddToCollectionDto, UpdateCollectionEntryDto, SetEditionTagsDto } from './collection.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('collection')
@ApiBearerAuth()
@Controller('collection')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

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
  ) {
    return this.collectionService.getCollection(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Post()
  addToCollection(@CurrentUser() user: { id: string }, @Body() dto: AddToCollectionDto) {
    return this.collectionService.addToCollection(user.id, dto);
  }

  @Patch(':id')
  updateEntry(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCollectionEntryDto,
  ) {
    return this.collectionService.updateEntry(user.id, id, dto);
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
