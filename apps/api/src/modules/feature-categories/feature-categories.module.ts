import { Module } from '@nestjs/common';
import { FeatureCategoriesController } from './feature-categories.controller';
import { FeatureCategoriesService } from './feature-categories.service';
import { FeatureTaggerService } from './feature-tagger.service';

@Module({
  controllers: [FeatureCategoriesController],
  providers: [FeatureCategoriesService, FeatureTaggerService],
  exports: [FeatureCategoriesService, FeatureTaggerService],
})
export class FeatureCategoriesModule {}
