import { Module } from '@nestjs/common';
import { SaleInterestsController } from './sale-interests.controller';
import { SaleInterestsService } from './sale-interests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SaleInterestsController],
  providers: [SaleInterestsService],
})
export class SaleInterestsModule {}
