import { CollectionEntryPanel } from '@/components/books/CollectionEntryPanel'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment, cache } from 'react'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'
import { Badge } from '@/components/ui/Badge'
import { ImageCarousel } from '@/components/ui/ImageCarousel'
import { EditionActionButtons } from '@/components/books/EditionActionButtons'
import { BackButton } from '@/components/ui/BackButton'
import { CommunityImageSection } from '@/components/editions/CommunityImageSection'
import { EditionCommunityStats } from '@/components/editions/EditionCommunityStats'
import type { ApiAuthor, ApiArtist } from '@luxgrimoire/shared-types'
import type { CommunityImage } from '@/types/community'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Sentence-case normalizer for feature/role display strings.
 * - Words written in ALL CAPS (length > 1) are lowercased
 * - First character of the whole string is uppercased
 * - Mixed-case words are left unchanged
 * e.g. "TWO OVERLAY designs" → "Two overlay designs"
 *      "Sprayed edges"       → "Sprayed edges"
 */
function normDisplay(text: string): string {
  if (!text) return text
  const normalized = text
    .split(' ')
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word.toLowerCase() : word))
    .join(' ')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

interface EditionMonthBook {
  month: {
    id: string; year: number; month: number; theme: string | null
    subscription: {
      id: string; slug: string; name: string; isContentStream: boolean
      variants: Array<{ id: string; slug: string; name: string; startDate: string | null; endDate: string | null }>
    }
    series: { id: string; slug: string; name: string } | null
    books: Array<{
      sortOrder: number
      isMainBook: boolean
      book: { id: string; title: string; slug: string }
      edition: { id: string; slug: string } | null
    }>
  }
}

interface EditionSaleEdition {
  id: string
  isReprint?: boolean
  announcement: {
    id: string
    title: string
    isBundle: boolean
    generalSaleDate?: string | null
    earlyAccessDate?: string | null
    firstAccessDate?: string | null
  }
}

interface EditionArtist {
  artist: ApiArtist
  role: string
  artistName: string | null
}

interface EditionDetail {
  id: string
  slug: string
  bookId: string
  bookBoxCompanyCustomName: string | null
  bookBoxCompanyId?: string | null
  publisher: string | null
  isSpecial: boolean
  additionalImages: string[]
  language?: string | null
  basePrice?: string | null
  currency?: string | null
  features?: string[]
  featureTags?: Array<{
    id: string
    rawValue: string
    isManual: boolean
    categories: Array<{ id: string; slug: string; label: string; group: string; sortOrder: number }>
  }>
  firstAccessDate?: string | null
  earlyAccessDate?: string | null
  generalSaleDate?: string | null
  verifiedAt: string | null
  submittedByUserId: string | null
  photoCredit?: string | null
  subscriptionId?: string | null
  subscriptionMonthId?: string | null
  artists?: EditionArtist[]
  monthBooks?: EditionMonthBook[]
  saleEditions?: EditionSaleEdition[]
  bookBoxCompany?: { id: string; slug: string; name: string; logoUrl: string | null } | null
  collection?: { id: string; slug: string; name: string; coverImage: string | null } | null
  previousEdition?: { id: string; slug: string; generalSaleDate: string | null; bookBoxCompany: { name: string; slug: string } | null; collection: { name: string } | null } | null
  nextEdition?: { id: string; slug: string; generalSaleDate: string | null; bookBoxCompany: { name: string; slug: string } | null; collection: { name: string } | null } | null
  book?: {
    id: string; slug: string; title: string
    seriesName: string | null; volumeNumbers: number[]
    series?: { id: string; slug: string; name: string } | null
    isOmnibus?: boolean
    componentCount?: number
    seriesEntries?: Array<{
      seriesId: string
      volumeNumbers: number[]
      isPrimary: boolean
      series: { id: string; slug: string; name: string }
    }>
    omnibusComponents?: Array<{
      id: string
      volumeNumber: number | null
      order: number
      book: { id: string; slug: string; title: string }
    }>
    description: string | null; language: string; genres: string[]
    authors: ApiAuthor[]
  } | null
}

