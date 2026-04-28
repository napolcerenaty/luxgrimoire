import { Controller, Post, Delete, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';

class UploadImageDto {
  @IsString()
  data!: string; // base64 data URI: "data:image/jpeg;base64,..."

  @IsOptional()
  @IsString()
  folder?: string;
}

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post('image')
  async uploadImage(@Body() dto: UploadImageDto) {
    const folder = dto.folder ?? 'luxgrimoire/uploads';
    return this.uploadService.uploadImageBase64(dto.data, folder);
  }

  @Post('avatar')
  async uploadAvatar(
    @Body() dto: UploadImageDto,
    @CurrentUser() _user: { id: string },
  ) {
    return this.uploadService.uploadImageBase64(dto.data, 'luxgrimoire/avatars');
  }

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Delete('image')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(@Body() dto: { publicId: string }) {
    await this.uploadService.deleteImage(dto.publicId);
  }
}
