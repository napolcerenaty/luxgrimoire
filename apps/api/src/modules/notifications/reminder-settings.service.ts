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
  saleMinutesBefore?: number | null;
  saleDigest?: boolean;

  bookChoiceEnabled?: boolean;
  bookChoiceInAppEnabled?: boolean;
  bookChoicePushEnabled?: boolean;
  bookChoiceDaysBefore?: number;

  appNotifPushEnabled?: boolean;

  newEditionFollowInAppEnabled?: boolean;
  newEditionFollowPushEnabled?: boolean;

  seriesContinuationInAppEnabled?: boolean;
  seriesContinuationPushEnabled?: boolean;
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
        saleMinutesBefore: null,
        // null means "use default" (180 minutes = 3h before)
        saleDigest: false,
        bookChoiceEnabled: false,
        bookChoiceInAppEnabled: true,
        bookChoicePushEnabled: false,
        bookChoiceDaysBefore: 3,
        appNotifPushEnabled: false,
        newEditionFollowInAppEnabled: true,
        newEditionFollowPushEnabled: true,
        seriesContinuationInAppEnabled: true,
        seriesContinuationPushEnabled: true,
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
        saleMinutesBefore: dto.saleMinutesBefore ?? null,
        saleDigest: dto.saleDigest ?? false,
        bookChoiceEnabled: dto.bookChoiceEnabled ?? false,
        bookChoiceInAppEnabled: dto.bookChoiceInAppEnabled ?? true,
        bookChoicePushEnabled: dto.bookChoicePushEnabled ?? false,
        bookChoiceDaysBefore: dto.bookChoiceDaysBefore ?? 3,
        appNotifPushEnabled: dto.appNotifPushEnabled ?? false,
        newEditionFollowInAppEnabled: dto.newEditionFollowInAppEnabled ?? true,
        newEditionFollowPushEnabled: dto.newEditionFollowPushEnabled ?? true,
        seriesContinuationInAppEnabled: dto.seriesContinuationInAppEnabled ?? true,
        seriesContinuationPushEnabled: dto.seriesContinuationPushEnabled ?? true,
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
        ...(Object.prototype.hasOwnProperty.call(dto, 'saleMinutesBefore') && { saleMinutesBefore: dto.saleMinutesBefore }),
        ...(dto.saleDigest !== undefined && { saleDigest: dto.saleDigest }),
        ...(dto.bookChoiceEnabled !== undefined && { bookChoiceEnabled: dto.bookChoiceEnabled }),
        ...(dto.bookChoiceInAppEnabled !== undefined && { bookChoiceInAppEnabled: dto.bookChoiceInAppEnabled }),
        ...(dto.bookChoicePushEnabled !== undefined && { bookChoicePushEnabled: dto.bookChoicePushEnabled }),
        ...(dto.bookChoiceDaysBefore !== undefined && { bookChoiceDaysBefore: dto.bookChoiceDaysBefore }),
        ...(dto.appNotifPushEnabled !== undefined && { appNotifPushEnabled: dto.appNotifPushEnabled }),
        ...(dto.newEditionFollowInAppEnabled !== undefined && { newEditionFollowInAppEnabled: dto.newEditionFollowInAppEnabled }),
        ...(dto.newEditionFollowPushEnabled !== undefined && { newEditionFollowPushEnabled: dto.newEditionFollowPushEnabled }),
        ...(dto.seriesContinuationInAppEnabled !== undefined && { seriesContinuationInAppEnabled: dto.seriesContinuationInAppEnabled }),
        ...(dto.seriesContinuationPushEnabled !== undefined && { seriesContinuationPushEnabled: dto.seriesContinuationPushEnabled }),
      },
    });
  }
}
