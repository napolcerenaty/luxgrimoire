import { Controller, Get, Patch, Delete, Post, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/auth.decorators';
import { SeriesDiscoveryService } from './series-discovery.service';
import { UpdateSeriesVolumeSuggestionStatusDto, AddExcludedKeywordDto } from './series-discovery.dto';

@ApiTags('series-discovery')
@Controller()
export class SeriesDiscoveryController {
  constructor(private readonly service: SeriesDiscoveryService) {}

  @Get('admin/series-volume-suggestions')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findSuggestions(page ? Number(page) : 1, pageSize ? Number(pageSize) : 30, status);
  }

  @Patch('admin/series-volume-suggestions/:id/status')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  updateStatus(@Param('id') id: string, @Body() body: UpdateSeriesVolumeSuggestionStatusDto) {
    return this.service.updateSuggestionStatus(id, body.status, body.adminNote);
  }

  @Delete('admin/series-volume-suggestions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.service.removeSuggestion(id);
  }

  @Post('admin/series-discovery/run')
  @ApiBearerAuth()
  @Roles('ADMIN')
  // Hits three external APIs per series across the whole non-completed catalog — keep this rare.
  @Throttle({ default: { ttl: 60_000, limit: 1 } })
  run() {
    return this.service.runCheck();
  }

  @Get('admin/series-discovery/excluded-keywords')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  listExcludedKeywords() {
    return this.service.listExcludedKeywords();
  }

  @Post('admin/series-discovery/excluded-keywords')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  addExcludedKeyword(@Body() body: AddExcludedKeywordDto) {
    return this.service.addExcludedKeyword(body.keyword);
  }

  @Delete('admin/series-discovery/excluded-keywords/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  removeExcludedKeyword(@Param('id') id: string) {
    return this.service.removeExcludedKeyword(id);
  }
}
