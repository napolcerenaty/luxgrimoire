#!/usr/bin/env node
/**
 * Database restore script.
 * Usage: node scripts/db-restore.js <backup-file.sql>
 * Or via npm: pnpm db:restore backups/backup_2026-04-30_03-00-00.sql
 *
 * ⚠️  WARNING: This DROPS and recreates the database. All current data will be lost.
 * DATABASE_URL is read from .env automatically.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

const backupFile = process.argv[2];
if (!backupFile) {
  const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
  console.error('❌ Usage: node scripts/db-restore.js <backup-file.sql>');
  if (fs.existsSync(BACKUP_DIR)) {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.sql'))
      .sort().reverse().slice(0, 5);
    if (files.length > 0) {
      console.log('\nAvailable backups (latest 5):');
      files.forEach(f => console.log(`  ${path.join(BACKUP_DIR, f)}`));
    }
  }
  process.exit(1);
}

const resolvedPath = path.resolve(backupFile);
if (!fs.existsSync(resolvedPath)) {
  console.error(`❌ File not found: ${resolvedPath}`);
  process.exit(1);
}

// Find psql
function findPsql() {
  const custom = process.env.PSQL_PATH;
  if (custom) return `"${custom}"`;
  try { execSync('psql --version', { stdio: 'ignore' }); return 'psql'; } catch {}
  const candidates = [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return `"${c}"`;
  throw new Error('psql not found. Add PostgreSQL bin to PATH or set PSQL_PATH in .env');
}

const sizeMB = (fs.statSync(resolvedPath).size / 1024 / 1024).toFixed(2);
console.log(`⚠️  WARNING: This will OVERWRITE the current database with:`);
console.log(`   File: ${resolvedPath} (${sizeMB} MB)`);
console.log(`   Target: ${DATABASE_URL.replace(/:([^:@]+)@/, ':***@')}`);
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Type "yes" to confirm restore: ', (answer) => {
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    process.exit(0);
  }

  console.log('\n🔄 Restoring database...');
  const start = Date.now();

  try {
    const psql = findPsql();
    execSync(`${psql} "${DATABASE_URL}" -f "${resolvedPath}"`, { stdio: 'inherit' });
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ Restore complete (${sec}s)`);
  } catch (err) {
    console.error('❌ Restore failed:', err.message);
    process.exit(1);
  }
});
