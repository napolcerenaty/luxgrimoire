'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

function cloudThumb(url: string, size = 'w_80,h_120,c_fill,q_auto,f_auto') {
  if (!url) return url
  if (url.startsWith('http') && url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/${size}/`)
  }
  if (CLOUD_NAME && !url.startsWith('http')) {
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${size}/${url}`
  }
  return url
}

interface CommunityImage {
  id: string
  url: string
  cloudinaryId: string
  sortOrder: number
  instagramHandle: string | null
  status: string
  consentGiven: boolean
  consentedAt: string
  createdAt: string
  user: { id: string; username: string; email: string }
  edition: { id: string; slug: string; editionName: string | null }
}

interface EditionGroup {
  editionId: string
  slug: string
  name: string
  images: CommunityImage[]
}

const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REMOVED']
const STATUS_STYLES: Record<string, string> = {
  PENDING: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  APPROVED: 'text-green-400 bg-green-500/10 border-green-500/30',
  REMOVED: 'text-stone-500 bg-stone-700/30 border-stone-600/30',
}

function groupImages(images: CommunityImage[]): EditionGroup[] {
  const map = new Map<string, EditionGroup>()
  for (const img of images) {
    const { id, slug, editionName } = img.edition
    if (!map.has(id)) {
      map.set(id, { editionId: id, slug, name: editionName ?? slug, images: [] })
    }
    map.get(id)!.images.push(img)
  }
  return Array.from(map.values())
}

