'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Trash2, BookOpen, User, Palette, Building2 } from 'lucide-react'

type EntityType = 'BOOK' | 'AUTHOR' | 'ARTIST' | 'COMPANY'

interface FavoriteEntity {
  id: string
  entityType: EntityType
  entityId: string
  entity: {
    id: string
    name: string
    slug: string
    coverImage?: string | null
    photoUrl?: string | null
    logoUrl?: string | null
    title?: string
  } | null
}

const TABS: Array<{ key: EntityType; label: string; icon: React.ElementType; href: string }> = [
  { key: 'BOOK', label: 'Books', icon: BookOpen, href: '/books' },
  { key: 'AUTHOR', label: 'Authors', icon: User, href: '/authors' },
  { key: 'ARTIST', label: 'Artists', icon: Palette, href: '/artists' },
  { key: 'COMPANY', label: 'Companies', icon: Building2, href: '/companies' },
]

function getImageUrl(fav: FavoriteEntity): string | null {
  if (!fav.entity) return null
  switch (fav.entityType) {
    case 'BOOK': return cloudinaryUrl(fav.entity.coverImage)
    case 'AUTHOR': return cloudinaryUrl(fav.entity.photoUrl)
    case 'ARTIST': return cloudinaryUrl(fav.entity.photoUrl)
    case 'COMPANY': return cloudinaryUrl(fav.entity.logoUrl)
    default: return null
  }
}

function getEntityName(fav: FavoriteEntity): string {
  if (!fav.entity) return 'Unknown'
  return fav.entity.title ?? fav.entity.name
}

function getEntityHref(fav: FavoriteEntity): string {
  if (!fav.entity) return '#'
  const base = TABS.find((t) => t.key === fav.entityType)?.href ?? ''
  return `${base}/${fav.entity.slug}`
}

function TabIcon({ type }: { type: EntityType }) {
  const tab = TABS.find((t) => t.key === type)
  if (!tab) return null
  const Icon = tab.icon
  return <Icon size={32} className="text-stone-600" />
}

export default function FavoritesPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<EntityType>('BOOK')

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['favorites', activeTab],
    queryFn: () => authFetch<FavoriteEntity[]>(`/favorites?entityType=${activeTab}`),
  })

  const removeMutation = useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: EntityType; entityId: string }) =>
      authFetch<void>(`/favorites/${entityType}/${entityId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['favorites', activeTab] }),
  })

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-stone-100">Favorites</h1>
        <p className="text-stone-400 text-sm mt-1">Your starred books, authors, artists and companies</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-stone-800">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-stone-400 animate-pulse">Loading…</div>
        </div>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-stone-500">
          <TabIcon type={activeTab} />
          <p className="font-serif text-lg mt-4">No favorite {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()}</p>
          <p className="text-sm mt-1">Browse and star {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} to add them here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {favorites.map((fav) => {
            const imageUrl = getImageUrl(fav)
            const name = getEntityName(fav)
            const href = getEntityHref(fav)
            return (
              <div
                key={fav.id}
                className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden group hover:border-stone-600 transition-colors"
              >
                <Link href={href} className="block">
                  <div className="aspect-square bg-stone-800 relative overflow-hidden">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <TabIcon type={fav.entityType} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-stone-100 line-clamp-2">{name}</p>
                  </div>
                </Link>
                <div className="px-3 pb-3">
                  <button
                    onClick={() => removeMutation.mutate({ entityType: fav.entityType, entityId: fav.entityId })}
                    disabled={removeMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-red-400 transition-colors"
                    aria-label="Remove from favorites"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
