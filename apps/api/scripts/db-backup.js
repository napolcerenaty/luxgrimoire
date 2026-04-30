#!/usr/bin/env node
/**
 * Manual database backup script.
 * Usage: node scripts/db-backup.js
 * Or via npm: pnpm db:backup (from apps/api)
 *
 * Creates a .sql dump in the backups/ directory.
 * DATABASE_URL is read from .env automatically.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set in .env');
  process.exit(1);
}

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10);
const KEEP_LAST = parseInt(process.env.BACKUP_KEEP_LAST || '7', 10);

// Find pg_dump
function findPgDump() {
  const custom = process.env.PGDUMP_PATH;
  if (custom) return `"${custom}"`;
  try { execSync('pg_dump --version', { stdio: 'ignore' }); return 'pg_dump'; } catch {}
  const candidates = [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return `"${c}"`;
  throw new Error('pg_dump not found. Add PostgreSQL bin to PATH or set PGDUMP_PATH in .env');
}

// Create backup directory
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
const filename = `backup_${timestamp}.sql`;
const filepath = path.join(BACKUP_DIR, filename);

console.log(`📦 Creating backup → ${filename}`);
const start = Date.now();

try {
  const pgDump = findPgDump();
  execSync(`${pgDump} "${DATABASE_URL}" --no-password -f "${filepath}"`, { stdio: 'inherit' });

  const sizeMB = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2);
  const sec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ Backup complete: ${filename} (${sizeMB} MB, ${sec}s)`);
  console.log(`📁 Saved to: ${filepath}`);
} catch (err) {
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  console.error('❌ Backup failed:', err.message);
  process.exit(1);
}

// Apply retention
const files = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith('backup_') && f.endsWith('.sql'))
  .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
  .sort((a, b) => b.mtime - a.mtime);

const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
const toDelete = files.slice(KEEP_LAST).filter(f => f.mtime < cutoff);

if (toDelete.length > 0) {
  console.log(`\n🗑️  Applying retention (keep last ${KEEP_LAST}, max ${RETENTION_DAYS} days):`);
  for (const f of toDelete) {
    fs.unlinkSync(f.path);
    console.log(`   Deleted: ${f.name}`);
  }
}

console.log(`\n📋 Backups kept: ${files.length - toDelete.length}`);
