'use client'

import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { PersonPicker, type PersonEntry } from './pickers/PersonPicker'
import { SeriesPicker } from './pickers/SeriesPicker'
import { GenreTagsPicker } from './pickers/GenreTagsPicker'
import MultiImageUpload, { uploadImage } from './MultiImageUpload'

// ─── Styles ───────────────────────────────────────────────────────────────────
const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-xs text-stone-400 mb-1'
const BTN_PRIMARY = 'px-4 py-2 rounded-lg text-sm font-semibold bg-amber-400 text-stone-950 hover:bg-amber-300 disabled:opacity-50 transition-colors'
const BTN_GHOST = 'px-4 py-2 rounded-lg text-sm font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors'
const BTN_SM = 'px-2.5 py-1 rounded-md text-xs font-medium transition-colors'

// ─── Types ────────────────────────────────────────────────────────────────────
type ArtistEntry = { id?: string; name: string; role: string }
type Company = { id: string; name: string; slug: string; defaultCurrency?: string | null }

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
  subscriptionSlug?: string
  subscriptionId?: string | null
  defaultCurrency?: string | null
  defaultCompanyId?: string | null
  defaultPrice?: number | null
  renewalDay?: number | null
  monthYear?: number
  monthMonth?: number
  /** Pre-fill date fields from a sale announcement context */
  defaultFirstAccessDate?: string | null
  defaultEarlyAccessDate?: string | null
  defaultGeneralSaleDate?: string | null
  /** If true, form stops after Step 1 (book only — no edition or month linking) */
  bookOnly?: boolean
  /** If provided, skip step 1 and start at edition creation for an existing book */
  existingBookId?: string
  onSuccess: (editionId?: string) => void
  /** Called after book creation in bookOnly mode — useful to chain into edition creation */
  onBookCreated?: (bookId: string, bookTitle: string) => void
  onCancel: () => void
}

