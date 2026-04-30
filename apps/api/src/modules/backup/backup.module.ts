import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BackupCronService } from './backup.cron';
import { BackupController } from './backup.controller';

@Module({
  providers: [BackupService, BackupCronService],
  controllers: [BackupController],
  exports: [BackupService],
})
export class BackupModule {}
