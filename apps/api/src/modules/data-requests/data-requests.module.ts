import { Module } from '@nestjs/common';
import { DataRequestsController } from './data-requests.controller';
import { DataRequestsService } from './data-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DataRequestsController],
  providers: [DataRequestsService],
})
export class DataRequestsModule {}