import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReadingImportService } from './reading-import.service';
import { AnalyticsService } from '../analytics/analytics.service';

class ImportCsvDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000_000) // ~20 MB
  csv!: string;
}

@ApiTags('reading-import')
@ApiBearerAuth()
@Controller('reading-import')
export class ReadingImportController {
  constructor(
    private readonly readingImportService: ReadingImportService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Post('preview')
  async preview(@CurrentUser() user: { id: string }, @Body() dto: ImportCsvDto) {
    try {
      return await this.readingImportService.preview(user.id, dto.csv);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('execute')
  async execute(@CurrentUser() user: { id: string }, @Body() dto: ImportCsvDto) {
    try {
      const result = await this.readingImportService.execute(user.id, dto.csv);
      if (result.imported > 0) {
        this.analyticsService.track({
          eventType: 'imported_collection',
          userId: user.id,
          value: String(result.imported),
        });
      }
      return result;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
