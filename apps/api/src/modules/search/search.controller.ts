import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { SearchService } from './search.service';
import { AnalyticsService } from '../analytics/analytics.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Public()
  @Get()
  async search(
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.searchService.search(
      q ?? '',
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
    const query = (q ?? '').slice(0, 200);
    const r = result as { books?: unknown[]; authors?: unknown[]; artists?: unknown[]; companies?: unknown[] };
    const total = (r.books?.length ?? 0) + (r.authors?.length ?? 0) + (r.artists?.length ?? 0) + (r.companies?.length ?? 0);
    this.analyticsService.track({
      eventType: total > 0 ? 'search' : 'search_no_results',
      entityType: 'search',
      value: query,
    });
    return result;
  }
}
