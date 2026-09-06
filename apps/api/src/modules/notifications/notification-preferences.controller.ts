import { Controller, Get, Put, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AnalyticsService } from '../analytics/analytics.service';

interface PreferenceDto {
  pushEnabled?: boolean;
}

@ApiTags('notification-preferences')
@ApiBearerAuth()
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

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
    const previous = await this.prisma.userNotificationPreference.findUnique({
      where: { userId: user.id },
      select: { pushEnabled: true },
    });

    const result = await this.prisma.userNotificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, pushEnabled: dto.pushEnabled ?? false },
      update: { ...(dto.pushEnabled !== undefined && { pushEnabled: dto.pushEnabled }) },
    });

    // Activation funnel (growth roadmap Faza 0): fire only on the off -> on transition.
    if (dto.pushEnabled === true && !previous?.pushEnabled) {
      this.analytics.track({ eventType: 'enabled_notifications', userId: user.id });
    }

    return result;
  }
}
