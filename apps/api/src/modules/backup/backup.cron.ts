import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BackupService } from './backup.service';

@Injectable()
export class BackupCronService {
  private readonly logger = new Logger(BackupCronService.name);

  constructor(private readonly backupService: BackupService) {}

  /** Daily at 03:00 — creates backup and applies retention policy. */
  @Cron('0 3 * * *')
  async runDailyBackup() {
    this.logger.log('[Backup] Daily cron triggered');
    try {
      await this.backupService.createBackup();
      this.backupService.applyRetention();
    } catch (err) {
      this.logger.error('[Backup] Daily cron failed', err);
    }
  }
}
