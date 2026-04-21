import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === 'true'

const OLD_DB = {
  host: process.env.OLD_DB_HOST ?? 'localhost',
  port: parseInt(process.env.OLD_DB_PORT ?? '5432'),
  database: process.env.OLD_DB_NAME ?? 'luxgrimoire',
  user: process.env.OLD_DB_USER ?? 'postgres',
  password: process.env.OLD_DB_PASSWORD ?? 'postgres',
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.NEW_DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/luxgrimoire_v2',
    },
  },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = crypto.randomBytes(4).toString('hex')
  return `${base}-${suffix}`
}

function mapRole(oldRole: string): 'ADMIN' | 'MODERATOR' | 'USER' {
  if (oldRole === 'ROLE_ADMIN') return 'ADMIN'
  if (oldRole === 'ROLE_MODERATOR') return 'MODERATOR'
  return 'USER'
}

/** Map old Spring Boot format strings to readable values kept as plain strings in the new schema. */
function mapFormat(oldFormat: string | null | undefined): string | null {
  if (!oldFormat) return null
  const map: Record<string, string> = {
    STANDARD: 'STANDARD',
    SPECIAL: 'SPECIAL',
    DELUXE: 'DELUXE',
    COLLECTORS: 'COLLECTORS',
    LIMITED: 'LIMITED',
    COLLECTOR: 'COLLECTORS',
    COLLECTOR_EDITION: 'COLLECTORS',
    LIMITED_EDITION: 'LIMITED',
    SPECIAL_EDITION: 'SPECIAL',
    DELUXE_EDITION: 'DELUXE',
  }
  return map[oldFormat.toUpperCase()] ?? oldFormat
}

// ─── Summary tracking ────────────────────────────────────────────────────────

const summary: Record<string, { migrated: number; skipped: number }> = {}

function track(entity: string, migrated = 0, skipped = 0) {
  if (!summary[entity]) summary[entity] = { migrated: 0, skipped: 0 }
  summary[entity].migrated += migrated
  summary[entity].skipped += skipped
}

