'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { CommunityImage as BaseCommunityImage } from '@/types/community'

interface CommunityImage extends BaseCommunityImage {
  consentGiven: boolean
  consentedAt: string
  createdAt: string
  user: { id: string; username: string; email: string }
  edition: { id: string; slug: string }
}

interface EditionSummary {
  editionId: string
  slug: string
  name: string
  count: number
}

const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REMOVED']
const STATUS_STYLES: Record<string, string> = {
  PENDING: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  APPROVED: 'text-green-400 bg-green-500/10 border-green-500/30',
  REMOVED: 'text-stone-500 bg-stone-700/30 border-stone-600/30',
}

// ─── Single expanded panel ────────────────────────────────────────────────────

function EditionPanel({
  summary,
  statusFilter,
}: {
  summary: EditionSummary
  statusFilter: string
}) {
  const qc = useQueryClient()
  const [localImages, setLocalImages] = useState<CommunityImage[]>([])
  const [dirtyIds, setDirtyIds] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['admin', 'community-images', statusFilter, summary.editionId],
    queryFn: () =>
      authFetch<CommunityImage[]>(
        `/admin/community-images?${statusFilter ? `status=${statusFilter}&` : ''}editionId=${summary.editionId}`,
      ),
  })

  // Sync remote → local on first load
  if (images.length && !localImages.length) setLocalImages(images)

  const moveImage = (imgIndex: number, dir: -1 | 1) => {
    setLocalImages(prev => {
      const newIdx = imgIndex + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const copy = [...prev]
      ;[copy[imgIndex], copy[newIdx]] = [copy[newIdx], copy[imgIndex]]
      return copy
    })
    setDirtyIds(true)
  }

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      authFetch(`/admin/community-images/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'community-images', statusFilter, summary.editionId] })
      qc.invalidateQueries({ queryKey: ['admin', 'community-images-editions', statusFilter] })
    },
  })

  const deleteImage = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/admin/community-images/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'community-images', statusFilter, summary.editionId] })
      qc.invalidateQueries({ queryKey: ['admin', 'community-images-editions', statusFilter] })
    },
  })

  const saveOrder = useMutation({
    mutationFn: () => {
      const items = localImages.map((img, i) => ({ id: img.id, sortOrder: i }))
      return authFetch('/admin/community-images/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      })
    },
    onSuccess: () => {
      setDirtyIds(false)
      qc.invalidateQueries({ queryKey: ['admin', 'community-images', statusFilter, summary.editionId] })
    },
  })

  const displayImages = localImages.length ? localImages : images

  return (
    <div className="divide-y divide-stone-800/60">
      {isLoading && (
        <p className="text-stone-500 text-xs px-4 py-3">Loading…</p>
      )}

      {dirtyIds && (
        <div className="px-4 py-2 flex justify-end">
          <button
            onClick={() => saveOrder.mutate()}
            disabled={saveOrder.isPending}
            className="px-3 py-1 text-xs rounded bg-amber-700/60 hover:bg-amber-600/70 text-amber-200 border border-amber-600/40 disabled:opacity-50 transition-colors"
          >
            {saveOrder.isPending ? 'Saving…' : '↕ Save order'}
          </button>
        </div>
      )}

      {displayImages.map((img, idx) => (
        <div key={img.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-800/30 transition-colors">
          <button
            type="button"
            onClick={() => setLightboxUrl(img.url)}
            className="flex-shrink-0 w-[54px] h-[80px] rounded overflow-hidden bg-stone-800 ring-1 ring-stone-700 hover:ring-amber-500/60 transition-all"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cloudinaryUrl(img.url, 'w_80,h_120,c_fill,q_auto,f_auto') ?? img.url}
              alt="thumbnail"
              className="w-full h-full object-cover"
            />
          </button>

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

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {img.status !== 'APPROVED' && (
              <button
                onClick={() => updateStatus.mutate({ id: img.id, status: 'APPROVED' })}
                disabled={updateStatus.isPending}
                className="px-2 py-1 text-[11px] rounded bg-green-800/50 text-green-400 hover:bg-green-700/60 disabled:opacity-50 transition-colors border border-green-700/40"
              >✓</button>
            )}
            {img.status !== 'REMOVED' && (
              <button
                onClick={() => updateStatus.mutate({ id: img.id, status: 'REMOVED' })}
                disabled={updateStatus.isPending}
                className="px-2 py-1 text-[11px] rounded bg-stone-800/50 text-stone-400 hover:bg-stone-700/60 disabled:opacity-50 transition-colors border border-stone-700/40"
              >Hide</button>
            )}
            <button
              onClick={() => { if (confirm('Delete permanently from Cloudinary too?')) deleteImage.mutate(img.id) }}
              disabled={deleteImage.isPending}
              className="px-2 py-1 text-[11px] rounded bg-red-900/30 text-red-400 hover:bg-red-800/40 disabled:opacity-50 transition-colors border border-red-700/30"
            >Del</button>
          </div>

          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => moveImage(idx, -1)}
              disabled={idx === 0}
              className="w-6 h-6 flex items-center justify-center rounded text-[13px] text-stone-500 hover:text-stone-200 hover:bg-stone-700 disabled:opacity-20 transition-colors"
            >↑</button>
            <button
              type="button"
              onClick={() => moveImage(idx, 1)}
              disabled={idx === displayImages.length - 1}
              className="w-6 h-6 flex items-center justify-center rounded text-[13px] text-stone-500 hover:text-stone-200 hover:bg-stone-700 disabled:opacity-20 transition-colors"
            >↓</button>
          </div>
        </div>
      ))}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-stone-800/90 text-stone-200 hover:bg-stone-700 flex items-center justify-center text-lg z-10 border border-stone-600"
          >✕</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cloudinaryUrl(lightboxUrl, 'w_1200,h_1800,c_fill,q_auto,f_auto') ?? lightboxUrl}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

// ─── Collapsible wrapper ──────────────────────────────────────────────────────

function CollapsibleEditionGroup({
  summary,
  statusFilter,
}: {
  summary: EditionSummary
  statusFilter: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-stone-700/60 bg-stone-900/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-stone-800/50 border-b border-stone-700/40 hover:bg-stone-800/80 transition-colors text-left"
      >
        <span className="text-[11px] text-stone-500 transition-transform duration-200" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <a
          href={`/editions/${summary.slug}`}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors truncate"
        >
          {summary.name}
        </a>
        <span className="text-stone-600 text-xs shrink-0 ml-auto">
          {summary.count} image{summary.count !== 1 ? 's' : ''}
        </span>
      </button>

      {open && <EditionPanel summary={summary} statusFilter={statusFilter} />}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCommunityImagesPage() {
  const [statusFilter, setStatusFilter] = useState('PENDING')

  const { data: editions = [], isLoading } = useQuery({
    queryKey: ['admin', 'community-images-editions', statusFilter],
    queryFn: () => {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      return authFetch<EditionSummary[]>(`/admin/community-images/editions${params}`)
    },
  })

  return (
    <div className="space-y-6">
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
      {!isLoading && editions.length === 0 && (
        <p className="text-stone-500 text-sm">No images found.</p>
      )}

      <div className="space-y-3">
        {editions.map(summary => (
          <CollapsibleEditionGroup key={summary.editionId} summary={summary} statusFilter={statusFilter} />
        ))}
      </div>
    </div>
  )
}
