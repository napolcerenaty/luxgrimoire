import { Module } from '@nestjs/common';
import { FeatureRequestsController } from './feature-requests.controller';
import { FeatureRequestsService } from './feature-requests.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FeatureRequestsController],
  providers: [FeatureRequestsService],
})
export class FeatureRequestsModule {}
