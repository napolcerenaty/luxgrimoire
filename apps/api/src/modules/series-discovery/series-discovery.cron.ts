import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SeriesDiscoveryService } from './series-discovery.service';

@Injectable()
export class SeriesDiscoveryCron {
  private readonly logger = new Logger(SeriesDiscoveryCron.name);

  constructor(private readonly service: SeriesDiscoveryService) {}

  /** Runs daily, but each run only processes a small oldest-checked-first batch (env
   * SERIES_DISCOVERY_DAILY_BATCH, default 20 — resolved by the service, same default the
   * manual "Check now" trigger uses) instead of the whole catalog — spreads external API calls
   * evenly across days so a growing series catalog never risks a free tier's daily rate limit,
   * while still cycling every series roughly once every ~2-3 weeks at the default batch size.
   * See the series-discovery plan doc for the reasoning. */
  @Cron('0 6 * * *', { name: 'series-volume-discovery' })
  async run() {
    const result = await this.service.runCheck();
    this.logger.log(`checked ${result.seriesChecked} series, created ${result.suggestionsCreated} suggestions`);
  }
}
