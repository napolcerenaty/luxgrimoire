#!/usr/bin/env node
/**
 * Cloudinary migration script — copies images from one Cloudinary account to another.
 *
 * Usage:
 *   node scripts/cloudinary-migrate.js [--dry-run] [--update-db]
 *
 * What it does:
 *   1. Lists all resources in SOURCE Cloudinary account
 *   2. Re-uploads each to DESTINATION account preserving folder structure and public_id
 *   3. Optionally updates all Cloudinary URLs in the database (--update-db)
 *
 * Configure via environment variables below or edit the CONFIG section.
 *
 * Use cases:
 *   prod → dev:  After pulling a production DB backup, sync images to dev Cloudinary
 *   dev → prod:  Unlikely, but possible (e.g. bulk-imported test data going live)
 *
 * ⚠️  Do NOT run prod→dev with --update-db while pointing at production DB.
 */

const { v2: cloudinary } = require('cloudinary');
const https = require('https');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// ── CONFIG — edit or set env vars ────────────────────────────────────────────
// Source account (where images come FROM)
const SOURCE = {
  cloud_name: process.env.MIGRATE_SRC_CLOUD_NAME   || process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.MIGRATE_SRC_API_KEY       || process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.MIGRATE_SRC_API_SECRET    || process.env.CLOUDINARY_API_SECRET,
};

// Destination account (where images go TO)
const DEST = {
  cloud_name: process.env.MIGRATE_DST_CLOUD_NAME,
  api_key:    process.env.MIGRATE_DST_API_KEY,
  api_secret: process.env.MIGRATE_DST_API_SECRET,
};

const DRY_RUN   = process.argv.includes('--dry-run');
const UPDATE_DB = process.argv.includes('--update-db');
const FOLDER_PREFIX = 'luxgrimoire'; // only migrate resources under this folder

// ── Validate config ───────────────────────────────────────────────────────────
for (const [key, val] of Object.entries(SOURCE)) {
  if (!val) { console.error(`❌ Missing source credential: MIGRATE_SRC_${key.toUpperCase()} (or CLOUDINARY_${key.toUpperCase()})`); process.exit(1); }
}
for (const [key, val] of Object.entries(DEST)) {
  if (!val) { console.error(`❌ Missing destination credential: MIGRATE_DST_${key.toUpperCase()}`); process.exit(1); }
}
if (SOURCE.cloud_name === DEST.cloud_name) {
  console.error('❌ Source and destination are the same Cloudinary account. Aborting.');
  process.exit(1);
}

// ── Cloudinary client factory ─────────────────────────────────────────────────
function makeClient(cfg) {
  const instance = require('cloudinary').v2;
  instance.config(cfg);
  return instance;
}

// ── Fetch buffer from URL ─────────────────────────────────────────────────────
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── List all resources in source ─────────────────────────────────────────────
async function listAllResources(src) {
  const resources = [];
  let nextCursor = undefined;

  do {
    const result = await src.api.resources({
      type: 'upload',
      prefix: FOLDER_PREFIX,
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });
    resources.push(...result.resources);
    nextCursor = result.next_cursor;
  } while (nextCursor);

  return resources;
}

