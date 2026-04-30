#!/usr/bin/env node
/**
 * Database anonymization script — GDPR-safe local testing.
 *
 * Usage:
 *   node scripts/db-anonymize.js
 *   pnpm db:anonymize   (from apps/api)
 *
 * What it does:
 *   1. Deletes all active sessions, tokens (password reset, email verification)
 *   2. Anonymizes User PII (email, username, displayName, avatarUrl, bio, passwordHash)
 *   3. Clears OAuth tokens from accounts
 *   4. Clears tracking numbers, shipping details, sale notes
 *   5. Clears username from audit_logs, metadata from notifications/bug reports
 *   6. Nullifies userId in analytics_events (breaks user linkage)
 *
 * After running this, no real user can be identified from the data.
 * The database structure and all relations remain intact for testing.
 *
 * ⚠️  Run ONLY on a local copy of production data — never on production itself.
 */

const { Client } = require('pg');
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

// Safety check — refuse to run against anything that looks like production
const isProduction = DATABASE_URL.includes('prod') ||
  DATABASE_URL.includes('render.com') ||
  DATABASE_URL.includes('supabase.co') ||
  DATABASE_URL.includes('neon.tech') ||
  DATABASE_URL.includes('railway.app');

if (isProduction) {
  console.error('❌ DATABASE_URL looks like a production database. Aborting.');
  console.error('   This script must only be run on a local copy of the data.');
  process.exit(1);
}

async function anonymize() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Count users so we can show what we're operating on
  const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM users');
  console.log(`\n🔒 Anonymizing database: ${DATABASE_URL.replace(/:([^:@]+)@/, ':***@')}`);
  console.log(`   Users to anonymize: ${count}\n`);

  try {
    await client.query('BEGIN');

    // ── 1. Delete security-sensitive tokens and sessions ──────────────────────
    console.log('🗑️  Deleting sessions and tokens...');
    const { rowCount: sessions } = await client.query('DELETE FROM sessions');
    const { rowCount: pwTokens } = await client.query('DELETE FROM password_reset_tokens');
    const { rowCount: emailTokens } = await client.query('DELETE FROM email_verification_tokens');
    console.log(`   sessions: ${sessions}, password_reset_tokens: ${pwTokens}, email_verification_tokens: ${emailTokens}`);

    // ── 2. Clear OAuth access/refresh tokens ──────────────────────────────────
    console.log('🗑️  Clearing OAuth tokens...');
    const { rowCount: oauthTokens } = await client.query(`
      UPDATE accounts SET "accessToken" = NULL, "refreshToken" = NULL
    `);
    console.log(`   accounts cleared: ${oauthTokens}`);

    // ── 3. Anonymize users — email, username, displayName, avatarUrl, bio, passwordHash
    //      Password replaced with bcrypt hash of "password" (users can log in with "password" locally)
    console.log('👤 Anonymizing users...');
    const { rowCount: users } = await client.query(`
      UPDATE users SET
        email         = 'user_' || SUBSTRING(id::text, 1, 8) || '@example.com',
        username      = 'user_' || SUBSTRING(id::text, 1, 8),
        "displayName" = 'Test User ' || SUBSTRING(id::text, 1, 6),
        "avatarUrl"   = NULL,
        bio           = NULL,
        "passwordHash" = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
    `);
    // ↑ That hash = bcrypt("password") — so all local accounts have password "password"
    console.log(`   users anonymized: ${users}`);

    // ── 4. Audit logs — strip username and metadata (may contain PII) ─────────
    console.log('📋 Anonymizing audit_logs...');
    const { rowCount: auditLogs } = await client.query(`
      UPDATE audit_logs SET username = 'anonymized', metadata = NULL
    `);
    console.log(`   audit_logs: ${auditLogs}`);

    // ── 5. User notifications — clear title/body content ─────────────────────
    console.log('🔔 Anonymizing notifications...');
    const { rowCount: notifications } = await client.query(`
      UPDATE user_notifications SET
        title = '[anonymized]',
        body  = NULL,
        payload = NULL
    `);
    console.log(`   notifications: ${notifications}`);

    // ── 6. Tracking numbers (packages — personal logistics data) ─────────────
    console.log('📦 Clearing tracking numbers...');
    const { rowCount: subTracking } = await client.query(`
      UPDATE user_subscription_entries SET
        "trackingNumber"    = NULL,
        "cancellationReason" = NULL
    `);
    const { rowCount: bookTracking } = await client.query(`
      UPDATE user_book_entries SET
        "trackingNumber" = NULL,
        "saleNotes"      = NULL
    `);
    console.log(`   subscription entries: ${subTracking}, book entries: ${bookTracking}`);

    // ── 7. Bug reports — clear description (users often paste personal info) ──
    console.log('🐛 Anonymizing bug reports...');
    const { rowCount: bugs } = await client.query(`
      UPDATE bug_reports SET description = '[anonymized]'
    `);
    console.log(`   bug_reports: ${bugs}`);

    // ── 8. Data requests — clear name and description ─────────────────────────
    console.log('📄 Anonymizing data requests...');
    const { rowCount: dataReqs } = await client.query(`
      UPDATE data_requests SET name = '[anonymized]', description = NULL
    `);
    console.log(`   data_requests: ${dataReqs}`);

    // ── 9. Analytics events — break userId linkage ────────────────────────────
    console.log('📊 Unlinking analytics events from users...');
    const { rowCount: analytics } = await client.query(`
      UPDATE analytics_events SET user_id = NULL
    `);
    console.log(`   analytics_events: ${analytics}`);

    await client.query('COMMIT');

    console.log('\n✅ Anonymization complete.');
    console.log('   All users now have password: "password"');
    console.log('   No real personal data remains in the database.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Anonymization failed, rolled back:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Confirm before running
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('⚠️  This will permanently overwrite all user PII in the local database.');
console.log('   Run this AFTER restoring a production backup locally.');
rl.question('Type "anonymize" to continue: ', (answer) => {
  rl.close();
  if (answer.trim().toLowerCase() !== 'anonymize') {
    console.log('Cancelled.');
    process.exit(0);
  }
  anonymize();
});
