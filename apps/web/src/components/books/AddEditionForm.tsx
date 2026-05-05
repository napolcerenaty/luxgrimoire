'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'
import { PersonPicker, type PersonEntry } from '@/components/admin/pickers/PersonPicker'
import { PublisherPicker } from '@/components/admin/pickers/PublisherPicker'

interface Props {
  bookId: string
  bookSlug: string
}

interface FormState {
  publisher: string
  language: string
  generalSaleDate: string
  price: string
  currency: string
  notes: string
}

interface PendingImage {
  cloudinaryId: string
  url: string
  previewUrl: string
  sortOrder: number
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const MAX_IMAGES = 5
const MAX_BYTES = 5 * 1024 * 1024

async function uploadImage(file: File): Promise<{ cloudinaryId: string; url: string; previewId: string }> {
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const res = await fetch(
    `${API_BASE}/upload/image`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUri, folder: 'luxgrimoire/community' }),
    }
  )
  if (!res.ok) throw new Error('Upload failed')
  const data = await res.json() as { publicId: string; url: string }
  return { cloudinaryId: data.publicId, url: data.url, previewId: URL.createObjectURL(file) }
}

const BOOK_LANGUAGES = [
  'English', 'Polish', 'French', 'German', 'Spanish',
  'Italian', 'Portuguese', 'Dutch', 'Czech', 'Hungarian',
  'Romanian', 'Ukrainian', 'Japanese', 'Korean', 'Chinese',
]

