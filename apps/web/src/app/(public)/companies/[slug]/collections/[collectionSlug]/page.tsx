import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
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
      description: col.description ?? `${col.name} collection editions`,
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

  const coverUrl = cloudinaryUrl(collection.coverImage, 'w_1200,h_400,c_fill,q_auto,f_auto')
  const editions = collection.editions ?? []

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      {/* Collection header */}
      {coverUrl && (
        <div className="relative w-full rounded-2xl overflow-hidden mb-8 aspect-[3/1]">
          <Image src={coverUrl} alt={collection.name} fill className="object-cover" unoptimized />
        </div>
      )}

      <div className="mb-10">
        {collection.company && (
          <Link
            href={`/companies/${collection.company.slug}`}
            className="text-xs text-amber-500 hover:text-amber-400 uppercase tracking-widest font-medium transition-colors"
          >
            {collection.company.name}
          </Link>
        )}
        <h1 className="text-4xl font-serif font-bold text-stone-100 mt-2 mb-3">{collection.name}</h1>
        {collection.description && (
          <p className="text-stone-300 leading-relaxed max-w-2xl">{collection.description}</p>
        )}
        <p className="text-stone-500 text-sm mt-3">{editions.length} edition{editions.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Editions grid */}
      {editions.length === 0 ? (
        <p className="text-stone-500">No editions in this collection yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {editions.map((edition) => {
            const imgUrl = cloudinaryUrl(edition.coverImage, 'w_320,h_480,c_fill,q_auto,f_auto')
            const book = edition.book
            const authors = book?.authors?.map((a) => (a as { name: string }).name).join(', ') ?? null
            const href = book?.slug ? `/books/${book.slug}` : '#'

            return (
              <Link
                key={edition.id}
                href={href}
                className="group flex flex-col rounded-lg overflow-hidden border border-stone-700 hover:border-amber-600/60 transition-all"
                style={{ background: 'var(--bg-raised)' }}
              >
                {/* Cover */}
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: '2/3', background: 'var(--bg-surface)' }}>
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imgUrl}
                      alt={book?.title ?? 'Edition'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl font-serif text-amber-700/50">{book?.title?.charAt(0) ?? '?'}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="px-2.5 pt-2 pb-2">
                  <div className="h-[2.25rem] overflow-hidden mb-1">
                    <p className="text-xs font-serif font-semibold text-stone-200 group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug">
                      {book?.title ?? 'Unknown'}
                    </p>
                  </div>
                  <p className="text-[10px] text-stone-500 line-clamp-1 font-sans leading-tight">
                    {book?.seriesName
                      ? `${book.seriesName}${book.volumeNumber != null ? ` #${book.volumeNumber}` : ''}`
                      : '\u00A0'}
                  </p>
                  <p className="text-[10px] text-stone-400 line-clamp-1 font-sans leading-tight mt-0.5">
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
