import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ImportSourcesService } from './import-sources.service';
import {
  CreateImportSourceDto,
  UpdateImportSourceDto,
  ScrapeUrlDto,
  ScrapeParentDto,
  ApprovePendingDto,
  RejectPendingDto,
} from './import-sources.dto';

@ApiTags('import-sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MODERATOR')
@Controller('admin/import')
export class ImportSourcesController {
  constructor(private readonly service: ImportSourcesService) {}

  // ---------------------------------------------------------------------------
  // Import Sources CRUD
  // ---------------------------------------------------------------------------

  @Get('sources')
  @ApiOperation({ summary: 'List import sources' })
  @ApiQuery({ name: 'subscriptionId', required: false })
  findAll(@Query('subscriptionId') subscriptionId?: string) {
    return this.service.findAll(subscriptionId);
  }

  @Get('sources/:id')
  @ApiOperation({ summary: 'Get one import source' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('sources')
  @ApiOperation({ summary: 'Create import source' })
  create(@Body() dto: CreateImportSourceDto) {
    return this.service.create(dto);
  }

  @Put('sources/:id')
  @ApiOperation({ summary: 'Update import source' })
  update(@Param('id') id: string, @Body() dto: UpdateImportSourceDto) {
    return this.service.update(id, dto);
  }

  @Delete('sources/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete import source' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('sources/:id/check')
  @ApiOperation({ summary: 'Trigger immediate check for a source' })
  triggerCheck(@Param('id') id: string) {
    return this.service.triggerCheck(id);
  }

  // ---------------------------------------------------------------------------
  // Scraping endpoints
  // ---------------------------------------------------------------------------

  @Post('scrape')
  @ApiOperation({ summary: 'Scrape a single blog post URL for month data' })
  scrapeUrl(@Body() dto: ScrapeUrlDto) {
    return this.service.scrapeUrl(dto.url, dto.subscriptionId, dto.companyId);
  }

  @Post('scrape-parent')
  @ApiOperation({ summary: 'Scrape a listing page to extract post URLs' })
  scrapeParent(@Body() dto: ScrapeParentDto) {
    return this.service.scrapeParent(dto.url);
  }

  // ---------------------------------------------------------------------------
  // Pending imports
  // ---------------------------------------------------------------------------

  @Get('pending')
  @ApiOperation({ summary: 'List pending month imports' })
  @ApiQuery({ name: 'subscriptionId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  findPending(
    @Query('subscriptionId') subscriptionId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findPending(subscriptionId, status);
  }

  @Post('pending/from-scrape')
  @ApiOperation({ summary: 'Save scraped data as a pending import' })
  createPending(
    @Body()
    body: {
      subscriptionId?: string;
      year: number;
      month: number;
      theme?: string;
      coverImageUrl?: string;
      bookTitle?: string;
      bookAuthor?: string;
      sourceUrl: string;
      allImages?: string[];
    },
  ) {
    return this.service.createPending(body);
  }

  @Patch('pending/:id/approve')
  @ApiOperation({ summary: 'Approve a pending import — creates the subscription month' })
  approve(@Param('id') id: string, @Body() dto: ApprovePendingDto) {
    return this.service.approvePending(id, dto.adminNote);
  }

  @Patch('pending/:id/reject')
  @ApiOperation({ summary: 'Reject a pending import' })
  reject(@Param('id') id: string, @Body() dto: RejectPendingDto) {
    return this.service.rejectPending(id, dto.adminNote);
  }
}
