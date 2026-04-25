'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'
import { PersonPicker, type PersonEntry } from '@/components/admin/pickers/PersonPicker'

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

async function uploadImage(file: File): Promise<string> {
  const token = localStorage.getItem('luxgrimoire_token')
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/upload`,
    { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd }
  )
  if (!res.ok) throw new Error('Upload failed')
  const data = await res.json() as { publicId: string }
  return data.publicId
}

export function AddEditionForm({ bookId, bookSlug: _bookSlug }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const coverRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [artists, setArtists] = useState<PersonEntry[]>([])
  const [form, setForm] = useState<FormState>({
    publisher: '',
    language: 'EN', generalSaleDate: '', price: '', currency: 'EUR', notes: '',
  })

  if (!user) return null

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const reset = () => {
    setForm({ publisher: '', language: 'EN', generalSaleDate: '', price: '', currency: 'EUR', notes: '' })
    setCoverFile(null)
    setCoverPreview(null)
    setArtists([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      let coverImage: string | undefined
      if (coverFile) coverImage = await uploadImage(coverFile)

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
          coverImage,
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
            <input value={form.publisher} onChange={set('publisher')} placeholder="Publisher" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Language</label>
            <input value={form.language} onChange={set('language')} placeholder="EN" className={inputCls} />
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
