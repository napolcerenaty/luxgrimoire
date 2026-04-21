import { Controller, Post, Delete, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { UploadService } from './upload.service';

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Roles('ADMIN', 'MODERATOR')
  @Post('image')
  async uploadImage(@Req() req: any) {
    const data = await req.file();
    if (!data) throw new Error('No file uploaded');
    const buffer = await data.toBuffer();
    const folder = (data.fields as Record<string, { value: string }>)?.folder?.value ?? 'uploads';
    return this.uploadService.uploadImage(buffer, folder);
  }

  @Roles('ADMIN', 'MODERATOR')
  @Delete('image/:publicId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(@Param('publicId') publicId: string) {
    await this.uploadService.deleteImage(publicId);
  }
}
