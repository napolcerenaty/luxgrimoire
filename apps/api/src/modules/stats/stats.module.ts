import { Module } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { SpendingStatsComputer } from './computers/spending-stats.computer';
import { CollectionStatsComputer } from './computers/collection-stats.computer';
import { FeaturesStatsComputer } from './computers/features-stats.computer';
import { CurrencyModule } from '../currency/currency.module';
import { FeatureCategoriesModule } from '../feature-categories/feature-categories.module';

@Module({
  imports: [CurrencyModule, FeatureCategoriesModule],
  providers: [StatsService, SpendingStatsComputer, CollectionStatsComputer, FeaturesStatsComputer],
  controllers: [StatsController],
  exports: [StatsService],
})
export class StatsModule {}
