import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { UploadModule } from '../upload/upload.module';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { BlogPollCronService } from './blog-poll.cron';

@Module({
  imports: [AiModule, UploadModule],
  controllers: [NewsController],
  providers: [NewsService, BlogPollCronService],
  exports: [NewsService],
})
export class NewsModule {}
