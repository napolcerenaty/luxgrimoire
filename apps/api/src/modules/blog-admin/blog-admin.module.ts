import { Module } from '@nestjs/common';
import { BlogAdminController } from './blog-admin.controller';
import { BlogAdminService } from './blog-admin.service';

@Module({
  controllers: [BlogAdminController],
  providers: [BlogAdminService],
})
export class BlogAdminModule {}
