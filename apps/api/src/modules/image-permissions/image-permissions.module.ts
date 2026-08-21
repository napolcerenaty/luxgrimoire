import { Module } from '@nestjs/common';
import { ImagePermissionsController } from './image-permissions.controller';
import { ImagePermissionsService } from './image-permissions.service';

@Module({
  controllers: [ImagePermissionsController],
  providers: [ImagePermissionsService],
})
export class ImagePermissionsModule {}
