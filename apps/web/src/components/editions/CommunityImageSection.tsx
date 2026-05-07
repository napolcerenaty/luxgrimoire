'use client'

import { useState, useRef } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''
const MAX_IMAGES = 5
const MAX_BYTES = 5 * 1024 * 1024

interface CommunityImage {
  id: string
  url: string
  sortOrder: number
  instagramHandle: string | null
  status: 'PENDING' | 'APPROVED'
  user: { username: string }
}

interface PendingImage {
  cloudinaryId: string
  url: string
  previewUrl: string
  sortOrder: number
}

interface Props {
  editionSlug: string
  initialImages: CommunityImage[]
  isAuthenticated: boolean
  /** When true, renders a compact strip below an existing carousel instead of the full placeholder */
  compact?: boolean
}

function cloudThumb(url: string, size = 'w_120,h_160,c_fill,q_auto,f_auto') {
  if (!url) return url
  if (url.startsWith('http') && url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/${size}/`)
  }
  if (CLOUD_NAME && !url.startsWith('http')) {
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${size}/${url}`
  }
  return url
}

async function uploadToCloudinary(file: File): Promise<{ cloudinaryId: string; url: string }> {
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const res = await fetch(`${API_BASE}/upload/image`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: dataUri, folder: 'luxgrimoire/community' }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upload failed: ${text}`)
  }
  const data = await res.json() as { publicId: string; url: string }
  return { cloudinaryId: data.publicId, url: data.url }
}

export function CommunityImageSection({ editionSlug, initialImages, isAuthenticated, compact = false }: Props) {
  const [images, setImages] = useState<CommunityImage[]>(initialImages)
  const [showUpload, setShowUpload] = useState(false)
  const [pending, setPending] = useState<PendingImage[]>([])
  const [instagramHandle, setInstagramHandle] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const canAddMore = pending.length < MAX_IMAGES

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setError(null)

    const oversized = files.filter(f => f.size > MAX_BYTES)
    if (oversized.length > 0) {
      setError(`File(s) exceed 5 MB limit: ${oversized.map(f => f.name).join(', ')}`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    const allowed = files.slice(0, MAX_IMAGES - pending.length)
    setUploading(true)
    for (let i = 0; i < allowed.length; i++) {
      setUploadProgress(`Uploading ${i + 1} / ${allowed.length}…`)
      try {
        const { cloudinaryId, url } = await uploadToCloudinary(allowed[i])
        const previewUrl = URL.createObjectURL(allowed[i])
        setPending(prev => [...prev, { cloudinaryId, url, previewUrl, sortOrder: prev.length }])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    }
    setUploadProgress('')
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null); setDragOver(null); return
    }
    const reordered = [...pending]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    setPending(reordered.map((img, i) => ({ ...img, sortOrder: i })))
    setDragIndex(null); setDragOver(null)
  }

  const removePending = (i: number) => {
    URL.revokeObjectURL(pending[i].previewUrl)
    setPending(prev => prev.filter((_, j) => j !== i).map((img, idx) => ({ ...img, sortOrder: idx })))
  }

  const handleSubmit = async () => {
    if (!consentGiven) { setError('You must confirm authorship before submitting.'); return }
    if (pending.length === 0) { setError('Please add at least one photo.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/editions/${editionSlug}/community-images`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: pending.map(({ cloudinaryId, url, sortOrder }) => ({ cloudinaryId, url, sortOrder })),
          instagramHandle: instagramHandle.replace(/^@/, '') || undefined,
          consentGiven: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(data.message ?? 'Submission failed')
      }
      const created = await res.json() as CommunityImage[]
      setImages(prev => [...prev, ...created])
      setSuccess(true)
      setShowUpload(false)
      setPending([])
      setInstagramHandle('')
      setConsentGiven(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    pending.forEach(img => URL.revokeObjectURL(img.previewUrl))
    setPending([])
    setInstagramHandle('')
    setConsentGiven(false)
    setError(null)
    setShowUpload(false)
  }

  return (
    <div className="w-full">
      {/* ── Compact mode header (shown below an official carousel) ── */}
      {compact && (
        <div className="mt-3 border-t border-stone-800 pt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-2">
            📷 Community photos
          </p>
        </div>
      )}

      {/* Existing community images */}
      {images.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.id} className="relative">
                <div className={`${compact ? 'w-14 h-20' : 'w-full aspect-[2/3]'} rounded-xl overflow-hidden bg-stone-800 ring-1 ring-stone-700/50`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cloudThumb(img.url, 'w_400,h_600,c_fill,q_auto,f_auto')}
                    alt="Community photo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="mt-1.5 flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/80 bg-stone-900/70 px-1.5 py-0.5 rounded w-fit">
                    {img.status === 'PENDING' ? '⏳ Awaiting review' : '📷 Community photo'}
                  </span>
                  {img.instagramHandle && (
                    <a
                      href={`https://instagram.com/${img.instagramHandle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-stone-400 hover:text-amber-400 transition-colors"
                    >
                      @{img.instagramHandle}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder when no images at all — full version only */}
      {!compact && images.length === 0 && !showUpload && (
        <button
          type="button"
          onClick={isAuthenticated ? () => { setShowUpload(true); setSuccess(false) } : undefined}
          disabled={!isAuthenticated}
          className="w-full aspect-[2/3] rounded-xl bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 flex flex-col items-center justify-center text-stone-500 ring-1 ring-stone-700/50 hover:ring-amber-700/50 hover:text-stone-400 transition-all group disabled:cursor-default"
        >
          <svg className="w-10 h-10 mb-3 group-hover:text-stone-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {isAuthenticated ? (
            <span className="text-sm font-medium">Upload image</span>
          ) : (
            <span className="text-xs text-stone-600">No image available</span>
          )}
        </button>
      )}

      {/* Upload button — always visible in compact mode, or when images exist in full mode */}
      {!showUpload && isAuthenticated && (images.length > 0 || compact) && images.length < MAX_IMAGES && (
        <button
          type="button"
          onClick={() => { setShowUpload(true); setSuccess(false) }}
          className="mt-2 w-full text-xs text-center text-stone-500 hover:text-amber-400 transition-colors py-1"
        >
          + {images.length === 0 ? 'Share your photo of this edition' : 'Add your photo'}
        </button>
      )}

      {/* Success message */}
      {success && (
        <p className="mt-2 text-xs text-amber-400 text-center">
          ✓ Photos submitted! They will appear after review.
        </p>
      )}

      {/* Upload form */}
      {showUpload && (
        <div className="mt-3 rounded-xl border border-stone-700 bg-stone-900/70 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-stone-200">Add community photos</h4>
            <button type="button" onClick={handleCancel} className="text-stone-500 hover:text-stone-300 text-base">✕</button>
          </div>

          {/* Upload area */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                disabled={uploading || !canAddMore}
                onClick={() => inputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 disabled:opacity-50 transition-colors"
              >
                {uploading ? uploadProgress : '+ Add photos'}
              </button>
              <span className="text-stone-600 text-xs">
                {pending.length === 0
                  ? `up to ${MAX_IMAGES} photos · first = main`
                  : `${pending.length}/${MAX_IMAGES} · drag to reorder`}
              </span>
            </div>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pending.map((img, i) => {
                  const isMain = i === 0
                  const isDragging = dragIndex === i
                  const isOver = dragOver === i && dragIndex !== i
                  return (
                    <div
                      key={img.cloudinaryId}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(i) }}
                      onDrop={(e) => handleDrop(e, i)}
                      onDragEnd={() => { setDragIndex(null); setDragOver(null) }}
                      className={`relative group cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
                    >
                      <div className={`w-16 h-20 rounded-lg overflow-hidden bg-stone-800 border transition-all ${
                        isOver ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105'
                          : isMain ? 'border-amber-500 ring-1 ring-amber-500/40'
                          : 'border-stone-700'
                      }`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.previewUrl} alt="" className="w-full h-full object-cover pointer-events-none" />
                      </div>
                      {isMain && (
                        <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] font-semibold uppercase text-amber-400 bg-stone-950/70 px-0.5 py-px leading-tight">
                          main
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePending(i)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Instagram handle */}
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Instagram handle <span className="text-stone-600">(optional — tag yourself as the photographer)</span>
            </label>
            <div className="flex items-center gap-1">
              <span className="text-stone-500 text-sm">@</span>
              <input
                type="text"
                value={instagramHandle.replace(/^@/, '')}
                onChange={e => setInstagramHandle(e.target.value.replace(/^@/, ''))}
                placeholder="yourhandle"
                className="flex-1 bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-600"
              />
            </div>
          </div>

          {/* Consent */}
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <div className="mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={e => setConsentGiven(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500"
              />
            </div>
            <span className="text-xs text-stone-400 group-hover:text-stone-300 transition-colors leading-relaxed">
              I confirm I am the author of these photos and I consent to their use on LuxGrimoire.
              I understand that photos may be removed from the system without notice.
            </span>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={handleCancel} className="px-3 py-1.5 text-xs text-stone-400 hover:text-stone-200">
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || uploading || !consentGiven || pending.length === 0}
              onClick={handleSubmit}
              className="px-4 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-stone-100 rounded-lg transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit photos'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
