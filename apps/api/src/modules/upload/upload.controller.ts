import { Controller, Post, Delete, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
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

class DeleteImageDto {
  @IsString()
  @IsNotEmpty()
  publicId!: string;
}

const ALLOWED_MIME_RE = /^data:image\/(png|jpeg|webp);base64,/;

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER', 'USER')
  @Post('image')
  async uploadImage(@Body() dto: UploadImageDto) {
    const folder = dto.folder ?? 'luxgrimoire/uploads';
    return this.uploadService.uploadImageBase64(dto.data, folder);
  }

  @Roles('USER', 'ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('avatar')
  async uploadAvatar(
    @Body() dto: UploadImageDto,
    @CurrentUser() _user: { id: string },
  ) {
    if (!ALLOWED_MIME_RE.test(dto.data)) {
      throw new BadRequestException('Only PNG, JPEG, or WebP images are accepted');
    }
    return this.uploadService.uploadImageBase64(dto.data, 'luxgrimoire/avatars');
  }

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER', 'USER')
  @Delete('image')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(@Body() dto: DeleteImageDto) {
    await this.uploadService.deleteImage(dto.publicId);
  }
}
