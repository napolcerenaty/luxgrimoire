import { Controller, Get, Put, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface PreferenceDto {
  renewalReminderEnabled?: boolean;
  renewalReminderDays?: number;
  saleReminderEnabled?: boolean;
  saleReminderDays?: number;
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
    return pref ?? {
      renewalReminderEnabled: true,
      renewalReminderDays: 3,
      saleReminderEnabled: true,
      saleReminderDays: 3,
      pushEnabled: false,
    };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @CurrentUser() user: { id: string },
    @Body() dto: PreferenceDto,
  ) {
    return this.prisma.userNotificationPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        renewalReminderEnabled: dto.renewalReminderEnabled ?? true,
        renewalReminderDays: dto.renewalReminderDays ?? 3,
        saleReminderEnabled: dto.saleReminderEnabled ?? true,
        saleReminderDays: dto.saleReminderDays ?? 3,
        pushEnabled: dto.pushEnabled ?? false,
      },
      update: {
        ...(dto.renewalReminderEnabled !== undefined && { renewalReminderEnabled: dto.renewalReminderEnabled }),
        ...(dto.renewalReminderDays !== undefined && { renewalReminderDays: dto.renewalReminderDays }),
        ...(dto.saleReminderEnabled !== undefined && { saleReminderEnabled: dto.saleReminderEnabled }),
        ...(dto.saleReminderDays !== undefined && { saleReminderDays: dto.saleReminderDays }),
        ...(dto.pushEnabled !== undefined && { pushEnabled: dto.pushEnabled }),
      },
    });
  }
}
