'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

function cloudThumb(url: string) {
  if (!url) return url
  const size = 'w_160,h_240,c_fill,q_auto,f_auto'
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

const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REMOVED']
const STATUS_STYLES: Record<string, string> = {
  PENDING: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  APPROVED: 'text-green-400 bg-green-500/10 border-green-500/30',
  REMOVED: 'text-stone-500 bg-stone-700/30 border-stone-600/30',
}

export default function AdminCommunityImagesPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('PENDING')

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['admin', 'community-images', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      return authFetch<CommunityImage[]>(`/admin/community-images?${params}`)
    },
  })

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-serif font-semibold text-stone-100">Community Images</h1>
        <div className="flex gap-2">
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

      {!isLoading && images.length === 0 && (
        <p className="text-stone-500 text-sm">No images found.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {images.map(img => (
          <div key={img.id} className="rounded-xl border border-stone-700 bg-stone-900/60 overflow-hidden">
            {/* Image */}
            <div className="aspect-[2/3] bg-stone-800 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cloudThumb(img.url)}
                alt="Community photo"
                className="w-full h-full object-cover"
              />
              <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[img.status] ?? ''}`}>
                {img.status}
              </div>
            </div>

            {/* Info */}
            <div className="p-3 space-y-2">
              <div>
                <a
                  href={`/editions/${img.edition.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {img.edition.editionName ?? img.edition.slug}
                </a>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  by <span className="text-stone-400">{img.user.username}</span>
                  {img.instagramHandle && (
                    <> · <a href={`https://instagram.com/${img.instagramHandle}`} target="_blank" rel="noreferrer" className="text-stone-400 hover:text-amber-400">@{img.instagramHandle}</a></>
                  )}
                </p>
                <p className="text-[10px] text-stone-600 mt-0.5">
                  Consent: {img.consentGiven ? '✓' : '✗'} · {new Date(img.consentedAt).toLocaleDateString()}
                </p>
                <p className="text-[10px] text-stone-600">
                  Submitted: {new Date(img.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {img.status !== 'APPROVED' && (
                  <button
                    onClick={() => updateStatus.mutate({ id: img.id, status: 'APPROVED' })}
                    disabled={updateStatus.isPending}
                    className="px-2.5 py-1 text-[11px] rounded bg-green-800/50 text-green-400 hover:bg-green-700/60 disabled:opacity-50 transition-colors border border-green-700/40"
                  >
                    ✓ Approve
                  </button>
                )}
                {img.status !== 'REMOVED' && (
                  <button
                    onClick={() => updateStatus.mutate({ id: img.id, status: 'REMOVED' })}
                    disabled={updateStatus.isPending}
                    className="px-2.5 py-1 text-[11px] rounded bg-stone-800/50 text-stone-400 hover:bg-stone-700/60 disabled:opacity-50 transition-colors border border-stone-700/40"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Delete permanently from Cloudinary too?')) {
                      deleteImage.mutate(img.id)
                    }
                  }}
                  disabled={deleteImage.isPending}
                  className="px-2.5 py-1 text-[11px] rounded bg-red-900/30 text-red-400 hover:bg-red-800/40 disabled:opacity-50 transition-colors border border-red-700/30"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
