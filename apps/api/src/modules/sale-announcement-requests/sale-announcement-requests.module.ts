import { Module } from '@nestjs/common';
import { SaleAnnouncementRequestsController } from './sale-announcement-requests.controller';
import { SaleAnnouncementRequestsService } from './sale-announcement-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [SaleAnnouncementRequestsController],
  providers: [SaleAnnouncementRequestsService],
})
export class SaleAnnouncementRequestsModule {}