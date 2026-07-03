import { Controller, Get, Put, Body } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReminderSettingsService, ReminderSettingsDto } from './reminder-settings.service';
import { ScheduledRemindersService } from './scheduled-reminders.service';

@Controller('reminder-settings')
export class ReminderSettingsController {
  constructor(
    private readonly settingsService: ReminderSettingsService,
    private readonly remindersService: ScheduledRemindersService,
  ) {}

  @Get()
  getSettings(@CurrentUser() user: { id: string }) {
    return this.settingsService.getSettings(user.id);
  }

  @Put()
  async updateSettings(@CurrentUser() user: { id: string }, @Body() dto: ReminderSettingsDto) {
    const updated = await this.settingsService.upsertSettings(user.id, dto);
    this.remindersService.recalculateForUser(user.id).catch(() => {});
    return updated;
  }
}
