'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import { BookOpen, Trash2, MoveRight } from 'lucide-react'

interface CollectionEntry {
  id: string
  isWishlist: boolean
  condition: string | null
  acquiredAt: string | null
  edition: {
    id: string
    slug: string
    coverImage: string | null
    publisher: string | null
    publishYear: number | null
    format: string | null
    book: {
      id: string
      title: string
      slug: string
      seriesName: string | null
      authors: Array<{ id: string; name: string; slug: string }>
    }
  }
}

export default function WishlistPage() {
  const queryClient = useQueryClient()

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['collection', true],
    queryFn: () => authFetch<CollectionEntry[]>('/collection?isWishlist=true'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/collection/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['collection', true] }),
  })

  const moveMutation = useMutation({
    mutationFn: (id: string) =>
      authFetch<void>(`/collection/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isWishlist: false }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] })
      void queryClient.invalidateQueries({ queryKey: ['collection-stats'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-stone-400 animate-pulse">Loading wishlist…</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-stone-100">Wishlist</h1>
        <p className="text-stone-400 text-sm mt-1">
          {entries.length} {entries.length === 1 ? 'item' : 'items'} on your wishlist
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-stone-500">
          <BookOpen size={48} className="mb-4 opacity-30" />
          <p className="font-serif text-lg">Your wishlist is empty</p>
          <p className="text-sm mt-1">Add books you want to read or own</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {entries.map((entry) => {
            const cover = cloudinaryUrl(entry.edition.coverImage)
            return (
              <div
                key={entry.id}
                className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden group hover:border-stone-600 transition-colors"
              >
                <div className="aspect-[2/3] bg-stone-800 relative overflow-hidden">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={entry.edition.book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-600">
                      <BookOpen size={32} />
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-stone-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <button
                      onClick={() => moveMutation.mutate(entry.id)}
                      disabled={moveMutation.isPending}
                      className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold px-3 py-1.5 rounded-lg text-xs w-full justify-center transition-colors"
                    >
                      <MoveRight size={12} />
                      Move to Collection
                    </button>
                    <button
                      onClick={() => removeMutation.mutate(entry.id)}
                      disabled={removeMutation.isPending}
                      className="flex items-center gap-1.5 border border-stone-600 text-stone-300 hover:text-red-400 hover:border-red-800 px-3 py-1.5 rounded-lg text-xs w-full justify-center transition-colors"
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-stone-100 leading-tight line-clamp-2 mb-1">
                    {entry.edition.book.title}
                  </p>
                  {entry.edition.book.authors[0] && (
                    <p className="text-xs text-stone-400 truncate">
                      {entry.edition.book.authors[0].name}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {entry.edition.publisher && (
                      <Badge variant="outline">{entry.edition.publisher}</Badge>
                    )}
                    {entry.edition.format && (
                      <Badge variant="default">{entry.edition.format}</Badge>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
