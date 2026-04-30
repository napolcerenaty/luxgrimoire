import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { BackupService } from './backup.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/backups')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /** List all backup files with size and date. */
  @Get()
  listBackups() {
    return this.backupService.listBackups().map((b) => ({
      name: b.name,
      sizeMB: b.sizeMB,
      date: b.date,
    }));
  }

  /** Trigger a manual backup immediately. */
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async triggerBackup() {
    const backup = await this.backupService.createBackup();
    const retention = this.backupService.applyRetention();
    return {
      message: 'Backup created successfully',
      backup: { name: backup.name, sizeMB: backup.sizeMB, date: backup.date },
      retention,
    };
  }

  /** Apply retention policy now (dry-run: lists what would be deleted). */
  @Post('retention')
  @HttpCode(HttpStatus.OK)
  applyRetention() {
    const result = this.backupService.applyRetention();
    return { message: 'Retention applied', ...result };
  }
}
