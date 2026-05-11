import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { EditionCard } from '@/components/books/EditionCard'
import type { ApiAuthor } from '@luxgrimoire/shared-types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditionSnippet {
  id: string
  slug: string
  additionalImages: string[]
  communityPhotoCover?: string | null
  verifiedAt: string | null
  generalSaleDate?: string | null
  bookBoxCompany: { name: string; slug: string; brandColors?: string[] | null } | null
}

interface BookSnippet {
  id: string
  slug: string
  title: string
  seriesName: string | null
  volumeNumber: number | null
  editions: EditionSnippet[]
}

interface ApiAuthorDetail extends ApiAuthor {
  books: BookSnippet[]
}

interface Props {
  params: Promise<{ slug: string }>
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const author = await apiFetch<ApiAuthorDetail>(`/authors/${slug}`)
    return {
      title: author.name,
      description: author.bio ?? `Books by ${author.name} on LuxGrimoire`,
      openGraph: {
        title: author.name,
        description: author.bio ?? undefined,
      },
    }
  } catch {
    return { title: 'Author not found' }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SocialLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-cyan-400 transition-colors border border-stone-700 hover:border-cyan-700/60 rounded-full px-3 py-1"
    >
      {icon}
      <span>{label}</span>
    </a>
  )
}

function BookRow({ book }: { book: BookSnippet }) {
  const label = book.volumeNumber != null
    ? `#${book.volumeNumber} ${book.title}`
    : book.title

  return (
    <div className="py-4 border-b border-stone-800 last:border-0">
      <Link
        href={`/books/${book.slug}`}
        className="inline-block font-serif font-semibold text-stone-100 hover:text-amber-400 transition-colors mb-3 text-base leading-snug"
      >
        {label}
      </Link>
      {book.editions.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {book.editions.map(edition => (
            <EditionCard
              key={edition.id}
              href={`/editions/${edition.slug}`}
              coverImage={resolveEditionCoverRaw(edition)}
              companyName={edition.bookBoxCompany?.name}
              companyBrandColors={edition.bookBoxCompany?.brandColors}
              unverified={!edition.verifiedAt}
              generalSaleDate={edition.generalSaleDate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params

  let author: ApiAuthorDetail
  try {
    author = await apiFetch<ApiAuthorDetail>(`/authors/${slug}`)
  } catch {
    notFound()
  }

  const photoUrl = cloudinaryUrl(author.photoUrl, 'w_400,h_400,c_fill,q_auto,f_auto')
  const books = author.books ?? []

  // Group: standalones vs series
  const standalones = books
    .filter(b => !b.seriesName)
    .sort((a, b) => a.title.localeCompare(b.title))

  const seriesMap = new Map<string, BookSnippet[]>()
  for (const book of books) {
    if (!book.seriesName) continue
    const existing = seriesMap.get(book.seriesName)
    if (existing) existing.push(book)
    else seriesMap.set(book.seriesName, [book])
  }
  // Sort books within each series by volumeNumber
  for (const [, seriesBooks] of seriesMap) {
    seriesBooks.sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0))
  }

  const socials: { href: string; label: string; icon: React.ReactNode }[] = []
  if (author.instagram) socials.push({
    href: `https://instagram.com/${author.instagram.replace('@', '')}`,
    label: `@${author.instagram.replace('@', '')}`,
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
  })
  if (author.twitter) socials.push({
    href: `https://twitter.com/${author.twitter.replace('@', '')}`,
    label: `@${author.twitter.replace('@', '')}`,
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.745l7.734-8.835L1.254 2.25H8.08l4.26 5.632 5.905-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  })
  if (author.tiktok) socials.push({
    href: `https://tiktok.com/@${author.tiktok.replace('@', '')}`,
    label: `@${author.tiktok.replace('@', '')}`,
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.77a4.85 4.85 0 01-1.01-.08z"/></svg>,
  })
  if (author.website) socials.push({
    href: author.website.startsWith('http') ? author.website : `https://${author.website}`,
    label: author.website.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>,
  })
  if (author.facebook) socials.push({
    href: `https://facebook.com/${author.facebook.replace('@', '')}`,
    label: author.facebook,
    icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.name,
    description: author.bio,
    ...(photoUrl ? { image: photoUrl } : {}),
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Author header */}
      <div className="flex flex-col sm:flex-row gap-8 items-start mb-12">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={author.name}
            className="w-32 h-32 rounded-full object-cover shadow-lg ring-2 ring-amber-700/30 shrink-0"
          />
        )}
        <div>
          <p className="text-xs text-amber-600 uppercase tracking-widest mb-2 font-medium">Author</p>
          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-4">{author.name}</h1>
          {author.bio && (
            <p className="text-stone-300 leading-relaxed max-w-2xl">{author.bio}</p>
          )}
          {socials.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {socials.map((s) => (
                <SocialLink key={s.href} href={s.href} label={s.label} icon={s.icon} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Books */}
      {books.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
            Books by {author.name}
            <span className="ml-2 text-base font-sans font-normal text-stone-500">({books.length})</span>
          </h2>

          {/* Standalones */}
          {standalones.length > 0 && (
            <div className="mb-10">
              {seriesMap.size > 0 && (
                <h3 className="text-xs uppercase tracking-widest text-stone-500 font-medium mb-2 border-b border-stone-800 pb-2">
                  Standalones
                </h3>
              )}
              {standalones.map(book => <BookRow key={book.id} book={book} />)}
            </div>
          )}

          {/* Series */}
          {Array.from(seriesMap.entries()).map(([seriesName, seriesBooks]) => (
            <div key={seriesName} className="mb-10">
              <h3 className="text-xs uppercase tracking-widest text-stone-500 font-medium mb-2 border-b border-stone-800 pb-2">
                {seriesName}
              </h3>
              {seriesBooks.map(book => <BookRow key={book.id} book={book} />)}
            </div>
          ))}
        </section>
      )}

      {books.length === 0 && (
        <p className="text-stone-600 text-sm">No books listed yet.</p>
      )}
    </div>
  )
}
