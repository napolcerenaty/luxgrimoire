import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface BackupFile {
  name: string;
  sizeMB: string;
  date: Date;
  path: string;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly retentionDays: number;
  private readonly keepLast: number;

  constructor(private readonly config: ConfigService) {
    this.backupDir = config.get<string>(
      'BACKUP_DIR',
      path.join(process.cwd(), 'backups'),
    );
    this.retentionDays = parseInt(
      config.get<string>('BACKUP_RETENTION_DAYS', '14'),
      10,
    );
    this.keepLast = parseInt(config.get<string>('BACKUP_KEEP_LAST', '7'), 10);
  }

  private ensureDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /** Finds pg_dump binary — checks PATH first, then common Windows install paths. */
  private async findPgDump(): Promise<string> {
    const customPath = this.config.get<string>('PGDUMP_PATH');
    if (customPath) return `"${customPath}"`;

    try {
      await execAsync('pg_dump --version');
      return 'pg_dump';
    } catch {
      const candidates = [
        'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return `"${candidate}"`;
      }
      throw new Error(
        'pg_dump not found. Add PostgreSQL bin dir to PATH or set PGDUMP_PATH in .env',
      );
    }
  }

  async createBackup(): Promise<BackupFile> {
    this.ensureDir();

    const timestamp = new Date()
      .toISOString()
      .replace('T', '_')
      .replace(/:/g, '-')
      .split('.')[0];
    const filename = `backup_${timestamp}.sql`;
    const filepath = path.join(this.backupDir, filename);

    const databaseUrl = this.config.get<string>('DATABASE_URL');
    const pgDump = await this.findPgDump();

    this.logger.log(`[Backup] Starting → ${filename}`);
    const start = Date.now();

    try {
      await execAsync(
        `${pgDump} "${databaseUrl}" --no-password -f "${filepath}"`,
        { timeout: 5 * 60 * 1000 },
      );

      const stats = fs.statSync(filepath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      const durationSec = ((Date.now() - start) / 1000).toFixed(1);
      this.logger.log(
        `[Backup] Done — ${filename} (${sizeMB} MB, ${durationSec}s)`,
      );

      return { name: filename, sizeMB, date: stats.mtime, path: filepath };
    } catch (err) {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      throw err;
    }
  }

  applyRetention(): { deleted: number; kept: number } {
    if (!fs.existsSync(this.backupDir)) return { deleted: 0, kept: 0 };

    const files = this.listBackups();
    const cutoff = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000,
    );

    // Always keep the N most recent; delete older ones beyond retention window
    const toDelete = files.slice(this.keepLast).filter((f) => f.date < cutoff);

    for (const file of toDelete) {
      fs.unlinkSync(file.path);
      this.logger.log(`[Backup] Deleted old backup: ${file.name}`);
    }

    const kept = files.length - toDelete.length;
    if (toDelete.length > 0) {
      this.logger.log(
        `[Backup] Retention applied: deleted ${toDelete.length}, kept ${kept}`,
      );
    }

    return { deleted: toDelete.length, kept };
  }

  listBackups(): BackupFile[] {
    if (!fs.existsSync(this.backupDir)) return [];

    return fs
      .readdirSync(this.backupDir)
      .filter((f) => f.startsWith('backup_') && f.endsWith('.sql'))
      .map((f) => {
        const fullPath = path.join(this.backupDir, f);
        const stats = fs.statSync(fullPath);
        return {
          name: f,
          sizeMB: (stats.size / 1024 / 1024).toFixed(2),
          date: stats.mtime,
          path: fullPath,
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