// ── Main migration ────────────────────────────────────────────────────────────
async function migrate() {
  console.log(`\n📦 Cloudinary migration`);
  console.log(`   FROM: ${SOURCE.cloud_name}`);
  console.log(`   TO:   ${DEST.cloud_name}`);
  console.log(`   Folder prefix: ${FOLDER_PREFIX}/`);
  if (DRY_RUN) console.log('   MODE: DRY RUN (no files will be uploaded)');
  if (UPDATE_DB) console.log('   Will update DB URLs after migration');
  console.log('');

  // Use separate cloudinary instances so we don't clobber global config
  cloudinary.config(SOURCE);
  const { v2: destClient } = require('cloudinary');

  console.log('🔍 Listing source resources...');
  const resources = await listAllResources(cloudinary);
  console.log(`   Found ${resources.length} resources\n`);

  if (resources.length === 0) {
    console.log('Nothing to migrate.');
    return [];
  }

  const urlMap = []; // { oldUrl, newUrl }
  let ok = 0, skipped = 0, failed = 0;

  for (const resource of resources) {
    const { public_id, secure_url, resource_type } = resource;
    process.stdout.write(`  ↑ ${public_id} ... `);

    if (DRY_RUN) {
      console.log('[dry-run]');
      ok++;
      continue;
    }

    try {
      destClient.config(DEST);
      const buffer = await fetchBuffer(secure_url);

      const result = await new Promise((resolve, reject) => {
        destClient.uploader.upload_stream(
          { public_id, resource_type, overwrite: false, invalidate: true },
          (err, res) => err ? reject(err) : resolve(res),
        ).end(buffer);
      });

      console.log('✓');
      urlMap.push({ oldUrl: secure_url, newUrl: result.secure_url });
      ok++;
    } catch (err) {
      if (err.http_code === 400 && err.message?.includes('already exists')) {
        console.log('(already exists, skipped)');
        // Still record URL map for --update-db
        const destUrl = secure_url.replace(SOURCE.cloud_name, DEST.cloud_name);
        urlMap.push({ oldUrl: secure_url, newUrl: destUrl });
        skipped++;
      } else {
        console.log(`✗ ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n✅ Migration complete: ${ok} uploaded, ${skipped} skipped, ${failed} failed`);
  return urlMap;
}

// ── Update DB URLs ────────────────────────────────────────────────────────────
async function updateDatabaseUrls(urlMap) {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set — cannot update DB');
    return;
  }

  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('\n🗄️  Updating database Cloudinary URLs...');
  const OLD_DOMAIN = `res.cloudinary.com/${SOURCE.cloud_name}`;
  const NEW_DOMAIN = `res.cloudinary.com/${DEST.cloud_name}`;

  // Tables and columns that store Cloudinary URLs
  const targets = [
    { table: 'editions',              cols: ['coverImageUrl', 'additionalImages'] },
    { table: 'book_boxes',            cols: ['imageUrl'] },
    { table: 'subscriptions',         cols: ['imageUrl'] },
    { table: 'subscription_months',   cols: ['imageUrl', 'additionalImages'] },
    { table: 'announcements',         cols: ['imageUrl'] },
    { table: 'users',                 cols: ['avatarUrl'] },
  ];

  for (const { table, cols } of targets) {
    for (const col of cols) {
      try {
        // Check if table/column exists first
        const { rows } = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = $1 AND column_name = $2
        `, [table, col]);

        if (rows.length === 0) continue;

        const result = await client.query(`
          UPDATE ${table}
          SET "${col}" = REPLACE("${col}"::text, $1, $2)
          WHERE "${col}"::text LIKE '%' || $1 || '%'
        `, [OLD_DOMAIN, NEW_DOMAIN]);

        if (result.rowCount > 0) {
          console.log(`   ${table}.${col}: ${result.rowCount} rows updated`);
        }
      } catch {
        // column might be jsonb array — handle separately
        try {
          await client.query(`
            UPDATE ${table}
            SET "${col}" = (
              SELECT jsonb_agg(replace(elem::text, $1, $2)::jsonb)
              FROM jsonb_array_elements("${col}") elem
            )
            WHERE "${col}"::text LIKE '%' || $1 || '%'
          `, [OLD_DOMAIN, NEW_DOMAIN]);
        } catch {
          console.log(`   ⚠️  ${table}.${col}: could not update (may be different type)`);
        }
      }
    }
  }

  await client.end();
  console.log('   Done.\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((resolve) => {
      rl.question(
        `This will copy images from "${SOURCE.cloud_name}" → "${DEST.cloud_name}".\nType "migrate" to continue: `,
        (ans) => {
          rl.close();
          if (ans.trim().toLowerCase() !== 'migrate') {
            console.log('Cancelled.');
            process.exit(0);
          }
          resolve();
        }
      );
    });
  }

  try {
    const urlMap = await migrate();
    if (UPDATE_DB && urlMap.length > 0 && !DRY_RUN) {
      await updateDatabaseUrls(urlMap);
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

main();
