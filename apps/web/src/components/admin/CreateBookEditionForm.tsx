'use client'

import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { PersonPicker, type PersonEntry } from './pickers/PersonPicker'
import { SeriesPicker } from './pickers/SeriesPicker'
import { GenreTagsPicker } from './pickers/GenreTagsPicker'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

function cloudThumb(id: string) {
  if (!id) return null
  if (id.startsWith('http')) return id
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_120,h_160,c_fill,q_auto,f_auto/${id}`
}

async function uploadImage(file: File, folder: string): Promise<string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const res = await fetch(`${API_BASE}/upload/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: dataUri, folder }),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json() as { publicId: string }
  return json.publicId
}

// ─── Multi-image upload grid ──────────────────────────────────────────────────
function MultiImageUpload({ images, folder, onChange }: {
  images: string[]
  folder: string
  onChange: (v: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    const results: string[] = [...images]
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} / ${files.length}…`)
      try {
        const id = await uploadImage(files[i], folder)
        results.push(id)
        onChange([...results])
      } catch { /* skip failed */ }
    }
    setProgress('')
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button type="button" disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 disabled:opacity-50 transition-colors">
          {uploading ? progress : images.length === 0 ? '+ Upload images' : '+ Add more images'}
        </button>
        <span className="text-stone-600 text-xs">
          {images.length === 0 ? 'first image will be the main cover' : 'select multiple files at once'}
        </span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {images.map((img, i) => {
            const thumb = cloudThumb(img)
            const isMain = i === 0
            return (
              <div key={i} className="relative group">
                <div className={`w-16 h-20 rounded-lg overflow-hidden bg-stone-800 border ${isMain ? 'border-amber-500 ring-1 ring-amber-500/40' : 'border-stone-700'}`}>
                  {thumb
                    ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                    : <span className="text-stone-600 text-[9px] flex items-center justify-center h-full">img</span>
                  }
                </div>
                {isMain && (
                  <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] font-semibold uppercase text-amber-400 bg-stone-950/70 px-0.5 py-px leading-tight">
                    main
                  </span>
                )}
                <button type="button"
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  ✕
                </button>
                {!isMain && (
                  <button type="button"
                    onClick={() => {
                      const reordered = [...images]
                      reordered.splice(i, 1)
                      reordered.unshift(img)
                      onChange(reordered)
                    }}
                    title="Set as main cover"
                    className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-stone-500 hover:text-amber-400 bg-stone-950/70 px-0.5 py-px leading-tight opacity-0 group-hover:opacity-100 transition-opacity">
                    set main
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-xs text-stone-400 mb-1'
const BTN_PRIMARY = 'px-4 py-2 rounded-lg text-sm font-semibold bg-amber-400 text-stone-950 hover:bg-amber-300 disabled:opacity-50 transition-colors'
const BTN_GHOST = 'px-4 py-2 rounded-lg text-sm font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors'
const BTN_SM = 'px-2.5 py-1 rounded-md text-xs font-medium transition-colors'

// ─── Types ────────────────────────────────────────────────────────────────────
type ArtistEntry = { id?: string; name: string; role: string }
type Company = { id: string; name: string; slug: string }

interface AiParseResult {
  book?: {
    title?: string
    description?: string
    authors?: { name: string }[]
    seriesName?: string; volumeNumber?: number
    genres?: string[]
  }
  edition?: {
    publisher?: string
    price?: number; currency?: string
    firstAccessDate?: string; earlyAccessDate?: string; generalSaleDate?: string
    features?: string[]
    artists?: { name: string; role: string }[]
  }
}

// ─── FeatureTags ──────────────────────────────────────────────────────────────
function FeatureTags({ features, onChange }: { features: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !features.includes(v)) onChange([...features, v])
    setInput('')
  }
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5 text-stone-100 text-sm focus:outline-none focus:border-amber-400"
          value={input} placeholder="Add feature…"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" onClick={add}
          className="px-3 py-1.5 rounded-lg text-sm bg-stone-700 text-stone-200 hover:bg-stone-600">Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {features.map((f, i) => (
          <span key={i} className="flex items-center gap-1.5 bg-stone-700 text-stone-200 text-xs px-2.5 py-1 rounded-full">
            {f}
            <button type="button" onClick={() => onChange(features.filter((_, j) => j !== i))}
              className="text-stone-500 hover:text-red-400">×</button>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── AI Parse section ─────────────────────────────────────────────────────────
function AiParseSection({ onResult, disabled }: {
  onResult: (r: AiParseResult) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'text' | 'url'>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)

  const parse = async () => {
    setParsing(true)
    try {
      const payload = tab === 'text' ? { text } : { imageUrl: url }
      const result = await authFetch<AiParseResult>('/ai/parse', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      onResult(result)
      setOpen(false)
      setText(''); setUrl('')
    } catch (e: unknown) {
      alert(`AI parse failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setParsing(false)
    }
  }

  const canParse = tab === 'text' ? text.trim().length > 10 : url.trim().startsWith('http')

  return (
    <div className="border border-amber-500/30 rounded-xl overflow-hidden bg-stone-900/60">
      <button type="button" onClick={() => setOpen(!open)} disabled={disabled}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-stone-800/60 transition-colors disabled:opacity-40">
        <span className="flex items-center gap-2 text-amber-400 font-medium">
          <span>✨</span> Parse with AI
        </span>
        <span className="text-stone-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-stone-700/60 p-4 space-y-3">
          {/* Tabs */}
          <div className="flex gap-1 bg-stone-800 rounded-lg p-0.5">
            {(['text', 'url'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === t ? 'bg-stone-700 text-stone-100' : 'text-stone-500 hover:text-stone-300'}`}>
                {t === 'text' ? 'Paste Text' : 'Image URL'}
              </button>
            ))}
          </div>

          {tab === 'text' ? (
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
              placeholder="Paste social media post, newsletter, or announcement text…"
              className={`${INP} resize-none`} />
          ) : (
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://… (public image URL, e.g. Cloudinary or Instagram)"
              className={INP} />
          )}

          <button type="button" disabled={!canParse || parsing} onClick={parse}
            className={`${BTN_SM} bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-40 px-4 py-2 text-sm`}>
            {parsing ? '✨ Parsing…' : '✨ Auto-fill fields'}
          </button>
          <p className="text-stone-500 text-xs">Fields will be pre-filled — review and adjust before saving.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export interface CreateBookEditionFormProps {
  subscriptionSlug: string
  subscriptionId?: string | null
  defaultCurrency?: string | null
  defaultCompanyId?: string | null
  defaultPrice?: number | null
  renewalDay?: number | null
  monthYear: number
  monthMonth: number
  /** If provided, skip step 1 and start at edition creation for an existing book */
  existingBookId?: string
  onSuccess: () => void
  onCancel: () => void
}

export default function CreateBookEditionForm({
  subscriptionSlug, subscriptionId, defaultCurrency, defaultCompanyId,
  defaultPrice, renewalDay,
  monthYear, monthMonth, existingBookId, onSuccess, onCancel,
}: CreateBookEditionFormProps) {
  const qc = useQueryClient()
  const startStep = existingBookId ? 2 : 1
  const [step, setStep] = useState<1 | 2>(startStep)
  const [busy, setBusy] = useState(false)

  // ── Step 1: Book ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [authors, setAuthors] = useState<PersonEntry[]>([])
  const [seriesName, setSeriesName] = useState('')
  const [volumeNumber, setVolumeNumber] = useState('')
  const [genres, setGenres] = useState<string[]>([])
  const [createdBookId, setCreatedBookId] = useState(existingBookId ?? '')
  const [createdBookSlug, setCreatedBookSlug] = useState('')
  const [saved, setSaved] = useState(false)

  // ── Step 2: Edition ──────────────────────────────────────────────────────
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? '')
  const [price, setPrice] = useState(defaultPrice != null ? String(defaultPrice) : '')
  const [currency, setCurrency] = useState(defaultCurrency ?? 'USD')
  const [firstAccessDate, setFirstAccessDate] = useState('')
  const [earlyAccessDate, setEarlyAccessDate] = useState('')
  const [generalSaleDate, setGeneralSaleDate] = useState(() => {
    if (renewalDay == null) return ''
    const mm = String(monthMonth).padStart(2, '0')
    const dd = String(renewalDay).padStart(2, '0')
    return `${monthYear}-${mm}-${dd}`
  })
  const [allImages, setAllImages] = useState<string[]>([])
  const [artists, setArtists] = useState<ArtistEntry[]>([])
  const [features, setFeatures] = useState<string[]>([])
  const [language, setLanguage] = useState('')

  // ── Companies ────────────────────────────────────────────────────────────
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => authFetch<{ data: Company[] }>('/companies?pageSize=100'),
  })
  const companies = companiesData?.data ?? []

  // ── AI result handler ────────────────────────────────────────────────────
  const applyAiResult = (r: AiParseResult) => {
    if (r.book?.title && !title) setTitle(r.book.title)
    if (r.book?.description && !description) setDescription(r.book.description)
    if (r.book?.seriesName) setSeriesName(r.book.seriesName)
    if (r.book?.volumeNumber != null) setVolumeNumber(String(r.book.volumeNumber))
    if (r.book?.genres?.length) {
      setGenres(prev => Array.from(new Set([...prev, ...r.book!.genres!])))
    }
    if (r.book?.authors?.length) {
      setAuthors(prev => {
        const existing = new Set(prev.map(a => a.name.toLowerCase()))
        const toAdd = r.book!.authors!.filter(a => !existing.has(a.name.toLowerCase()))
        return [...prev, ...toAdd.map(a => ({ name: a.name }))]
      })
    }
    // Edition fields
    if (r.edition?.price != null) setPrice(String(r.edition.price))
    if (r.edition?.currency) setCurrency(r.edition.currency)
    if (r.edition?.firstAccessDate) setFirstAccessDate(r.edition.firstAccessDate)
    if (r.edition?.earlyAccessDate) setEarlyAccessDate(r.edition.earlyAccessDate)
    if (r.edition?.generalSaleDate) setGeneralSaleDate(r.edition.generalSaleDate)
    if (r.edition?.features?.length) {
      setFeatures(prev => Array.from(new Set([...prev, ...r.edition!.features!])))
    }
    if (r.edition?.artists?.length) {
      setArtists(prev => {
        const normalize = (s: string) => s.toLowerCase().replace(/^@/, '')
        const existing = new Set(prev.map(a => normalize(a.name)))
        const toAdd = r.edition!.artists!.filter(a => !existing.has(normalize(a.name)))
        return [...prev, ...toAdd.map(a => ({ name: a.name, role: a.role }))]
      })
    }
  }

  // ── Step 1 submit ────────────────────────────────────────────────────────
  const handleStep1 = async () => {
    if (!title.trim()) return alert('Book title is required')
    setBusy(true)
    try {
      const book = await authFetch<{ id: string; slug: string }>('/books', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          seriesName: seriesName.trim() || undefined,
          volumeNumber: volumeNumber ? Number(volumeNumber) : undefined,
          genres: genres.length ? genres : undefined,
        }),
      })
      for (const auth of authors) {
        let authorId = auth.id
        if (!authorId) {
          const created = await authFetch<{ id: string }>('/authors', {
            method: 'POST', body: JSON.stringify({ name: auth.name }),
          })
          authorId = created.id
        }
        await authFetch(`/books/${book.slug}/authors/${authorId}`, { method: 'POST' })
      }
      setCreatedBookId(book.id)
      setCreatedBookSlug(book.slug)
      setStep(2)
    } catch (e: unknown) {
      alert(`Error creating book: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // ── Step 2 submit ────────────────────────────────────────────────────────
  const handleStep2 = async () => {
    setBusy(true)
    try {
      const ed = await authFetch<{ id: string; slug: string }>('/editions', {
        method: 'POST',
        body: JSON.stringify({
          bookId: createdBookId,
          bookBoxCompanyId: companyId || undefined,
          subscriptionId: subscriptionId || undefined,
          basePrice: price || undefined,
          currency: currency || undefined,
          language: language || undefined,
          firstAccessDate: firstAccessDate || undefined,
          earlyAccessDate: earlyAccessDate || undefined,
          generalSaleDate: generalSaleDate || undefined,
          coverImage: allImages[0] || undefined,
          additionalImages: allImages.slice(1).filter(Boolean),
          features: features.filter(Boolean),
        }),
      })
      // Add artists — deduplicate by name, look up existing before creating
      const seenArtistNames = new Map<string, string>() // name.lower → artistId
      for (const art of artists) {
        const name = art.name.trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seenArtistNames.has(key)) continue
        let artistId = art.id
        if (!artistId) {
          // Check if artist already exists in DB before creating
          const existing = await authFetch<{ data: { id: string; name: string }[] }>(
            `/artists?search=${encodeURIComponent(name)}&pageSize=5`
          )
          const match = existing.data?.find(a => a.name.toLowerCase() === key)
          if (match) {
            artistId = match.id
          } else {
            const created = await authFetch<{ id: string }>('/artists', {
              method: 'POST', body: JSON.stringify({ name }),
            })
            artistId = created.id
          }
        }
        seenArtistNames.set(key, artistId)
        await authFetch(`/editions/${ed.slug}/artists`, {
          method: 'POST',
          body: JSON.stringify({ artistId, role: art.role || 'cover art' }),
        })
      }
      qc.invalidateQueries({ queryKey: ['artists-search'] })
      // Link to month
      await authFetch(
        `/subscriptions/${subscriptionSlug}/months/${monthYear}/${monthMonth}/books`,
        { method: 'POST', body: JSON.stringify({ bookId: createdBookId, editionId: ed.id }) }
      )
      qc.invalidateQueries({ queryKey: ['admin', 'subscriptions', subscriptionSlug, 'months'] })
      setSaved(true)
      setTimeout(() => onSuccess(), 800)
    } catch (e: unknown) {
      alert(`Error creating edition: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // ── STEP 1 RENDER ─────────────────────────────────────────────────────────
  if (step === 1) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500 uppercase tracking-wide font-semibold">Step 1 / 2 — Book</span>
      </div>

      {/* Title */}
      <div>
        <label className={LBL}>Title *</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Book title" className={INP} />
      </div>

      {/* Description */}
      <div>
        <label className={LBL}>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          rows={3} placeholder="Short synopsis or description…" className={`${INP} resize-none`} />
      </div>

      {/* Authors */}
      <div>
        <label className={LBL}>Author(s)</label>
        <PersonPicker endpoint="authors" placeholder="Search or create author…"
          onAdd={a => {
            if (!authors.find(ex => ex.name.toLowerCase() === a.name.toLowerCase()))
              setAuthors(prev => [...prev, a])
          }} />
        {authors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {authors.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 bg-stone-700 text-stone-200 text-xs px-2.5 py-1 rounded-full">
                {!a.id && <span className="text-amber-400 text-[9px] font-semibold uppercase">new</span>}
                {a.name}
                <button onClick={() => setAuthors(authors.filter((_, j) => j !== i))}
                  className="text-stone-500 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Series + Volume */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Series</label>
          <SeriesPicker value={seriesName} onChange={setSeriesName} />
        </div>
        <div>
          <label className={LBL}>Volume / position</label>
          <input type="number" value={volumeNumber} onChange={e => setVolumeNumber(e.target.value)}
            placeholder="1" min={0} step={0.5} className={INP} />
        </div>
      </div>

      {/* Genres */}
      <div>
        <label className={LBL}>Genres</label>
        <GenreTagsPicker genres={genres} onChange={setGenres} />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || !title.trim()} onClick={handleStep1}
          className={BTN_PRIMARY}>
          {busy ? 'Creating…' : 'Next: Edition →'}
        </button>
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
      </div>
    </div>
  )

  // ── STEP 2 RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500 uppercase tracking-wide font-semibold">
          {existingBookId ? 'Edition details' : 'Step 2 / 2 — Edition'}
        </span>
        {!existingBookId && (
          <button type="button" onClick={() => setStep(1)}
            className="text-xs text-stone-500 hover:text-stone-300">← Edit book</button>
        )}
      </div>

      {/* Company + price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Company (book box)</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} className={INP}>
            <option value="">— none —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LBL}>Price</label>
          <div className="flex gap-2">
            <input value={price} onChange={e => setPrice(e.target.value)}
              placeholder="45.99" className={`${INP} flex-1`} />
            <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())}
              placeholder="USD" maxLength={3}
              className="w-16 bg-stone-800 border border-stone-700 rounded-lg px-2 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm text-center uppercase" />
          </div>
        </div>
      </div>

      {/* Language */}
      <div>
        <label className={LBL}>Language</label>
        <input
          value={language}
          onChange={e => setLanguage(e.target.value)}
          placeholder="e.g. English, Polish…"
          className={INP}
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={LBL}>First access</label>
          <input type="date" value={firstAccessDate} onChange={e => setFirstAccessDate(e.target.value)} className={INP} />
        </div>
        <div>
          <label className={LBL}>Early access</label>
          <input type="date" value={earlyAccessDate} onChange={e => setEarlyAccessDate(e.target.value)} className={INP} />
        </div>
        <div>
          <label className={LBL}>General sale</label>
          <input type="date" value={generalSaleDate} onChange={e => setGeneralSaleDate(e.target.value)} className={INP} />
        </div>
      </div>

      {/* Images — first = main cover */}
      <div>
        <label className={LBL}>Images <span className="text-stone-600 font-normal normal-case tracking-normal">(first image will be the main cover)</span></label>
        <MultiImageUpload
          images={allImages}
          folder="luxgrimoire/editions"
          onChange={setAllImages}
        />
      </div>

      <AiParseSection onResult={applyAiResult} />

      {/* Artists */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={LBL}>Artists / contributors</label>
          <button type="button"
            onClick={() => setArtists(prev => [...prev, { name: '', role: '' }])}
            className={`${BTN_SM} bg-stone-700 text-stone-400 hover:bg-stone-600`}>+ Add artist</button>
        </div>
        {artists.length > 0 && (
          <div className="space-y-2">
            {artists.map((art, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  {art.name ? (
                    <div className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200">
                      {!art.id && <span className="text-amber-400 text-[9px] font-semibold uppercase">new</span>}
                      <span className="flex-1">{art.name}</span>
                      <button
                        onClick={() => setArtists(prev => prev.map((x, j) => j === i ? { ...x, id: undefined, name: '' } : x))}
                        className="text-stone-500 hover:text-red-400 text-xs">×</button>
                    </div>
                  ) : (
                    <PersonPicker endpoint="artists" placeholder="Search or create artist…"
                      onAdd={a => setArtists(prev => prev.map((x, j) => j === i ? { ...x, id: a.id, name: a.name } : x))} />
                  )}
                </div>
                <input value={art.role} onChange={e => setArtists(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                  placeholder="What they created (e.g. cover art, character illustrations, map…)"
                  className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-2 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-xs" />
                <button type="button"
                  onClick={() => setArtists(prev => prev.filter((_, j) => j !== i))}
                  className="mt-2 text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features */}
      <div>
        <label className={LBL}>Features / extras</label>
        <FeatureTags features={features} onChange={setFeatures} />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || saved} onClick={handleStep2}
          className={saved
            ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-white transition-colors'
            : BTN_PRIMARY}>
          {saved ? '✓ Added to month!' : busy ? 'Saving…' : existingBookId ? 'Create Edition & Link' : 'Create & Link to Month'}
        </button>
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
      </div>
    </div>
  )
}