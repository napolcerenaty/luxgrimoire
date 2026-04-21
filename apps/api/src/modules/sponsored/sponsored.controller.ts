import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SponsoredService } from './sponsored.service';
import { CreateSponsoredSlotDto, UpdateSponsoredSlotDto } from './sponsored.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';

@ApiTags('sponsored')
@Controller('sponsored')
export class SponsoredController {
  constructor(private readonly sponsoredService: SponsoredService) {}

  @Public()
  @Get('active')
  getActiveSlots(@Query('slotType') slotType?: string) {
    return this.sponsoredService.getActiveSlots(slotType);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('stats')
  getRevenueStats() {
    return this.sponsoredService.getRevenueStats();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get()
  getAllSlots(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.sponsoredService.getAllSlots(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get(':id')
  getSlotById(@Param('id') id: string) {
    return this.sponsoredService.getSlotById(id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post()
  createSlot(@Body() dto: CreateSponsoredSlotDto) {
    return this.sponsoredService.createSlot(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Patch(':id')
  updateSlot(@Param('id') id: string, @Body() dto: UpdateSponsoredSlotDto) {
    return this.sponsoredService.updateSlot(id, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':id')
  deleteSlot(@Param('id') id: string) {
    return this.sponsoredService.deleteSlot(id);
  }
}
