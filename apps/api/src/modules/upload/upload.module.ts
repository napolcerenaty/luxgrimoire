import { Module } from '@nestjs/common';
import { MediaAssetsModule } from '../media-assets/media-assets.module';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [MediaAssetsModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService, MediaAssetsService],
})
export class UploadModule {}
