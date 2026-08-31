import { Module } from '@nestjs/common';
import { ArtistsController } from './artists.controller';
import { ArtistsService } from './artists.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { UploadModule } from '../upload/upload.module';
import { EditionsModule } from '../editions/editions.module';

@Module({
  imports: [AnalyticsModule, UploadModule, EditionsModule],
  controllers: [ArtistsController],
  providers: [ArtistsService],
})
export class ArtistsModule {}
