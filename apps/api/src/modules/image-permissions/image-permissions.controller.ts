import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { ImagePermissionsService } from './image-permissions.service';
import { UpdateImagePermissionDto, CreateCommunicationDto, UpdateCommunicationDto } from './image-permissions.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/image-permissions')
export class ImagePermissionsController {
  constructor(
    private readonly imagePermissionsService: ImagePermissionsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findAll() {
    return this.imagePermissionsService.findAll();
  }

  @Patch(':companyId')
  async updatePermission(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateImagePermissionDto,
    @CurrentUser() user: { id: string; username: string },
  ) {
    const result = await this.imagePermissionsService.upsertPermission(companyId, dto);
    const action =
      dto.status === 'GRANTED' ? 'GRANT_IMAGE_PERMISSION' :
      dto.status === 'REVOKED' ? 'REVOKE_IMAGE_PERMISSION' :
      'UPDATE_IMAGE_PERMISSION';
    void this.auditService.log({
      userId: user.id,
      username: user.username,
      action,
      entityType: 'company_image_permission',
      entityId: companyId,
      metadata: { status: dto.status },
    });
    return result;
  }

  @Get(':companyId/communications')
  listCommunications(@Param('companyId') companyId: string) {
    return this.imagePermissionsService.listCommunications(companyId);
  }

  @Post(':companyId/communications')
  async createCommunication(
    @Param('companyId') companyId: string,
    @Body() dto: CreateCommunicationDto,
    @CurrentUser() user: { id: string; username: string },
  ) {
    const result = await this.imagePermissionsService.createCommunication(companyId, dto);
    void this.auditService.log({
      userId: user.id,
      username: user.username,
      action: 'LOG_PERMISSION_COMMUNICATION',
      entityType: 'company_permission_communication',
      entityId: result.id,
      metadata: { companyId, channel: dto.channel, subject: dto.subject },
    });
    return result;
  }

  @Patch('communications/:id')
  async updateCommunication(
    @Param('id') id: string,
    @Body() dto: UpdateCommunicationDto,
    @CurrentUser() user: { id: string; username: string },
  ) {
    const result = await this.imagePermissionsService.updateCommunication(id, dto);
    void this.auditService.log({
      userId: user.id,
      username: user.username,
      action: 'UPDATE_PERMISSION_COMMUNICATION',
      entityType: 'company_permission_communication',
      entityId: id,
      metadata: { responded: dto.responded },
    });
    return result;
  }
}