export function AddEditionForm({ bookId, bookSlug: _bookSlug }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const coverRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [artists, setArtists] = useState<PersonEntry[]>([])
  const [form, setForm] = useState<FormState>({
    publisher: '',
    language: 'English', generalSaleDate: '', price: '', currency: 'EUR', notes: '',
  })

  // Community images state
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [instagramHandle, setInstagramHandle] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)
  const [imgUploading, setImgUploading] = useState(false)
  const [imgProgress, setImgProgress] = useState('')
  const [imgDragIndex, setImgDragIndex] = useState<number | null>(null)
  const [imgDragOver, setImgDragOver] = useState<number | null>(null)

  if (!user) return null

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const reset = () => {
    setForm({ publisher: '', language: 'English', generalSaleDate: '', price: '', currency: 'EUR', notes: '' })
    setCoverFile(null)
    setCoverPreview(null)
    setArtists([])
    setPendingImages([])
    setInstagramHandle('')
    setConsentGiven(false)
  }

  const handleImageFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const oversized = files.filter(f => f.size > MAX_BYTES)
    if (oversized.length > 0) { alert(`File(s) exceed 5 MB: ${oversized.map(f => f.name).join(', ')}`); return }
    const allowed = files.slice(0, MAX_IMAGES - pendingImages.length)
    setImgUploading(true)
    for (let i = 0; i < allowed.length; i++) {
      setImgProgress(`Uploading ${i + 1}/${allowed.length}…`)
      try {
        const { cloudinaryId, url, previewId } = await uploadImage(allowed[i])
        setPendingImages(prev => [...prev, { cloudinaryId, url, previewUrl: previewId, sortOrder: prev.length }])
      } catch (err) { alert(err instanceof Error ? err.message : 'Upload failed') }
    }
    setImgProgress('')
    setImgUploading(false)
    if (imgInputRef.current) imgInputRef.current.value = ''
  }

  const handleImgDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (imgDragIndex === null || imgDragIndex === targetIndex) { setImgDragIndex(null); setImgDragOver(null); return }
    const reordered = [...pendingImages]
    const [moved] = reordered.splice(imgDragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    setPendingImages(reordered.map((img, i) => ({ ...img, sortOrder: i })))
    setImgDragIndex(null); setImgDragOver(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (pendingImages.length > 0 && !consentGiven) {
      alert('Please confirm authorship of the photos before submitting.')
      return
    }

    setBusy(true)
    try {
      let uploadedCover: string | undefined
      if (coverFile) {
        const { cloudinaryId } = await uploadImage(coverFile)
        uploadedCover = cloudinaryId
      }

      const edition = await authFetch<{ id: string; slug: string }>('/editions', {
        method: 'POST',
        body: JSON.stringify({
          bookId,
          publisher: form.publisher || undefined,
          language: form.language || undefined,
          generalSaleDate: form.generalSaleDate || undefined,
          basePrice: form.price || undefined,
          currency: form.currency || undefined,
          notes: form.notes || undefined,
          additionalImages: uploadedCover ? [uploadedCover] : undefined,
        }),
      })

      // Add artists (deduplicated by name)
      const seenNames = new Set<string>()
      for (const art of artists) {
        const name = art.name.trim()
        if (!name || seenNames.has(name.toLowerCase())) continue
        seenNames.add(name.toLowerCase())
        let artistId = art.id
        if (!artistId) {
          const created = await authFetch<{ id: string }>('/artists', {
            method: 'POST', body: JSON.stringify({ name }),
          })
          artistId = created.id
        }
        await authFetch(`/editions/${edition.slug}/artists`, {
          method: 'POST', body: JSON.stringify({ artistId, role: 'cover art' }),
        })
      }

      // Submit community images (if any with consent)
      if (pendingImages.length > 0 && consentGiven) {
        await fetch(`${API_BASE}/editions/${edition.slug}/community-images`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: pendingImages.map(({ cloudinaryId, url, sortOrder }) => ({ cloudinaryId, url, sortOrder })),
            instagramHandle: instagramHandle.replace(/^@/, '') || undefined,
            consentGiven: true,
          }),
        })
      }

      setOpen(false)
      reset()
      router.refresh()
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const inputCls = "w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-600"
  const labelCls = "block text-xs text-stone-400 mb-0.5"

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-6 px-4 py-2 text-sm rounded-lg border border-amber-700/60 text-amber-400 hover:bg-amber-900/20 transition-colors"
      >
        + Add Edition
      </button>
    )
  }

  return (
    <div className="mt-6 rounded-xl border border-stone-700 bg-stone-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif font-semibold text-stone-100">Add Edition</h3>
        <button type="button" onClick={() => { setOpen(false); reset() }} className="text-stone-500 hover:text-stone-300 text-lg">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Publisher</label>
            <PublisherPicker value={form.publisher} onChange={v => setForm(prev => ({ ...prev, publisher: v }))} />
          </div>
          <div>
            <label className={labelCls}>Language</label>
            <select value={form.language} onChange={set('language')} className={inputCls}>
              <option value="">— select —</option>
              {BOOK_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>General sale date</label>
            <input type="date" value={form.generalSaleDate} onChange={set('generalSaleDate')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Price</label>
            <input type="number" step="0.01" value={form.price} onChange={set('price')} placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select value={form.currency} onChange={set('currency')} className={inputCls}>
              {['EUR','USD','GBP','PLN','CAD','AUD'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Cover */}
        <div>
          <label className={labelCls}>Cover image</label>
          <input ref={coverRef} type="file" accept="image/*" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (!f) return
              setCoverFile(f)
              setCoverPreview(URL.createObjectURL(f))
            }}
          />
          <div className="flex items-center gap-3">
            {coverPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="cover preview" className="w-16 h-24 object-cover rounded border border-stone-700" />
            )}
            <button type="button" onClick={() => coverRef.current?.click()}
              className="px-3 py-1.5 text-xs border border-stone-600 rounded text-stone-300 hover:border-amber-600 transition-colors">
              {coverFile ? 'Change cover' : 'Choose cover'}
            </button>
          </div>
        </div>

        {/* Artists */}
        <div>
          <label className={labelCls}>Artists</label>
          <div className="space-y-1.5">
            {artists.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {artists.map((art, i) => (
                  <span key={i} className="flex items-center gap-1 bg-stone-700 text-stone-200 text-xs px-2 py-1 rounded">
                    {art.name}
                    <button type="button" onClick={() => setArtists(prev => prev.filter((_, j) => j !== i))}
                      className="text-stone-400 hover:text-red-400 ml-0.5">✕</button>
                  </span>
                ))}
              </div>
            )}
            <PersonPicker
              endpoint="artists"
              placeholder="Search or add artist…"
              onAdd={(p: PersonEntry) => {
                if (!artists.find(a => a.name === p.name)) {
                  setArtists(prev => [...prev, p])
                }
              }}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Any extra info…" className={inputCls + ' resize-none'} />
        </div>

        {/* Community photos */}
        <div className="pt-1 border-t border-stone-700/50">
          <label className={labelCls}>Additional photos <span className="text-stone-600">(optional, up to {MAX_IMAGES})</span></label>
          <div className="flex items-center gap-2 mb-2 mt-1">
            <button
              type="button"
              disabled={imgUploading || pendingImages.length >= MAX_IMAGES}
              onClick={() => imgInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 disabled:opacity-50 transition-colors"
            >
              {imgUploading ? imgProgress : '+ Add photos'}
            </button>
            <span className="text-stone-600 text-xs">
              {pendingImages.length > 0 ? `${pendingImages.length}/${MAX_IMAGES} · drag to reorder` : `up to ${MAX_IMAGES} · first = main`}
            </span>
          </div>
          <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageFiles} />

          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {pendingImages.map((img, i) => {
                const isMain = i === 0
                const isDragging = imgDragIndex === i
                const isOver = imgDragOver === i && imgDragIndex !== i
                return (
                  <div
                    key={img.cloudinaryId}
                    draggable
                    onDragStart={() => setImgDragIndex(i)}
                    onDragOver={(e) => { e.preventDefault(); setImgDragOver(i) }}
                    onDrop={(e) => handleImgDrop(e, i)}
                    onDragEnd={() => { setImgDragIndex(null); setImgDragOver(null) }}
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
                      onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i).map((x, idx) => ({ ...x, sortOrder: idx })))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {pendingImages.length > 0 && (
            <>
              <div className="mb-2">
                <label className="block text-xs text-stone-500 mb-1">
                  Instagram handle <span className="text-stone-600">(optional)</span>
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-stone-500 text-sm">@</span>
                  <input
                    type="text"
                    value={instagramHandle.replace(/^@/, '')}
                    onChange={e => setInstagramHandle(e.target.value.replace(/^@/, ''))}
                    placeholder="yourhandle"
                    className="w-48 bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-600"
                  />
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={e => setConsentGiven(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-amber-500 flex-shrink-0"
                />
                <span className="text-xs text-stone-400 leading-relaxed">
                  I confirm I am the author of these photos and consent to their use on LuxGrimoire.
                  I understand photos may be removed without notice.
                </span>
              </label>
            </>
          )}
        </div>

        <p className="text-xs text-stone-500 italic">
          Editions submitted by users are visible immediately and reviewed by our team.
        </p>

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={() => { setOpen(false); reset() }} className="px-4 py-2 text-sm text-stone-400 hover:text-stone-200">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="px-5 py-2 text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-stone-100 rounded-lg transition-colors">
            {busy ? 'Saving…' : 'Submit Edition'}
          </button>
        </div>
      </form>
    </div>
  )
}