export default function AdminCommunityImagesPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [localImages, setLocalImages] = useState<CommunityImage[]>([])
  const [dirtyEditions, setDirtyEditions] = useState<Set<string>>(new Set())

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['admin', 'community-images', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      return authFetch<CommunityImage[]>(`/admin/community-images?${params}`)
    },
  })

  useEffect(() => {
    setLocalImages(images)
    setDirtyEditions(new Set())
  }, [images])

  const groups = groupImages(localImages)

  const moveImage = (editionId: string, imgIndex: number, dir: -1 | 1) => {
    setLocalImages(prev => {
      const edImages = prev.filter(img => img.edition.id === editionId)
      const newIdx = imgIndex + dir
      if (newIdx < 0 || newIdx >= edImages.length) return prev
      const copy = [...prev]
      const gi = copy.indexOf(edImages[imgIndex])
      const gj = copy.indexOf(edImages[newIdx])
      ;[copy[gi], copy[gj]] = [copy[gj], copy[gi]]
      return copy
    })
    setDirtyEditions(prev => new Set(prev).add(editionId))
  }

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      authFetch(`/admin/community-images/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'community-images'] }),
  })

  const deleteImage = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/admin/community-images/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'community-images'] }),
  })

  const saveOrder = useMutation({
    mutationFn: ({ editionId }: { editionId: string }) => {
      const edImages = localImages.filter(img => img.edition.id === editionId)
      const items = edImages.map((img, i) => ({ id: img.id, sortOrder: i }))
      return authFetch('/admin/community-images/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      })
    },
    onSuccess: (_, { editionId }) => {
      setDirtyEditions(prev => {
        const next = new Set(prev)
        next.delete(editionId)
        return next
      })
      qc.invalidateQueries({ queryKey: ['admin', 'community-images'] })
    },
  })

  return (
    <div className="space-y-6">
      {/* Header + filter pills */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-serif font-semibold text-stone-100">Community Images</h1>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                statusFilter === s
                  ? STATUS_STYLES[s] ?? 'text-stone-300 bg-stone-700 border-stone-600'
                  : 'text-stone-500 border-stone-700 hover:border-stone-500'
              }`}
            >
              {s}
            </button>
          ))}
          {statusFilter && (
            <button
              onClick={() => setStatusFilter('')}
              className="px-3 py-1.5 text-xs rounded-full border border-stone-700 text-stone-500 hover:border-stone-500"
            >
              All
            </button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-stone-500 text-sm">Loading…</p>}

      {!isLoading && localImages.length === 0 && (
        <p className="text-stone-500 text-sm">No images found.</p>
      )}

      {/* Edition groups */}
      {groups.map(group => (
        <div key={group.editionId} className="rounded-xl border border-stone-700/60 bg-stone-900/30 overflow-hidden">
          {/* Edition header */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-stone-800/50 border-b border-stone-700/40">
            <a
              href={`/editions/${group.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors truncate"
            >
              {group.name}
            </a>
            <span className="text-stone-600 text-xs shrink-0">
              {group.images.length} image{group.images.length !== 1 ? 's' : ''}
            </span>
            {dirtyEditions.has(group.editionId) && (
              <button
                onClick={() => saveOrder.mutate({ editionId: group.editionId })}
                disabled={saveOrder.isPending}
                className="ml-auto shrink-0 px-3 py-1 text-xs rounded bg-amber-700/60 hover:bg-amber-600/70 text-amber-200 border border-amber-600/40 disabled:opacity-50 transition-colors"
              >
                {saveOrder.isPending ? 'Saving…' : '↕ Save order'}
              </button>
            )}
          </div>

          {/* Image rows */}
          <div className="divide-y divide-stone-800/60">
            {group.images.map((img, idx) => (
              <div key={img.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-800/30 transition-colors">
                {/* Thumbnail */}
                <button
                  type="button"
                  onClick={() => setLightboxUrl(img.url)}
                  className="flex-shrink-0 w-[54px] h-[80px] rounded overflow-hidden bg-stone-800 ring-1 ring-stone-700 hover:ring-amber-500/60 transition-all"
                  title="View full size"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cloudThumb(img.url)}
                    alt="thumbnail"
                    className="w-full h-full object-cover"
                  />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[img.status] ?? ''}`}>
                      {img.status}
                    </span>
                    <span className="text-xs text-stone-300">{img.user.username}</span>
                    {img.instagramHandle && (
                      <a
                        href={`https://instagram.com/${img.instagramHandle}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-stone-500 hover:text-amber-400 transition-colors"
                      >
                        @{img.instagramHandle}
                      </a>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-600">
                    Submitted {new Date(img.createdAt).toLocaleDateString()} · Consent {img.consentGiven ? '✓' : '✗'} {new Date(img.consentedAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {img.status !== 'APPROVED' && (
                    <button
                      onClick={() => updateStatus.mutate({ id: img.id, status: 'APPROVED' })}
                      disabled={updateStatus.isPending}
                      className="px-2 py-1 text-[11px] rounded bg-green-800/50 text-green-400 hover:bg-green-700/60 disabled:opacity-50 transition-colors border border-green-700/40"
                      title="Approve"
                    >
                      ✓
                    </button>
                  )}
                  {img.status !== 'REMOVED' && (
                    <button
                      onClick={() => updateStatus.mutate({ id: img.id, status: 'REMOVED' })}
                      disabled={updateStatus.isPending}
                      className="px-2 py-1 text-[11px] rounded bg-stone-800/50 text-stone-400 hover:bg-stone-700/60 disabled:opacity-50 transition-colors border border-stone-700/40"
                      title="Remove"
                    >
                      Hide
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Delete permanently from Cloudinary too?')) {
                        deleteImage.mutate(img.id)
                      }
                    }}
                    disabled={deleteImage.isPending}
                    className="px-2 py-1 text-[11px] rounded bg-red-900/30 text-red-400 hover:bg-red-800/40 disabled:opacity-50 transition-colors border border-red-700/30"
                    title="Delete permanently"
                  >
                    Del
                  </button>
                </div>

                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => moveImage(group.editionId, idx, -1)}
                    disabled={idx === 0}
                    className="w-6 h-6 flex items-center justify-center rounded text-[13px] text-stone-500 hover:text-stone-200 hover:bg-stone-700 disabled:opacity-20 transition-colors"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(group.editionId, idx, 1)}
                    disabled={idx === group.images.length - 1}
                    className="w-6 h-6 flex items-center justify-center rounded text-[13px] text-stone-500 hover:text-stone-200 hover:bg-stone-700 disabled:opacity-20 transition-colors"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-stone-800/90 text-stone-200 hover:bg-stone-700 flex items-center justify-center text-lg z-10 border border-stone-600"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cloudThumb(lightboxUrl, 'w_1200,h_1800,c_fill,q_auto,f_auto')}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
