import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CurrencyModule } from '../currency/currency.module';
import { CrowdStatsModule } from '../crowd-stats/crowd-stats.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [PrismaModule, AnalyticsModule, CurrencyModule, CrowdStatsModule, StatsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
