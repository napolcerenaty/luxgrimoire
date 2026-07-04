import { Module } from '@nestjs/common';
import { MediaAssetsModule } from '../media-assets/media-assets.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [MediaAssetsModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService, MediaAssetsModule],
})
export class UploadModule {}
