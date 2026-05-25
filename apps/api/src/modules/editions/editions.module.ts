import { Module } from '@nestjs/common';
import { EditionsController } from './editions.controller';
import { EditionsService } from './editions.service';
import { UserEditionImagesService } from './user-edition-images.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { UploadModule } from '../upload/upload.module';
import { FeatureCategoriesModule } from '../feature-categories/feature-categories.module';

@Module({
  imports: [AnalyticsModule, UploadModule, FeatureCategoriesModule],
  controllers: [EditionsController],
  providers: [EditionsService, UserEditionImagesService],
  exports: [UserEditionImagesService],
})
export class EditionsModule {}
