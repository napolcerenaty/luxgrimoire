import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FeatureRequestsService } from './feature-requests.service';
import { CreateFeatureRequestDto } from './feature-requests.dto';
import { Roles, OptionalAuth } from '../../common/decorators/auth.decorators';

@ApiTags('feature-requests')
@Controller('feature-requests')
export class FeatureRequestsController {
  constructor(private readonly service: FeatureRequestsService) {}

  /** Submit a new feature request — auth optional */
  @Post()
  @OptionalAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Body() body: CreateFeatureRequestDto,
    @Request() req: any,
  ) {
    return this.service.submit({
      title: body.title,
      description: body.description,
      userId: req.user?.id,
    });
  }

  /** Public list — accepted only, sorted by votes */
  @Get()
  @OptionalAuth()
  findPublic(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Request() req?: any,
  ) {
    return this.service.findPublic({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      status,
      userId: req?.user?.id,
    });
  }

  /** My submissions */
  @Get('my')
  @ApiBearerAuth()
  findMine(@Request() req: any) {
    return this.service.findMine(req.user.id);
  }

  /** Admin — all requests with filters */
  @Get('admin')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  adminFindAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.service.adminFindAll({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 30,
      status,
    });
  }

  /** Admin — accept or reject with optional note */
  @Patch(':id/review')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  review(
    @Param('id') id: string,
    @Body() body: { status: 'accepted' | 'rejected' | 'implemented'; adminNote?: string },
  ) {
    return this.service.review(id, body);
  }

  /** Toggle vote (authenticated users only) */
  @Post(':id/vote')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  vote(@Param('id') id: string, @Request() req: any) {
    return this.service.toggleVote(id, req.user.id);
  }

  /** Admin delete */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
