import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SaleInterestsService } from './sale-interests.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('sale-interests')
@ApiBearerAuth()
@Controller('sale-interests')
export class SaleInterestsController {
  constructor(private readonly service: SaleInterestsService) {}

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.service.findAll(user.id);
  }

  @Get(':announcementId')
  findOne(@CurrentUser() user: { id: string }, @Param('announcementId') announcementId: string) {
    return this.service.findOne(user.id, announcementId);
  }

  @Post(':announcementId')
  upsert(
    @CurrentUser() user: { id: string },
    @Param('announcementId') announcementId: string,
    @Body() body: { tier?: string; regionId?: string | null },
  ) {
    return this.service.upsert(user.id, announcementId, body.tier ?? 'GS', body.regionId);
  }

  @Delete(':announcementId')
  remove(@CurrentUser() user: { id: string }, @Param('announcementId') announcementId: string) {
    return this.service.remove(user.id, announcementId);
  }
}
