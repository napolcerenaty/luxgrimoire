import { Module } from '@nestjs/common';
import { AuthorsController } from './authors.controller';
import { AuthorsService } from './authors.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MediaAssetsModule } from '../media-assets/media-assets.module';
import { EditionsModule } from '../editions/editions.module';

@Module({
  imports: [AnalyticsModule, MediaAssetsModule, EditionsModule],
  controllers: [AuthorsController],
  providers: [AuthorsService],
})
export class AuthorsModule {}