interface Props { params: Promise<{ slug: string }>; searchParams: Promise<{ entry?: string }> }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Deduplicate API call between generateMetadata and page (React cache per request)
const getEdition = cache(async (slug: string) => apiFetch<EditionDetail>(`/editions/${slug}`))

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const edition = await getEdition(slug)
    const book = edition.book
    const title = [edition.bookBoxCompany?.name, book?.title].filter(Boolean).join(' · ')
    const coverUrl = cloudinaryUrl(edition.additionalImages[0] ?? null, 'w_800,c_fill,q_auto,f_auto')
    return {
      title: title || 'Edition',
      description: book?.description ?? undefined,
      openGraph: {
        title: title || 'Edition',
        description: book?.description ?? undefined,
        images: coverUrl ? [coverUrl] : [],
      },
    }
  } catch {
    return { title: 'Edition not found' }
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EditionPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { entry: initialEntryId } = await searchParams

  let edition: EditionDetail
  try {
    edition = await getEdition(slug)
  } catch {
    notFound()
  }

  // Always fetch community images (shown below official carousel, or as main section when no official photos)
  let communityImages: CommunityImage[] = []
  try {
    communityImages = await apiFetch<CommunityImage[]>(`/editions/${slug}/community-images`)
  } catch {
    // Non-fatal — show empty section
  }

  const book = edition.book
  // Features come from featureTags (new table) — source of truth
  const features = (edition.featureTags ?? [])
    .map((tag) => tag.rawValue)
  const rawArtists = (edition.artists ?? [])
  const artistMap = new Map<string, { artist: NonNullable<typeof rawArtists[number]['artist']>; roles: string[] }>()
  for (const contrib of rawArtists) {
    if (!contrib.artist) continue
    if (!artistMap.has(contrib.artist.id)) {
      artistMap.set(contrib.artist.id, { artist: contrib.artist, roles: [] })
    }
    artistMap.get(contrib.artist.id)!.roles.push(contrib.role)
  }
  const artistList = Array.from(artistMap.values())
  // Only show editionLabel if it's a custom name distinct from the company name
  const editionLabel = edition.bookBoxCompanyCustomName ?? null
  const monthBooks = edition.monthBooks ?? []
  const saleEditions = edition.saleEditions ?? []
  const bundles = saleEditions.filter(se => se.announcement.isBundle)
  const mainSaleAnnouncementId = saleEditions.find(se => !se.announcement.isBundle)?.announcement.id ?? null

  const reprints = saleEditions.filter(se => se.isReprint)
  const hasAnyReprint = reprints.length > 0


  const allImages: string[] = []
  const additionalSources = Array.isArray(edition.additionalImages) ? edition.additionalImages : []
  const coverSrc = additionalSources[0] ?? null

  const coverUrl = cloudinaryUrl(coverSrc, 'w_1200,q_auto,f_auto')
  if (coverUrl) allImages.push(coverUrl)

  // skip index 0 — already added as cover
  for (const img of additionalSources.slice(1)) {
    const url = cloudinaryUrl(img, 'w_1200,q_auto,f_auto')
    if (url) allImages.push(url)
  }

  const coverUrlForJsonLd = cloudinaryUrl(coverSrc, 'w_600,c_fill,q_auto,f_auto')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book?.title,
    description: book?.description,
    inLanguage: edition.language ?? book?.language,
    ...(coverUrlForJsonLd ? { image: coverUrlForJsonLd } : {}),
  }

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-stone-800 bg-gradient-to-b from-stone-950 to-stone-900">
        <div className="container mx-auto px-4 py-10 max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-10 items-start">

            {/* ── Left: Company name + Carousel ── */}
            <div className="flex flex-col items-center md:items-start gap-3">
              {/* Book box company name above carousel */}
              {edition.bookBoxCompany && (
                <Link
                  href={`/companies/${edition.bookBoxCompany.slug}`}
                  className="text-center md:text-left w-full font-serif font-semibold uppercase tracking-widest text-stone-300 hover:text-amber-400 transition-colors text-base leading-snug"
                >
                  {edition.bookBoxCompany.name}
                </Link>
              )}

              {allImages.length > 0 ? (
                <ImageCarousel images={allImages} alt={book?.title ?? 'Edition'} />
              ) : (
                <CommunityImageSection
                  editionSlug={slug}
                  initialImages={communityImages}
                />
              )}

              {/* Photo credit */}
              {edition.photoCredit && (() => {
                // Parse "@handle1 (role1), @handle2, @handle3 (role3)"
                // Each @handle on its own line with role in parens if present.
                const credits: { handle: string; role: string | null }[] = []
                const regex = /@([\w.]+)(?:\s*\(([^)]+)\))?/g
                let m: RegExpExecArray | null
                while ((m = regex.exec(edition.photoCredit!)) !== null) {
                  credits.push({ handle: m[1], role: m[2] ?? null })
                }
                if (credits.length === 0) return null
                return (
                  <div className="text-xs text-stone-400 mt-1 text-center leading-5 w-full">
                    <span>📷 photo by</span>
                    {credits.map(({ handle, role }) => (
                      <div key={handle}>
                        <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" className="hover:text-amber-400 transition-colors">@{handle}</a>
                        {role && <span className="text-stone-500"> ({role})</span>}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* ── Right: Info ── */}
            <div>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-sm text-stone-500 mb-4 flex-wrap">
                <span className="text-stone-500">Books</span>
                <span>›</span>
                {book && (
                  <>
                    <Link href={`/books/${book.slug}`} className="hover:text-amber-400 transition-colors">
                      {book.title}
                    </Link>
                    <span>›</span>
                  </>
                )}
                <span className="text-stone-400">{editionLabel ?? 'Edition'}</span>
              </div>

              {/* Series */}
              {book?.seriesName && (
                <Link
                  href={`/series/${book.series?.slug ?? encodeURIComponent(book.seriesName)}`}
                  className="inline-block text-sm text-amber-500 hover:text-amber-400 mb-2 font-medium transition-colors hover:underline"
                >
                  {book.seriesName}{book.volumeNumbers.length > 0 ? ` #${formatVolumeNumbers(book.volumeNumbers)}` : ''}
                </Link>
              )}
              {book?.seriesEntries && book.seriesEntries.filter(e => !e.isPrimary).length > 0 && (
                <p className="text-xs text-stone-500 mb-2">
                  Also in{' '}
                  {book.seriesEntries.filter(e => !e.isPrimary).map((entry, i, arr) => (
                    <span key={entry.seriesId}>
                      <Link href={`/series/${entry.series.slug}`} className="text-stone-400 hover:text-amber-400 transition-colors hover:underline">
                        {entry.series.name}{entry.volumeNumbers.length > 0 ? ` #${formatVolumeNumbers(entry.volumeNumbers)}` : ''}
                      </Link>
                      {i < arr.length - 1 && ', '}
                    </span>
                  ))}
                </p>
              )}

              {/* Title */}
              {book && (
                <Link href={`/books/${book.slug}`} className="group">
                  <h1 className="text-4xl font-serif font-bold text-stone-100 mb-1 leading-tight group-hover:text-amber-400 transition-colors">
                    {book.title}
                  </h1>
                </Link>
              )}

              {/* Authors — directly below title */}
              {book?.authors && book.authors.length > 0 && (
                <p className="text-stone-400 text-sm mb-3">
                  by{' '}
                  {book.authors.map((author, i) => (
                    <span key={author.id}>
                      {i > 0 && ', '}
                      <Link href={`/authors/${author.slug}`} className="text-stone-300 hover:text-amber-400 hover:underline transition-colors">
                        {author.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}

              {/* Edition label — only if it's a custom name (not just company name) */}
              {editionLabel && editionLabel !== edition.bookBoxCompany?.name && (
                <p className="text-lg text-amber-500/90 font-medium mb-2">{editionLabel}</p>
              )}
              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {!edition.verifiedAt && (
                  <Badge variant="warning">Pending verification</Badge>
                )}
                {edition.isSpecial && (
                  <Badge variant="default">Special Edition</Badge>
                )}
              </div>

              {/* Collection / wishlist actions */}
              <div className="mb-6">
                <EditionActionButtons
                  editionId={edition.id}
                  bookTitle={book?.title ?? editionLabel}
                  basePrice={edition.basePrice}
                  currency={edition.currency}
                  bundles={bundles.map(se => ({ id: se.announcement.id, title: se.announcement.title }))}
                  generalSaleDate={edition.generalSaleDate}
                  saleAnnouncementId={mainSaleAnnouncementId}
                />
              </div>

              {/* My collection panel */}
              <div className="mb-6">
                <CollectionEntryPanel
                  editionId={edition.id}
                  initialEntryId={initialEntryId ?? null}
                  editionGeneralSaleDate={edition.generalSaleDate ?? null}
                  saleEditions={saleEditions.map(se => ({
                    id: se.id,
                    isReprint: se.isReprint ?? false,
                    announcement: {
                      id: se.announcement.id,
                      title: se.announcement.title,
                      generalSaleDate: se.announcement.generalSaleDate ?? null,
                    },
                  }))}
                />
              </div>

              {/* Community stats — only show after general sale date has passed */}
              {(!edition.generalSaleDate || new Date(edition.generalSaleDate) <= new Date()) && (
              <div className="mb-6">
                <EditionCommunityStats
                  editionSlug={slug}
                  fallbackCurrency={edition.currency}
                />
              </div>
              )}

              {/* Meta grid */}
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
                {edition.publisher && (
                  <>
                    <dt className="text-stone-500">Publisher</dt>
                    <dd className="text-stone-200">{edition.publisher}</dd>
                  </>
                )}
                {edition.collection && (
                  <>
                    <dt className="text-stone-500">Collection</dt>
                    <dd>
                      <Link
                          href={`/companies/${edition.bookBoxCompany?.slug}/collections/${edition.collection.slug}`}
                          className="text-amber-400 hover:underline"
                        >
                        {edition.collection.name}
                      </Link>
                    </dd>
                  </>
                )}
                {edition.basePrice && (
                  <>
                    <dt className="text-stone-500">Price</dt>
                    <dd className="text-stone-200">{edition.basePrice} {edition.currency ?? ''}</dd>
                  </>
                )}
                {edition.language && (
                  <>
                    <dt className="text-stone-500">Language</dt>
                    <dd className="text-stone-200">{edition.language.charAt(0).toUpperCase() + edition.language.slice(1).toLowerCase()}</dd>
                  </>
                )}
                {edition.firstAccessDate && (
                  <>
                    <dt className="text-stone-500">First Access</dt>
                    <dd className="text-stone-200">{formatDate(edition.firstAccessDate)}</dd>
                  </>
                )}
                {edition.earlyAccessDate && (
                  <>
                    <dt className="text-stone-500">Early Access</dt>
                    <dd className="text-stone-200">{formatDate(edition.earlyAccessDate)}</dd>
                  </>
                )}
                {edition.generalSaleDate && (
                  <>
                    <dt className="text-stone-500">Sale Date</dt>
                    <dd className="text-stone-200">{formatDate(edition.generalSaleDate)}</dd>
                  </>
                )}
                {/* Subscription info */}
                {monthBooks.map((mb) => {
                  const siblings = mb.month.books.filter(
                    (b) => !(b.edition?.slug === slug || (!b.edition && b.book.slug === edition.book?.slug))
                  )
                  const sub = mb.month.subscription
                  // Last day of the book's month — variants started after this shouldn't show
                  const bookMonthLastDay = new Date(mb.month.year, mb.month.month, 0) // day 0 = last day of prev month trick
                  // If sub is a content stream, show only variants active during book's month
                  const displaySubs = sub.isContentStream && sub.variants.length > 0
                    ? sub.variants.filter(v =>
                        (!v.startDate || new Date(v.startDate) <= bookMonthLastDay) &&
                        (!v.endDate || new Date(v.endDate) >= new Date(mb.month.year, mb.month.month - 1, 1))
                      )
                    : [sub]
                  return (
                    <Fragment key={mb.month.id}>
                      <dt className="text-stone-500">Subscription</dt>
                      <dd>
                        {displaySubs.map((s, i) => (
                          <span key={s.id}>
                            {i > 0 && <span className="text-stone-600 mx-1">/</span>}
                            <Link
                              href={`/subscriptions/${s.slug}`}
                              className="text-amber-400 hover:underline"
                            >
                              {s.name}
                            </Link>
                          </span>
                        ))}
                        {mb.month.series && (
                          <span className="text-stone-400 ml-1">· {mb.month.series.name}</span>
                        )}
                        <span className="text-stone-500 ml-1 text-xs">
                          {new Date(mb.month.year, mb.month.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          {mb.month.theme ? ` · ${mb.month.theme}` : ''}
                        </span>
                        {siblings.length > 0 && (
                          <span className="text-stone-400 text-xs ml-1">
                            · set with{' '}
                            {siblings.map((s, i) => (
                              <span key={s.book.slug}>
                                {i > 0 && ', '}
                                {s.edition?.slug ? (
                                  <Link
                                    href={`/editions/${s.edition.slug}`}
                                    className="text-amber-400/80 hover:text-amber-400 hover:underline transition-colors"
                                  >
                                    {s.book.title}
                                  </Link>
                                ) : (
                                  <Link
                                    href={`/books/${s.book.slug}`}
                                    className="text-amber-400/80 hover:text-amber-400 hover:underline transition-colors"
                                  >
                                    {s.book.title}
                                  </Link>
                                )}
                              </span>
                            ))}
                          </span>
                        )}
                      </dd>
                    </Fragment>
                  )
                })}
                {/* Bundle info */}
                {bundles.map((se) => (
                  <Fragment key={se.announcement.id}>
                    <dt className="text-stone-500">Bundle</dt>
                    <dd>
                      <Link
                        href={`/sale-announcements/${se.announcement.id}`}
                        className="text-amber-400 hover:underline"
                      >
                        {se.announcement.title}
                      </Link>
                    </dd>
                  </Fragment>
                ))}
              </dl>

            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-5xl space-y-12">

        {/* ── Features ─────────────────────────────────────────────────────── */}
        {features.length > 0 && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">What&apos;s Included</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-stone-300">
                  <span className="text-amber-500 mt-0.5 shrink-0">✦</span>
                  <span>{normDisplay(f)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Artists ──────────────────────────────────────────────────────── */}
        {artistList.length > 0 && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Artists</h2>
            <div className="flex flex-wrap gap-4">
              {artistList.map(({ artist, roles }) => {
                const cleanName = artist.name.startsWith('@') ? artist.name.slice(1) : artist.name
                const photoUrl = cloudinaryUrl(artist.photoUrl ?? null, 'w_64,h_64,c_fill,q_auto,f_auto')
                return (
                  <Link
                    key={artist.id}
                    href={`/artists/${artist.slug}`}
                    className="flex items-center gap-3 group"
                  >
                    {/* Avatar */}
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt={cleanName}
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-stone-700 group-hover:ring-amber-500/50 transition-all shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center text-stone-400 font-serif text-base shrink-0 ring-1 ring-stone-700 group-hover:ring-amber-500/50 transition-all">
                        {cleanName[0]?.toUpperCase()}
                      </div>
                    )}

                    {/* Name + roles */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-200 group-hover:text-amber-400 transition-colors leading-tight truncate max-w-[160px]">
                        {cleanName}
                      </p>
                      {roles.map((role) => (
                        <p key={role} className="text-sm text-stone-400">{normDisplay(role)}</p>
                      ))}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Contains (omnibus) ───────────────────────────────────────────── */}
        {book?.isOmnibus && book.omnibusComponents && book.omnibusComponents.length > 0 && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Contains</h2>
            <div className="space-y-1">
              {book.omnibusComponents.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-sm text-stone-300">
                  {c.volumeNumber != null && (
                    <span className="text-xs text-amber-600/80 font-semibold w-12 shrink-0">Vol. {c.volumeNumber}</span>
                  )}
                  <Link href={`/books/${c.book.slug}`} className="hover:text-amber-400 transition-colors">
                    {c.book.title}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Edition History ──────────────────────────────────────────────── */}
        {(edition.previousEdition || edition.nextEdition) && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Edition History</h2>
            <div className="space-y-2">
              {edition.previousEdition && (
                <Link href={`/editions/${edition.previousEdition.slug}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-stone-800/50 border border-stone-700/40 hover:border-amber-600/40 transition-colors text-sm">
                  <span className="text-stone-500">←</span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-stone-500 uppercase tracking-wide">Older edition</span>
                    <span className="text-stone-300 truncate">
                      {edition.previousEdition.bookBoxCompany?.name ?? edition.previousEdition.slug}
                      {edition.previousEdition.collection ? ` — ${edition.previousEdition.collection.name}` : ''}
                    </span>
                  </div>
                </Link>
              )}
              {edition.nextEdition && (
                <Link href={`/editions/${edition.nextEdition.slug}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-stone-800/50 border border-stone-700/40 hover:border-amber-600/40 transition-colors text-sm">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs text-stone-500 uppercase tracking-wide">Newer edition available</span>
                    <span className="text-stone-300 truncate">
                      {edition.nextEdition.bookBoxCompany?.name ?? edition.nextEdition.slug}
                      {edition.nextEdition.collection ? ` — ${edition.nextEdition.collection.name}` : ''}
                    </span>
                  </div>
                  <span className="text-stone-500">→</span>
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ── Reprint History ──────────────────────────────────────────────── */}
        {reprints.length > 0 && (
          <section>
            <h2 className="text-xl font-serif font-semibold text-stone-100 mb-4">Reprint History</h2>
            <div className="space-y-2">
              {saleEditions.map((se, i) => {
                const sa = se.announcement
                const isFirst = i === 0
                const dateStr = sa.generalSaleDate
                  ? new Date(sa.generalSaleDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                  : null
                return (
                  <Link
                    key={sa.id}
                    href={`/sale-announcements/${sa.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-stone-800/50 border border-stone-700/40 hover:border-amber-600/40 transition-colors text-sm"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-stone-300 truncate">{sa.title}</span>
                      {dateStr && <span className="text-xs text-stone-500 mt-0.5">{dateStr}</span>}
                    </div>
                    {se.isReprint ? (
                      <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0">🔁 Reprint</span>
                    ) : (
                      <span className="text-xs bg-stone-700 text-stone-400 px-2 py-0.5 rounded-full shrink-0">Original</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}