import { Controller, Get, Put, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface PreferenceDto {
  pushEnabled?: boolean;
}

@ApiTags('notification-preferences')
@ApiBearerAuth()
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getPreferences(@CurrentUser() user: { id: string }) {
    const pref = await this.prisma.userNotificationPreference.findUnique({
      where: { userId: user.id },
    });
    return pref ?? { pushEnabled: false };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @CurrentUser() user: { id: string },
    @Body() dto: PreferenceDto,
  ) {
    return this.prisma.userNotificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, pushEnabled: dto.pushEnabled ?? false },
      update: { ...(dto.pushEnabled !== undefined && { pushEnabled: dto.pushEnabled }) },
    });
  }
}

