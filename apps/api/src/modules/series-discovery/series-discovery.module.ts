import { Module } from '@nestjs/common';
import { SeriesDiscoveryController } from './series-discovery.controller';
import { SeriesDiscoveryService } from './series-discovery.service';
import { SeriesDiscoveryCron } from './series-discovery.cron';
import { GoogleBooksClient } from './clients/google-books.client';
import { OpenLibraryClient } from './clients/open-library.client';
import { WikidataClient } from './clients/wikidata.client';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SeriesDiscoveryController],
  providers: [SeriesDiscoveryService, SeriesDiscoveryCron, GoogleBooksClient, OpenLibraryClient, WikidataClient],
})
export class SeriesDiscoveryModule {}
