import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BugReportsService } from './bug-reports.service';
import { CreateBugReportDto } from './bug-reports.dto';
import { Roles, OptionalAuth } from '../../common/decorators/auth.decorators';

@ApiTags('bug-reports')
@Controller('bug-reports')
export class BugReportsController {
  constructor(private readonly bugReportsService: BugReportsService) {}

  /** Anyone can submit — auth optional (userId captured when logged in) */
  @Post()
  @OptionalAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateBugReportDto,
    @Request() req: any,
  ) {
    return this.bugReportsService.create({
      userId: req.user?.id ?? undefined,
      title: body.title,
      description: body.description,
      pageUrl: body.pageUrl,
      category: body.category,
      contactEmail: body.contactEmail,
    });
  }

  @Get()
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.bugReportsService.findAll(
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 30,
      status,
    );
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.bugReportsService.updateStatus(id, body.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.bugReportsService.remove(id);
  }
}
