import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseGroupsService } from './purchase-groups.service';
import { CreatePurchaseGroupDto, UpdatePurchaseGroupDto, CreateGroupForEntryDto } from './purchase-groups.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('purchase-groups')
@ApiBearerAuth()
@Controller('collection/bundles')
export class PurchaseGroupsController {
  constructor(private readonly service: PurchaseGroupsService) {}

  /** Create a purchase group for an existing single book entry (standalone purchase) */
  @Post('for-entry/:entryId')
  createGroupForEntry(
    @CurrentUser() user: { id: string },
    @Param('entryId') entryId: string,
    @Body() dto: CreateGroupForEntryDto,
  ) {
    return this.service.createGroupForEntry(user.id, entryId, dto);
  }

  @Get()
  getGroups(@CurrentUser() user: { id: string }) {
    return this.service.getGroups(user.id);
  }

  @Get(':id')
  getGroup(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.getGroup(user.id, id);
  }

  @Post()
  createGroup(@CurrentUser() user: { id: string }, @Body() dto: CreatePurchaseGroupDto) {
    return this.service.createGroup(user.id, dto);
  }

  @Patch(':id')
  updateGroup(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseGroupDto,
  ) {
    return this.service.updateGroup(user.id, id, dto);
  }

  @Delete(':id')
  deleteGroup(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.deleteGroup(user.id, id);
  }
}
