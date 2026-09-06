import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SeriesContinuationService } from './series-continuation.service';
import { SeriesContinuationCron } from './series-continuation.cron';

@Module({
  imports: [NotificationsModule],
  providers: [SeriesContinuationService, SeriesContinuationCron],
  exports: [SeriesContinuationService],
})
export class SeriesContinuationModule {}
