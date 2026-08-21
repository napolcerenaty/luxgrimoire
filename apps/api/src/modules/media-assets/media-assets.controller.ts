import { ConflictException, Controller, Delete, Get, Inject, Param, Query, forwardRef } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { UploadService } from '../upload/upload.service';
import { MediaAssetsService } from './media-assets.service';

@ApiTags('media-assets')
@ApiBearerAuth()
@Controller('media-assets')
export class MediaAssetsController {
  constructor(
    private readonly service: MediaAssetsService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => UploadService)) private readonly uploadService: UploadService,
  ) {}

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Get('folders')
  findFolders() {
    return this.service.findFolders();
  }

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('folder') folder?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll({
      search,
      folder,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Roles('ADMIN')
  @Get('admin')
  findAllForAdmin(
    @Query('search') search?: string,
    @Query('folder') folder?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAllWithUsage({
      search,
      folder,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: { id: string; username: string }) {
    const result = await this.service.remove(id, this.uploadService);
    if (!result.deleted) {
      throw new ConflictException('Media asset is still in use and cannot be deleted');
    }
    void this.auditService.log({
      userId: user.id,
      username: user.username,
      action: 'DELETE_MEDIA_ASSET',
      entityType: 'media-asset',
      entityId: id,
      entityTitle: result.publicId,
    });
    return { deleted: true };
  }
}