export default function CreateBookEditionForm({
  subscriptionSlug, subscriptionId, defaultCurrency, defaultCompanyId,
  defaultPrice, renewalDay,
  monthYear, monthMonth, existingBookId, bookOnly,
  defaultFirstAccessDate, defaultEarlyAccessDate, defaultGeneralSaleDate,
  onSuccess, onBookCreated, onCancel,
}: CreateBookEditionFormProps) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'MODERATOR' || user?.role === 'COMPANY_MANAGER'
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
  const [publisher, setPublisher] = useState('')
  const [photoCredit, setPhotoCredit] = useState('')
  const [firstAccessDate, setFirstAccessDate] = useState(defaultFirstAccessDate ?? '')
  const [earlyAccessDate, setEarlyAccessDate] = useState(defaultEarlyAccessDate ?? '')
  const [generalSaleDate, setGeneralSaleDate] = useState(() => {
    if (defaultGeneralSaleDate) return defaultGeneralSaleDate
    if (renewalDay == null || monthMonth == null || monthYear == null) return ''
    const mm = String(monthMonth).padStart(2, '0')
    const dd = String(renewalDay).padStart(2, '0')
    return `${monthYear}-${mm}-${dd}`
  })
  const [allImages, setAllImages] = useState<string[]>([])
  const [artists, setArtists] = useState<ArtistEntry[]>([])
  const [features, setFeatures] = useState<string[]>([])
  const [language, setLanguage] = useState('')

  // Duplicate detection
  const [duplicateBook, setDuplicateBook] = useState<{ id: string; slug: string; title: string; authors: { name: string }[] } | null>(null)
  const [duplicateEdition, setDuplicateEdition] = useState<{ id: string; slug: string; bookBoxCompany: { name: string } | null; collection: { name: string } | null } | null>(null)

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
    if (r.edition?.publisher) setPublisher(r.edition.publisher)
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
        const existing = new Set(prev.map(a => `${normalize(a.name)}|${a.role.toLowerCase()}`))
        const toAdd = r.edition!.artists!.filter(a => !existing.has(`${normalize(a.name)}|${a.role.toLowerCase()}`))
        return [...prev, ...toAdd.map(a => ({ name: a.name, role: a.role }))]
      })
    }
  }

  // ── Step 1 submit ────────────────────────────────────────────────────────
  const handleStep1 = async () => {
    if (!title.trim()) return alert('Book title is required')
    setBusy(true)
    setDuplicateBook(null)
    try {
      // Duplicate book check
      const searchRes = await authFetch<{ data: Array<{ id: string; slug: string; title: string; authors: Array<{ author: { name: string } }> }> }>(
        `/books?search=${encodeURIComponent(title.trim())}&pageSize=10`
      )
      const titleLower = title.trim().toLowerCase()
      const exact = searchRes.data.find(b => b.title.toLowerCase() === titleLower)
      if (exact) {
        const authorNames = authors.map(a => a.name.toLowerCase())
        const hasAuthorMatch =
          authorNames.length === 0 || exact.authors.length === 0 ||
          exact.authors.some(ba => authorNames.includes(ba.author.name.toLowerCase()))
        if (hasAuthorMatch) {
          setDuplicateBook({ id: exact.id, slug: exact.slug, title: exact.title, authors: exact.authors.map(ba => ({ name: ba.author.name })) })
          setBusy(false)
          return
        }
      }
      const book = await authFetch<{ id: string; slug: string; title: string }>(isPrivileged ? '/books' : '/books/suggest', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          seriesName: seriesName.trim() || undefined,
          volumeNumber: volumeNumber ? Number(volumeNumber) : undefined,
          genres: genres.length ? genres : undefined,
        }),
      })
      if (isPrivileged) {
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
      }
      setCreatedBookId(book.id)
      setCreatedBookSlug(book.slug)
      if (bookOnly) {
        qc.invalidateQueries({ queryKey: ['admin', 'books'] })
        if (onBookCreated) {
          onBookCreated(book.id, book.title)
        } else {
          onSuccess()
        }
      } else {
        setStep(2)
      }
    } catch (e: unknown) {
      alert(`Error creating book: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // ── Step 2 submit ────────────────────────────────────────────────────────
  const handleStep2 = async () => {
    setBusy(true)
    setDuplicateEdition(null)
    try {
      // Duplicate edition check
      if (companyId) {
        const edRes = await authFetch<{ data: Array<{ id: string; slug: string; bookBoxCompany: { name: string } | null; collection: { name: string } | null }> }>(
          `/editions?bookId=${createdBookId}&companyId=${companyId}&pageSize=10`
        )
        if (edRes.data.length > 0) {
          setDuplicateEdition({ id: edRes.data[0].id, slug: edRes.data[0].slug, bookBoxCompany: edRes.data[0].bookBoxCompany, collection: edRes.data[0].collection })
          setBusy(false)
          return
        }
      }
      const ed = await authFetch<{ id: string; slug: string }>('/editions', {
        method: 'POST',
        body: JSON.stringify({
          bookId: createdBookId,
          bookBoxCompanyId: companyId || undefined,
          subscriptionId: subscriptionId || undefined,
          publisher: publisher.trim() || undefined,
          photoCredit: photoCredit.trim() || undefined,
          currency: currency || undefined,
          language: language || undefined,
          firstAccessDate: firstAccessDate || undefined,
          earlyAccessDate: earlyAccessDate || undefined,
          generalSaleDate: generalSaleDate || undefined,
          additionalImages: allImages.filter(Boolean),
          features: features.filter(Boolean),
        }),
      })
      // Add artists — resolve each artist once, but allow multiple roles per artist
      const artistIdByName = new Map<string, string>() // name.lower → artistId
      for (const art of artists) {
        const name = art.name.trim()
        if (!name) continue
        const key = name.toLowerCase()
        let artistId = art.id
        if (!artistId) {
          if (artistIdByName.has(key)) {
            artistId = artistIdByName.get(key)!
          } else {
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
        }
        artistIdByName.set(key, artistId)
        await authFetch(`/editions/${ed.slug}/artists`, {
          method: 'POST',
          body: JSON.stringify({ artistId, role: art.role || 'cover art' }),
        })
      }
      qc.invalidateQueries({ queryKey: ['artists-search'] })
      // Link to month (only when used in subscription context)
      if (subscriptionSlug && monthYear != null && monthMonth != null) {
        await authFetch(
          `/subscriptions/${subscriptionSlug}/months/${monthYear}/${monthMonth}/books`,
          { method: 'POST', body: JSON.stringify({ bookId: createdBookId, editionId: ed.id }) }
        )
        qc.invalidateQueries({ queryKey: ['admin', 'subscriptions', subscriptionSlug, 'months'] })
      }
      qc.invalidateQueries({ queryKey: ['admin', 'editions'] })
      setSaved(true)
      setTimeout(() => onSuccess(ed.id), 800)
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
        <span className="text-xs text-stone-500 uppercase tracking-wide font-semibold">
          {bookOnly ? 'Book details' : 'Step 1 / 2 — Book'}
        </span>
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
        <button type="button" disabled={busy || !title.trim()} onClick={() => handleStep1()}
          className={BTN_PRIMARY}>
          {busy ? 'Creating…' : bookOnly ? 'Create Book' : 'Next: Edition →'}
        </button>
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
      </div>

      {duplicateBook && (
        <div className="bg-amber-950/40 border border-amber-600/40 rounded-xl p-4 space-y-2">
          <p className="text-sm text-amber-300 font-semibold">⚠ This book may already exist</p>
          <p className="text-sm text-stone-300">
            <strong>{duplicateBook.title}</strong>
            {duplicateBook.authors.length > 0 && ` by ${duplicateBook.authors.map(a => a.name).join(', ')}`}
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button"
              onClick={() => { setCreatedBookId(duplicateBook.id); setDuplicateBook(null); setStep(2) }}
              className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold rounded-lg transition-colors">
              Use existing book →
            </button>
            <a href={`/books/${duplicateBook.slug}`} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg transition-colors">
              View book ↗
            </a>
          </div>
        </div>
      )}
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
          <select value={companyId} onChange={e => {
              const id = e.target.value
              setCompanyId(id)
              const co = companies.find(c => c.id === id)
              if (co?.defaultCurrency) setCurrency(co.defaultCurrency)
            }} className={INP}>
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

      {/* Publisher + Language */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Publisher</label>
          <input value={publisher} onChange={e => setPublisher(e.target.value)}
            placeholder="e.g. Fairyloot Exclusive" className={INP} />
        </div>
        <div>
          <label className={LBL}>Language</label>
          <input value={language} onChange={e => setLanguage(e.target.value)}
            placeholder="e.g. English, Polish…" className={INP} />
        </div>
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
        <div className="mt-2">
          <label className={LBL}>Photo by (IG handle)</label>
          <input value={photoCredit} onChange={e => setPhotoCredit(e.target.value)}
            placeholder="@username" className={INP} />
        </div>
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
        <button type="button" disabled={busy || saved} onClick={() => handleStep2()}
          className={saved
            ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-white transition-colors'
            : BTN_PRIMARY}>
          {saved ? '✓ Added!' : busy ? 'Saving…' : existingBookId ? 'Create Edition & Link' : 'Create & Link to Month'}
        </button>
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
      </div>

      {duplicateEdition && (
        <div className="bg-amber-950/40 border border-amber-600/40 rounded-xl p-4 space-y-2">
          <p className="text-sm text-amber-300 font-semibold">⚠ A similar edition already exists</p>
          <p className="text-sm text-stone-300">
            {duplicateEdition.bookBoxCompany?.name ?? 'Unknown company'}
            {duplicateEdition.collection && ` — ${duplicateEdition.collection.name}`}
          </p>
          <div className="flex gap-2 pt-1">
            <a href={`/editions/${duplicateEdition.slug}`} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg transition-colors">
              View existing ↗
            </a>
          </div>
        </div>
      )}
    </div>
  )
}