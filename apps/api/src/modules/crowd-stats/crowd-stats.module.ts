import { Module } from '@nestjs/common';
import { CrowdStatsController } from './crowd-stats.controller';
import { CrowdStatsService } from './crowd-stats.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, CurrencyModule],
  controllers: [CrowdStatsController],
  providers: [CrowdStatsService],
  exports: [CrowdStatsService],
})
export class CrowdStatsModule {}
