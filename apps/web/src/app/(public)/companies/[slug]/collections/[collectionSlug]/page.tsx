import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import type { ApiBookBoxCollection, ApiBookEdition } from '@luxgrimoire/shared-types'

interface CollectionWithEditions extends ApiBookBoxCollection {
  editions: ApiBookEdition[]
}

interface Props {
  params: Promise<{ slug: string; collectionSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collectionSlug } = await params
  try {
    const col = await apiFetch<CollectionWithEditions>(`/book-box-collections/${collectionSlug}`)
    return {
      title: `${col.name} — ${col.company?.name ?? ''}`,
    }
  } catch {
    return { title: 'Collection not found' }
  }
}

export default async function CollectionPage({ params }: Props) {
  const { collectionSlug } = await params

  let collection: CollectionWithEditions
  try {
    collection = await apiFetch<CollectionWithEditions>(`/book-box-collections/${collectionSlug}`)
  } catch {
    notFound()
  }

  const editions = collection.editions ?? []

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        {/* Company breadcrumb with logo */}
        {collection.company && (
          <Link
            href={`/companies/${collection.company.slug}`}
            className="inline-flex items-center gap-2 text-xs text-brand-500 hover:text-brand-400 uppercase tracking-widest font-medium transition-colors mb-4"
          >
            {collection.company.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cloudinaryUrl(collection.company.logoUrl, 'w_40,h_40,c_fill,q_auto,f_auto')!}
                alt={collection.company.name}
                className="w-5 h-5 rounded object-cover"
              />
            )}
            ← {collection.company.name}
          </Link>
        )}

        {/* Accent bar using brand colors */}
        <div
          className="h-0.5 w-16 rounded-full mb-4 opacity-70"
          style={brandGradientStyle(collection.company?.brandColors)}
        />

        <div className="flex items-center gap-3 flex-wrap mb-2">
          <span className="text-navy-500 text-xs">{editions.length} edition{editions.length !== 1 ? 's' : ''}</span>
        </div>

        <h1 className="text-4xl font-serif font-bold text-navy-100 mt-1">{collection.name}</h1>
      </div>

      {/* Editions grid */}
      {editions.length === 0 ? (
        <p className="text-navy-500">No editions in this collection yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {editions.map((edition) => {
            const imgUrl = cloudinaryUrl(edition.additionalImages?.[0] ?? null, 'w_320,h_480,c_fill,q_auto,f_auto')
            const book = edition.book
            const authors = book?.authors?.map((a) => (a as { name: string }).name).join(', ') ?? null
            const customName = edition.bookBoxCompanyCustomName
            const href = `/editions/${edition.slug}`
            const displayTitle = formatEditionDisplayTitle(book, edition)

            return (
              <Link
                key={edition.id}
                href={href}
                className="group flex flex-col rounded-lg overflow-hidden border border-navy-700 hover:border-brand-600/60 transition-all"
                style={{ background: 'var(--bg-raised)' }}
              >
                {/* Cover */}
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: '2/3', background: 'var(--bg-surface)' }}>
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imgUrl}
                      alt={displayTitle || 'Edition'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(collection.company?.brandColors)} />
                      <span className="relative z-10 text-xs font-serif text-navy-300/80 text-center leading-snug line-clamp-4 px-2">{displayTitle || '?'}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="px-2.5 pt-2 pb-2">
                  <div className="h-[2.25rem] overflow-hidden mb-1">
                    <p className="text-xs font-serif font-semibold text-navy-200 group-hover:text-brand-400 transition-colors line-clamp-2 leading-snug">
                      {displayTitle || 'Unknown'}
                    </p>
                  </div>
                  {customName && (
                    <p className="text-[10px] text-brand-500/70 font-medium line-clamp-1 leading-tight mb-0.5">{customName}</p>
                  )}
                  <p className="text-[10px] text-navy-500 line-clamp-1 font-sans leading-tight">
                    {book?.seriesName
                      ? `${book.seriesName}${book.volumeNumbers?.length ? ` #${formatVolumeNumbers(book.volumeNumbers)}` : ''}`
                      : '\u00A0'}
                  </p>
                  <p className="text-[10px] text-navy-400 line-clamp-1 font-sans leading-tight mt-0.5">
                    {authors || '\u00A0'}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
