import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReminderSettingsDto {
  renewalEnabled?: boolean;
  renewalInAppEnabled?: boolean;
  renewalPushEnabled?: boolean;
  renewalDaysBefore?: number;
  renewalHour?: number | null;
  renewalDigest?: boolean;

  saleEnabled?: boolean;
  saleInAppEnabled?: boolean;
  salePushEnabled?: boolean;
  saleDaysBefore?: number;
  saleHoursBefore?: number | null;
  saleDigest?: boolean;
}

@Injectable()
export class ReminderSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string) {
    const s = await this.prisma.userReminderSettings.findUnique({ where: { userId } });
    if (!s) {
      return {
        renewalEnabled: false,
        renewalInAppEnabled: true,
        renewalPushEnabled: false,
        renewalDaysBefore: 1,
        renewalHour: null,
        renewalDigest: true,
        saleEnabled: false,
        saleInAppEnabled: true,
        salePushEnabled: false,
        saleDaysBefore: 0,
        saleHoursBefore: null,
        saleDigest: false,
      };
    }
    return s;
  }

  async upsertSettings(userId: string, dto: ReminderSettingsDto) {
    return this.prisma.userReminderSettings.upsert({
      where: { userId },
      create: {
        userId,
        renewalEnabled: dto.renewalEnabled ?? false,
        renewalInAppEnabled: dto.renewalInAppEnabled ?? true,
        renewalPushEnabled: dto.renewalPushEnabled ?? false,
        renewalDaysBefore: dto.renewalDaysBefore ?? 1,
        renewalHour: dto.renewalHour ?? null,
        renewalDigest: dto.renewalDigest ?? true,
        saleEnabled: dto.saleEnabled ?? false,
        saleInAppEnabled: dto.saleInAppEnabled ?? true,
        salePushEnabled: dto.salePushEnabled ?? false,
        saleDaysBefore: dto.saleDaysBefore ?? 0,
        saleHoursBefore: dto.saleHoursBefore ?? null,
        saleDigest: dto.saleDigest ?? false,
      },
      update: {
        ...(dto.renewalEnabled !== undefined && { renewalEnabled: dto.renewalEnabled }),
        ...(dto.renewalInAppEnabled !== undefined && { renewalInAppEnabled: dto.renewalInAppEnabled }),
        ...(dto.renewalPushEnabled !== undefined && { renewalPushEnabled: dto.renewalPushEnabled }),
        ...(dto.renewalDaysBefore !== undefined && { renewalDaysBefore: dto.renewalDaysBefore }),
        ...(Object.prototype.hasOwnProperty.call(dto, 'renewalHour') && { renewalHour: dto.renewalHour }),
        ...(dto.renewalDigest !== undefined && { renewalDigest: dto.renewalDigest }),
        ...(dto.saleEnabled !== undefined && { saleEnabled: dto.saleEnabled }),
        ...(dto.saleInAppEnabled !== undefined && { saleInAppEnabled: dto.saleInAppEnabled }),
        ...(dto.salePushEnabled !== undefined && { salePushEnabled: dto.salePushEnabled }),
        ...(dto.saleDaysBefore !== undefined && { saleDaysBefore: dto.saleDaysBefore }),
        ...(Object.prototype.hasOwnProperty.call(dto, 'saleHoursBefore') && { saleHoursBefore: dto.saleHoursBefore }),
        ...(dto.saleDigest !== undefined && { saleDigest: dto.saleDigest }),
      },
    });
  }
}
