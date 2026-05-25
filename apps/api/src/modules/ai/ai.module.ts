import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { FeatureCategoriesModule } from '../feature-categories/feature-categories.module';

@Module({
  imports: [FeatureCategoriesModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
