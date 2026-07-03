import { Module } from '@nestjs/common';
import { PurchaseGroupsService } from './purchase-groups.service';
import { PurchaseGroupsController } from './purchase-groups.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [PrismaModule, StatsModule],
  controllers: [PurchaseGroupsController],
  providers: [PurchaseGroupsService],
  exports: [PurchaseGroupsService],
})
export class PurchaseGroupsModule {}