function printSummary() {
  console.log('\n═══════════════════════════════════════')
  console.log('  Migration Summary' + (DRY_RUN ? ' (DRY RUN)' : ''))
  console.log('═══════════════════════════════════════')
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(pad('Entity', 28) + pad('Migrated', 12) + 'Skipped')
  console.log('─'.repeat(52))
  for (const [entity, counts] of Object.entries(summary)) {
    console.log(
      pad(entity, 28) + pad(String(counts.migrated), 12) + counts.skipped,
    )
  }
  console.log('═══════════════════════════════════════\n')
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN mode — no writes to new DB\n')
  }

  const old = new Client(OLD_DB)
  await old.connect()
  console.log(`✓ Connected to old DB (${OLD_DB.database}@${OLD_DB.host}:${OLD_DB.port})`)

  // ── ID maps (old → new) ──────────────────────────────────────────────────
  const userMap = new Map<string, string>()
  const companyMap = new Map<string, string>()
  const bookMap = new Map<string, string>()
  const editionMap = new Map<string, string>()
  const authorMap = new Map<string, string>()
  const artistMap = new Map<string, string>()
  const subscriptionMap = new Map<string, string>()
  const monthMap = new Map<string, string>()

  // ────────────────────────────────────────────────────────────────────────
  // STEP 1 — Discover Everheart book IDs (drives scoped migrations below)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 1] Discovering Everheart book IDs...')

  let everheartBookIds = new Set<string>()
  let everheartEditionIds = new Set<string>()

  try {
    // Find Everheart company
    const companyRes = await old.query(
      `SELECT id FROM book_box_company WHERE name ILIKE '%everheart%' LIMIT 1`,
    )
    if (companyRes.rows.length === 0) {
      console.warn('⚠  No Everheart company found — will attempt to migrate all data')
    } else {
      const everheartCompanyId = companyRes.rows[0].id

      // Get all subscription IDs for Everheart
      const subRes = await old.query(
        `SELECT id FROM subscription WHERE company_id = $1`,
        [everheartCompanyId],
      )
      const subIds = subRes.rows.map((r) => r.id)

      if (subIds.length > 0) {
        // Get all month IDs
        const monthRes = await old.query(
          `SELECT id FROM subscription_month WHERE subscription_id = ANY($1)`,
          [subIds],
        )
        const monthIds = monthRes.rows.map((r) => r.id)

        if (monthIds.length > 0) {
          // Get book_ids from month-book junction (try both possible table names)
          let smb: { book_id: string; book_edition_id?: string }[] = []
          for (const table of ['subscription_month_book', 'book_subscription_month']) {
            try {
              const r = await old.query(
                `SELECT book_id, book_edition_id FROM ${table} WHERE subscription_month_id = ANY($1)`,
                [monthIds],
              )
              smb = r.rows
              break
            } catch {
              // try next table name
            }
          }
          smb.forEach((r) => {
            everheartBookIds.add(r.book_id)
            if (r.book_edition_id) everheartEditionIds.add(r.book_edition_id)
          })
        }
      }
    }
    console.log(`  Found ${everheartBookIds.size} Everheart books`)
  } catch (err) {
    console.error('✗ Step 1 failed:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 2 — Migrate Users
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 2] Migrating users...')
  try {
    const { rows: users } = await old.query(
      `SELECT id, username, email, password_hash, encoded_password, role, created_at FROM app_user`,
    )
    for (const u of users) {
      try {
        const passwordHash: string | null =
          u.password_hash ?? u.encoded_password ?? null
        const role = mapRole(u.role ?? '')
        const slug = generateSlug(u.username ?? u.email)

        if (DRY_RUN) {
          console.log(`  [dry] Would upsert user: ${u.email} (${role})`)
          track('Users', 1)
          userMap.set(String(u.id), `dry-${u.id}`)
          continue
        }

        const created = await prisma.user.upsert({
          where: { email: u.email },
          update: {},
          create: {
            username: u.username ?? slug,
            email: u.email,
            passwordHash,
            role,
            createdAt: u.created_at ? new Date(u.created_at) : undefined,
          },
        })
        userMap.set(String(u.id), created.id)
        track('Users', 1)
      } catch (err) {
        console.error(`  ✗ User failed (id=${u.id}, email=${u.email}):`, err)
        track('Users', 0, 1)
      }
    }
    console.log(
      `  ✓ Users: ${summary['Users']?.migrated ?? 0} migrated, ${summary['Users']?.skipped ?? 0} skipped`,
    )
  } catch (err) {
    console.error('✗ Step 2 (Users) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 3 — Migrate BookBoxCompany (Everheart only)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 3] Migrating Everheart company...')
  try {
    const { rows: companies } = await old.query(
      `SELECT id, name, description, country, website, logo_path, is_ioss_implemented
       FROM book_box_company
       WHERE name ILIKE '%everheart%'`,
    )
    for (const c of companies) {
      try {
        const slug = generateSlug(c.name)

        if (DRY_RUN) {
          console.log(`  [dry] Would upsert company: ${c.name}`)
          track('Companies', 1)
          companyMap.set(String(c.id), `dry-${c.id}`)
          continue
        }

        const created = await prisma.bookBoxCompany.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            name: c.name,
            description: c.description ?? null,
            country: c.country ?? null,
            website: c.website ?? null,
            logoUrl: c.logo_path ?? null,
          },
        })
        companyMap.set(String(c.id), created.id)
        track('Companies', 1)
      } catch (err) {
        console.error(`  ✗ Company failed (id=${c.id}, name=${c.name}):`, err)
        track('Companies', 0, 1)
      }
    }
    console.log(
      `  ✓ Companies: ${summary['Companies']?.migrated ?? 0} migrated`,
    )
  } catch (err) {
    console.error('✗ Step 3 (Companies) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 4 — Migrate Books (Everheart-scoped)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 4] Migrating books...')
  try {
    const bookIdsArray = Array.from(everheartBookIds)
    const { rows: books } =
      bookIdsArray.length > 0
        ? await old.query(
            `SELECT id, title, original_title, description, series_name, volume_number,
                    cover_image_path, isbn, language
             FROM book WHERE id = ANY($1)`,
            [bookIdsArray],
          )
        : await old.query(
            `SELECT id, title, original_title, description, series_name, volume_number,
                    cover_image_path, isbn, language FROM book`,
          )

    for (const b of books) {
      try {
        const slug = generateSlug(b.title)

        if (DRY_RUN) {
          console.log(`  [dry] Would upsert book: "${b.title}"`)
          track('Books', 1)
          bookMap.set(String(b.id), `dry-${b.id}`)
          continue
        }

        const created = await prisma.book.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            title: b.title,
            altTitle: b.original_title ?? null,
            description: b.description ?? null,
            seriesName: b.series_name ?? null,
            volumeNumber: b.volume_number != null ? Number(b.volume_number) : null,
            coverImage: b.cover_image_path ?? null,
            isbn: b.isbn ?? null,
            language: b.language ?? 'en',
          },
        })
        bookMap.set(String(b.id), created.id)
        track('Books', 1)
      } catch (err) {
        console.error(`  ✗ Book failed (id=${b.id}, title=${b.title}):`, err)
        track('Books', 0, 1)
      }
    }
    console.log(`  ✓ Books: ${summary['Books']?.migrated ?? 0} migrated`)
  } catch (err) {
    console.error('✗ Step 4 (Books) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 5 — Migrate Authors (only those linked to Everheart books)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 5] Migrating authors...')
  try {
    const bookIdsArray = Array.from(bookMap.keys())
    const { rows: authors } =
      bookIdsArray.length > 0
        ? await old.query(
            `SELECT DISTINCT a.id, a.name, a.biography, a.nationality
             FROM author a
             JOIN book_author ba ON ba.author_id = a.id
             WHERE ba.book_id = ANY($1)`,
            [bookIdsArray],
          )
        : { rows: [] }

    for (const a of authors) {
      try {
        const slug = generateSlug(a.name)

        if (DRY_RUN) {
          console.log(`  [dry] Would upsert author: ${a.name}`)
          track('Authors', 1)
          authorMap.set(String(a.id), `dry-${a.id}`)
          continue
        }

        const created = await prisma.author.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            name: a.name,
            bio: a.biography ?? null,
          },
        })
        authorMap.set(String(a.id), created.id)
        track('Authors', 1)
      } catch (err) {
        console.error(`  ✗ Author failed (id=${a.id}, name=${a.name}):`, err)
        track('Authors', 0, 1)
      }
    }
    console.log(`  ✓ Authors: ${summary['Authors']?.migrated ?? 0} migrated`)
  } catch (err) {
    console.error('✗ Step 5 (Authors) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 6 — Migrate BookEditions
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 6] Migrating book editions...')
  try {
    const bookIdsArray = Array.from(bookMap.keys())
    const { rows: editions } =
      bookIdsArray.length > 0
        ? await old.query(
            `SELECT id, book_id, publisher, publish_year, format, cover_image_path,
                    page_count, isbn, language
             FROM book_edition WHERE book_id = ANY($1)`,
            [bookIdsArray],
          )
        : { rows: [] }

    for (const e of editions) {
      try {
        const newBookId = bookMap.get(String(e.book_id))
        if (!newBookId) {
          track('Editions', 0, 1)
          continue
        }

        const slug = generateSlug(`${e.publisher ?? 'edition'}-${e.book_id}`)
        const format = mapFormat(e.format)

        if (DRY_RUN) {
          console.log(`  [dry] Would upsert edition for book_id=${e.book_id}`)
          track('Editions', 1)
          editionMap.set(String(e.id), `dry-${e.id}`)
          continue
        }

        const created = await prisma.bookEdition.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            bookId: newBookId,
            publisher: e.publisher ?? null,
            publishYear: e.publish_year ? parseInt(e.publish_year) : null,
            format,
            coverImage: e.cover_image_path ?? null,
            additionalImages: [],
            isSpecial: format
              ? ['SPECIAL', 'DELUXE', 'COLLECTORS', 'LIMITED'].includes(format)
              : false,
          },
        })
        editionMap.set(String(e.id), created.id)
        track('Editions', 1)
      } catch (err) {
        console.error(`  ✗ Edition failed (id=${e.id}):`, err)
        track('Editions', 0, 1)
      }
    }
    console.log(`  ✓ Editions: ${summary['Editions']?.migrated ?? 0} migrated`)
  } catch (err) {
    console.error('✗ Step 6 (Editions) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 7 — Migrate Artists (only those on Everheart editions)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 7] Migrating artists...')
  try {
    const editionIdsArray = Array.from(editionMap.keys())
    const { rows: artists } =
      editionIdsArray.length > 0
        ? await old.query(
            `SELECT DISTINCT ar.id, ar.name, ar.biography
             FROM artist ar
             JOIN artist_contribution ac ON ac.artist_id = ar.id
             WHERE ac.book_edition_id = ANY($1)
             UNION
             SELECT DISTINCT ar.id, ar.name, ar.biography
             FROM artist ar
             JOIN book_edition_artist bea ON bea.artist_id = ar.id
             WHERE bea.book_edition_id = ANY($1)`,
            [editionIdsArray],
          ).catch(async () => {
            // Fall back to single table if union fails
            return old.query(
              `SELECT DISTINCT ar.id, ar.name, ar.biography
               FROM artist ar
               JOIN artist_contribution ac ON ac.artist_id = ar.id
               WHERE ac.book_edition_id = ANY($1)`,
              [editionIdsArray],
            )
          })
        : { rows: [] }

    for (const a of artists) {
      try {
        const slug = generateSlug(a.name)

        if (DRY_RUN) {
          console.log(`  [dry] Would upsert artist: ${a.name}`)
          track('Artists', 1)
          artistMap.set(String(a.id), `dry-${a.id}`)
          continue
        }

        const created = await prisma.artist.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            name: a.name,
            bio: a.biography ?? null,
          },
        })
        artistMap.set(String(a.id), created.id)
        track('Artists', 1)
      } catch (err) {
        console.error(`  ✗ Artist failed (id=${a.id}, name=${a.name}):`, err)
        track('Artists', 0, 1)
      }
    }
    console.log(`  ✓ Artists: ${summary['Artists']?.migrated ?? 0} migrated`)
  } catch (err) {
    console.error('✗ Step 7 (Artists) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 8 — Link Authors to Books (BookAuthor junction)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 8] Linking authors to books...')
  try {
    const bookIdsArray = Array.from(bookMap.keys())
    const { rows: links } =
      bookIdsArray.length > 0
        ? await old.query(
            `SELECT book_id, author_id FROM book_author WHERE book_id = ANY($1)`,
            [bookIdsArray],
          )
        : { rows: [] }

    for (const l of links) {
      try {
        const newBookId = bookMap.get(String(l.book_id))
        const newAuthorId = authorMap.get(String(l.author_id))
        if (!newBookId || !newAuthorId) {
          track('BookAuthors', 0, 1)
          continue
        }

        if (DRY_RUN) {
          console.log(`  [dry] Would link author ${l.author_id} → book ${l.book_id}`)
          track('BookAuthors', 1)
          continue
        }

        await prisma.bookAuthor.upsert({
          where: { bookId_authorId: { bookId: newBookId, authorId: newAuthorId } },
          update: {},
          create: { bookId: newBookId, authorId: newAuthorId },
        })
        track('BookAuthors', 1)
      } catch (err) {
        console.error(`  ✗ BookAuthor link failed (book=${l.book_id}, author=${l.author_id}):`, err)
        track('BookAuthors', 0, 1)
      }
    }
    console.log(`  ✓ BookAuthors: ${summary['BookAuthors']?.migrated ?? 0} linked`)
  } catch (err) {
    console.error('✗ Step 8 (BookAuthors) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 9 — Link Artists to Editions (ArtistContribution)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 9] Linking artists to editions...')
  try {
    const editionIdsArray = Array.from(editionMap.keys())
    const { rows: contribs } =
      editionIdsArray.length > 0
        ? await old.query(
            `SELECT book_edition_id, artist_id, contribution_type
             FROM artist_contribution
             WHERE book_edition_id = ANY($1)`,
            [editionIdsArray],
          ).catch(() =>
            old.query(
              `SELECT book_edition_id, artist_id, contribution_type
               FROM book_edition_artist
               WHERE book_edition_id = ANY($1)`,
              [editionIdsArray],
            ),
          )
        : { rows: [] }

    for (const c of contribs) {
      try {
        const newEditionId = editionMap.get(String(c.book_edition_id))
        const newArtistId = artistMap.get(String(c.artist_id))
        if (!newEditionId || !newArtistId) {
          track('ArtistContributions', 0, 1)
          continue
        }

        if (DRY_RUN) {
          console.log(`  [dry] Would link artist ${c.artist_id} → edition ${c.book_edition_id}`)
          track('ArtistContributions', 1)
          continue
        }

        await prisma.artistContribution.upsert({
          where: { editionId_artistId: { editionId: newEditionId, artistId: newArtistId } },
          update: {},
          create: {
            editionId: newEditionId,
            artistId: newArtistId,
            role: c.contribution_type ?? 'cover',
          },
        })
        track('ArtistContributions', 1)
      } catch (err) {
        console.error(
          `  ✗ ArtistContribution failed (edition=${c.book_edition_id}, artist=${c.artist_id}):`,
          err,
        )
        track('ArtistContributions', 0, 1)
      }
    }
    console.log(`  ✓ ArtistContributions: ${summary['ArtistContributions']?.migrated ?? 0} linked`)
  } catch (err) {
    console.error('✗ Step 9 (ArtistContributions) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 10 — Migrate Subscriptions (Everheart only)
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 10] Migrating subscriptions...')
  try {
    const { rows: subs } = await old.query(
      `SELECT s.id, s.name, s.description, s.genre, s.company_id,
              s.is_discontinued, s.start_date, s.end_date, s.cover_image_path
       FROM subscription s
       JOIN book_box_company c ON c.id = s.company_id
       WHERE c.name ILIKE '%everheart%'`,
    )

    for (const s of subs) {
      try {
        const newCompanyId = companyMap.get(String(s.company_id))
        if (!newCompanyId) {
          console.warn(`  ⚠ No mapped company for subscription ${s.id} — skipping`)
          track('Subscriptions', 0, 1)
          continue
        }

        const slug = generateSlug(s.name)

        if (DRY_RUN) {
          console.log(`  [dry] Would upsert subscription: "${s.name}"`)
          track('Subscriptions', 1)
          subscriptionMap.set(String(s.id), `dry-${s.id}`)
          continue
        }

        const created = await prisma.subscription.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            companyId: newCompanyId,
            name: s.name,
            description: s.description ?? null,
            genre: s.genre ?? null,
            coverImage: s.cover_image_path ?? null,
            isDiscontinued: s.is_discontinued ?? false,
            startDate: s.start_date ? new Date(s.start_date) : null,
            endDate: s.end_date ? new Date(s.end_date) : null,
          },
        })
        subscriptionMap.set(String(s.id), created.id)
        track('Subscriptions', 1)
      } catch (err) {
        console.error(`  ✗ Subscription failed (id=${s.id}, name=${s.name}):`, err)
        track('Subscriptions', 0, 1)
      }
    }
    console.log(`  ✓ Subscriptions: ${summary['Subscriptions']?.migrated ?? 0} migrated`)
  } catch (err) {
    console.error('✗ Step 10 (Subscriptions) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 11 — Migrate SubscriptionMonths
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 11] Migrating subscription months...')
  try {
    const subIdsArray = Array.from(subscriptionMap.keys())
    const { rows: months } =
      subIdsArray.length > 0
        ? await old.query(
            `SELECT id, subscription_id, year, month, theme, cover_image_path
             FROM subscription_month WHERE subscription_id = ANY($1)`,
            [subIdsArray],
          )
        : { rows: [] }

    for (const m of months) {
      try {
        const newSubId = subscriptionMap.get(String(m.subscription_id))
        if (!newSubId) {
          track('Months', 0, 1)
          continue
        }

        if (DRY_RUN) {
          console.log(`  [dry] Would upsert month: ${m.year}-${m.month}`)
          track('Months', 1)
          monthMap.set(String(m.id), `dry-${m.id}`)
          continue
        }

        const created = await prisma.subscriptionMonth.upsert({
          where: {
            subscriptionId_year_month: {
              subscriptionId: newSubId,
              year: parseInt(m.year),
              month: parseInt(m.month),
            },
          },
          update: {},
          create: {
            subscriptionId: newSubId,
            year: parseInt(m.year),
            month: parseInt(m.month),
            theme: m.theme ?? null,
            coverImage: m.cover_image_path ?? null,
          },
        })
        monthMap.set(String(m.id), created.id)
        track('Months', 1)
      } catch (err) {
        console.error(`  ✗ Month failed (id=${m.id}, ${m.year}-${m.month}):`, err)
        track('Months', 0, 1)
      }
    }
    console.log(`  ✓ Months: ${summary['Months']?.migrated ?? 0} migrated`)
  } catch (err) {
    console.error('✗ Step 11 (SubscriptionMonths) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // STEP 12 — Migrate SubscriptionMonthBooks
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 12] Migrating subscription month books...')
  try {
    const monthIdsArray = Array.from(monthMap.keys())
    let smbs: { subscription_month_id: string; book_id: string; book_edition_id?: string; is_main_book?: boolean }[] = []

    if (monthIdsArray.length > 0) {
      for (const table of ['subscription_month_book', 'book_subscription_month']) {
        try {
          const r = await old.query(
            `SELECT subscription_month_id, book_id, book_edition_id, is_main_book
             FROM ${table} WHERE subscription_month_id = ANY($1)`,
            [monthIdsArray],
          )
          smbs = r.rows
          break
        } catch {
          // try next
        }
      }
    }

    for (const smb of smbs) {
      try {
        const newMonthId = monthMap.get(String(smb.subscription_month_id))
        const newBookId = bookMap.get(String(smb.book_id))
        const newEditionId = smb.book_edition_id
          ? editionMap.get(String(smb.book_edition_id)) ?? null
          : null

        if (!newMonthId || !newBookId) {
          track('MonthBooks', 0, 1)
          continue
        }

        if (DRY_RUN) {
          console.log(
            `  [dry] Would upsert month-book: month=${smb.subscription_month_id}, book=${smb.book_id}`,
          )
          track('MonthBooks', 1)
          continue
        }

        await prisma.subscriptionMonthBook.upsert({
          where: { monthId_bookId: { monthId: newMonthId, bookId: newBookId } },
          update: {},
          create: {
            monthId: newMonthId,
            bookId: newBookId,
            editionId: newEditionId,
            isMainBook: smb.is_main_book ?? true,
          },
        })
        track('MonthBooks', 1)
      } catch (err) {
        console.error(
          `  ✗ MonthBook failed (month=${smb.subscription_month_id}, book=${smb.book_id}):`,
          err,
        )
        track('MonthBooks', 0, 1)
      }
    }
    console.log(`  ✓ MonthBooks: ${summary['MonthBooks']?.migrated ?? 0} migrated`)
  } catch (err) {
    console.error('✗ Step 12 (SubscriptionMonthBooks) failed entirely:', err)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Done
  // ────────────────────────────────────────────────────────────────────────
  await old.end()
  if (!DRY_RUN) await prisma.$disconnect()

  printSummary()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
