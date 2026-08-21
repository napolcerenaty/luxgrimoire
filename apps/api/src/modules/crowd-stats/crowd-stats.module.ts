import { Module } from '@nestjs/common';
import { CrowdStatsController } from './crowd-stats.controller';
import { CrowdStatsService } from './crowd-stats.service';
import { SubscriberCountReconcileCronService } from './subscriber-count-reconcile.cron';
import { PrismaModule } from '../../prisma/prisma.module';
import { CurrencyModule } from '../currency/currency.module';
import { AnnouncementsModule } from '../announcements/announcements.module';

@Module({
  imports: [PrismaModule, CurrencyModule, AnnouncementsModule],
  controllers: [CrowdStatsController],
  providers: [CrowdStatsService, SubscriberCountReconcileCronService],
  exports: [CrowdStatsService],
})
export class CrowdStatsModule {}
