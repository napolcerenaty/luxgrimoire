/**
 * Cloudinary orphan cleanup script
 *
 * Lists (and optionally deletes) Cloudinary assets that are no longer
 * referenced by any DB record. These accumulated during early development
 * when edit-forms didn't delete replaced images.
 *
 * Usage:
 *   # Preview (safe, no deletions)
 *   cd apps/api && node --env-file=.env --require ts-node/register/transpile-only scripts/cleanup-cloudinary-orphans.ts --dry-run
 *
 *   # Actually delete orphans
 *   cd apps/api && node --env-file=.env --require ts-node/register/transpile-only scripts/cleanup-cloudinary-orphans.ts
 *
 * Requires .env in apps/api/ with CLOUDINARY_* and DATABASE_URL set.
 */

// Env is loaded via node --env-file=.env — no dotenv dependency needed

import { v2 as cloudinary, ResourceApiResponse } from 'cloudinary'
import { PrismaClient } from '@prisma/client'

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const ROOT_FOLDER = 'luxgrimoire'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const prisma = new PrismaClient()

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a stored image value to a Cloudinary public_id.
 * Handles both:
 *   - publicId form: "luxgrimoire/editions/abc123"
 *   - Full URL form: "https://res.cloudinary.com/.../upload/v123.../luxgrimoire/editions/abc123.jpg"
 */
function toPublicId(value: string): string {
  if (!value.startsWith('http')) return value

  // Strip everything up to and including "/upload/"
  const uploadIdx = value.indexOf('/upload/')
  if (uploadIdx === -1) return value

  let rest = value.slice(uploadIdx + '/upload/'.length)

  // Remove optional version segment like "v1234567890/"
  rest = rest.replace(/^v\d+\//, '')

  // Remove file extension
  rest = rest.replace(/\.[^.]+$/, '')

  return rest
}

/**
 * Fetch all Cloudinary resources under ROOT_FOLDER, paginating automatically.
 */
async function fetchAllCloudinaryResources(): Promise<string[]> {
  const publicIds: string[] = []
  let nextCursor: string | undefined = undefined

  do {
    const result: ResourceApiResponse = await cloudinary.api.resources({
      type: 'upload',
      prefix: ROOT_FOLDER,
      max_results: 500,
      next_cursor: nextCursor,
    } as any)

    for (const resource of result.resources) {
      publicIds.push(resource.public_id)
    }

    nextCursor = (result as any).next_cursor
  } while (nextCursor)

  return publicIds
}

/**
 * Collect all image publicIds/URLs stored in the database across every model.
 */
async function fetchAllDbPublicIds(): Promise<Set<string>> {
  const ids = new Set<string>()

  const add = (value: string | null | undefined) => {
    if (value) ids.add(toPublicId(value))
  }

  const addMany = (values: string[]) => {
    for (const v of values) add(v)
  }

  // User avatars
  const users = await prisma.user.findMany({ select: { avatarUrl: true } })
  for (const u of users) add(u.avatarUrl)

  // Book cover images
  const books = await prisma.book.findMany({ select: { coverImage: true } })
  for (const b of books) add(b.coverImage)

  // BookEdition additional images (the only image field on editions)
  const editions = await prisma.bookEdition.findMany({ select: { additionalImages: true } })
  for (const e of editions) addMany(e.additionalImages)

  // BookBoxCompany logos
  const companies = await prisma.bookBoxCompany.findMany({ select: { logoUrl: true } })
  for (const c of companies) add(c.logoUrl)

  // Subscription cover images + logos
  const subs = await prisma.subscription.findMany({ select: { coverImage: true, logoUrl: true } })
  for (const s of subs) { add(s.coverImage); add(s.logoUrl) }

  // SubscriptionSeries cover images
  const series = await prisma.subscriptionSeries.findMany({ select: { coverImage: true } })
  for (const s of series) add(s.coverImage)

  // SubscriptionMonth cover + spoiler images
  const months = await prisma.subscriptionMonth.findMany({
    select: { coverImage: true, spoilerImage: true },
  })
  for (const m of months) {
    add(m.coverImage)
    add(m.spoilerImage)
  }

  // SaleAnnouncement images (imageUrl + extraImagesJson array)
  const sales = await prisma.saleAnnouncement.findMany({
    select: { imageUrl: true, extraImagesJson: true },
  })
  for (const s of sales) {
    add(s.imageUrl)
    if (Array.isArray(s.extraImagesJson)) {
      for (const img of s.extraImagesJson as string[]) add(img)
    }
  }

  // PendingMonthImport images
  const imports = await prisma.pendingMonthImport.findMany({
    select: { coverImageUrl: true, allImages: true },
  })
  for (const i of imports) {
    add(i.coverImageUrl)
    addMany(i.allImages)
  }

  return ids
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌩  Cloudinary orphan cleanup  ${DRY_RUN ? '[DRY RUN]' : '[LIVE — will delete]'}\n`)

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('❌  CLOUDINARY_CLOUD_NAME not set. Make sure .env is present in apps/api/')
    process.exit(1)
  }

  console.log('📦  Fetching all Cloudinary resources...')
  const cloudinaryIds = await fetchAllCloudinaryResources()
  console.log(`    Found ${cloudinaryIds.length} assets in Cloudinary`)

  console.log('🗄️   Querying database for referenced image IDs...')
  const dbIds = await fetchAllDbPublicIds()
  console.log(`    Found ${dbIds.size} unique image references in DB`)

  const orphans = cloudinaryIds.filter((id) => !dbIds.has(id))
  console.log(`\n🔍  ${orphans.length} orphaned assets found${orphans.length === 0 ? ' — nothing to clean up!' : ':'}`)

  if (orphans.length === 0) {
    await prisma.$disconnect()
    return
  }

  for (const id of orphans) {
    console.log(`  ${DRY_RUN ? '(dry-run)' : '🗑️ '} ${id}`)
  }

  if (!DRY_RUN) {
    console.log('\n🗑️  Deleting orphans...')
    let deleted = 0
    let failed = 0

    for (const id of orphans) {
      try {
        await cloudinary.uploader.destroy(id)
        deleted++
        process.stdout.write('.')
      } catch (err) {
        failed++
        console.error(`\n  ❌ Failed to delete ${id}: ${err}`)
      }
    }

    console.log(`\n\n✅  Done. Deleted: ${deleted}  Failed: ${failed}`)
  } else {
    console.log('\nℹ️   Run without --dry-run to actually delete these assets.')
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
