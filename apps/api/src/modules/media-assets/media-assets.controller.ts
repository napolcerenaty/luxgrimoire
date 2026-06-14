import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { MediaAssetsService } from './media-assets.service';

@ApiTags('media-assets')
@ApiBearerAuth()
@Controller('media-assets')
export class MediaAssetsController {
  constructor(private readonly service: MediaAssetsService) {}

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('folder') folder?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll({
      search,
      folder,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }
}
