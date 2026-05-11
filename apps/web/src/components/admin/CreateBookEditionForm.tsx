'use client'

import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { PersonPicker, type PersonEntry } from './pickers/PersonPicker'
import { SeriesPicker } from './pickers/SeriesPicker'
import { GenreTagsPicker } from './pickers/GenreTagsPicker'
import { EditionFieldsSection, type AiParseResult, type ArtistEntry, type EditionCompany } from './EditionFieldsSection'

// ─── Styles ───────────────────────────────────────────────────────────────────
const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-xs text-stone-400 mb-1'
const BTN_PRIMARY = 'px-4 py-2 rounded-lg text-sm font-semibold bg-amber-400 text-stone-950 hover:bg-amber-300 disabled:opacity-50 transition-colors'
const BTN_GHOST = 'px-4 py-2 rounded-lg text-sm font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors'

// ─── Types ────────────────────────────────────────────────────────────────────
const ISO_TO_LANGUAGE: Record<string, string> = {
  EN: 'English', PL: 'Polish', FR: 'French', DE: 'German', ES: 'Spanish',
  IT: 'Italian', PT: 'Portuguese', NL: 'Dutch', CS: 'Czech', HU: 'Hungarian',
  RO: 'Romanian', UK: 'Ukrainian', JA: 'Japanese', KO: 'Korean', ZH: 'Chinese',
}
function resolveLanguage(lang: string | null | undefined): string {
  if (!lang) return ''
  return ISO_TO_LANGUAGE[lang.toUpperCase()] ?? lang
}

// ─── Main component ───────────────────────────────────────────────────────────
export interface CreateBookEditionFormProps {
  subscriptionSlug?: string
  subscriptionId?: string | null
  defaultCurrency?: string | null
  defaultCompanyId?: string | null
  defaultPrice?: number | null
  renewalDay?: number | null
  defaultLanguage?: string | null
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
  defaultPrice, renewalDay, defaultLanguage,
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
  const [language, setLanguage] = useState(resolveLanguage(defaultLanguage))

  // Duplicate detection
  const [duplicateBook, setDuplicateBook] = useState<{ id: string; slug: string; title: string; authors: { name: string }[] } | null>(null)
  const [duplicateEdition, setDuplicateEdition] = useState<{ id: string; slug: string; bookBoxCompany: { name: string } | null; collection: { name: string } | null } | null>(null)

  // ── Companies ────────────────────────────────────────────────────────────
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => authFetch<{ data: EditionCompany[] }>('/companies?pageSize=100'),
  })
  const companies = companiesData?.data ?? []

  // ── Collections (for selected company) ──────────────────────────────────
  const [collectionId, setCollectionId] = useState('')
  const { data: collectionsData } = useQuery({
    queryKey: ['edition-form-collections', companyId],
    queryFn: () => authFetch<{ data: { id: string; name: string }[] }>(`/book-box-collections?companyId=${companyId}&pageSize=100`),
    enabled: !!companyId,
  })
  const collections = collectionsData?.data ?? []

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
          collectionId: collectionId || undefined,
          subscriptionId: subscriptionId || undefined,
          publisher: publisher.trim() || undefined,
          photoCredit: photoCredit.trim() || undefined,
          basePrice: price ? Number(price.replace(',', '.')) : undefined,
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
        <GenreTagsPicker genres={genres} onChange={setGenres} allowNew={isPrivileged} />
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
              onClick={() => {
                if (bookOnly && onBookCreated) {
                  onBookCreated(duplicateBook.id, duplicateBook.title)
                } else {
                  setCreatedBookId(duplicateBook.id)
                  setCreatedBookSlug(duplicateBook.slug)
                  setDuplicateBook(null)
                  setStep(2)
                }
              }}
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

      <EditionFieldsSection
        companyId={companyId}
        onCompanyChange={setCompanyId}
        onCompanyChangeCurrency={setCurrency}
        collectionId={collectionId}
        onCollectionChange={setCollectionId}
        price={price}
        onPriceChange={setPrice}
        currency={currency}
        onCurrencyChange={setCurrency}
        publisher={publisher}
        onPublisherChange={setPublisher}
        photoCredit={photoCredit}
        onPhotoCreditChange={setPhotoCredit}
        language={language}
        onLanguageChange={setLanguage}
        firstAccessDate={firstAccessDate}
        onFirstAccessDateChange={setFirstAccessDate}
        earlyAccessDate={earlyAccessDate}
        onEarlyAccessDateChange={setEarlyAccessDate}
        generalSaleDate={generalSaleDate}
        onGeneralSaleDateChange={setGeneralSaleDate}
        allImages={allImages}
        onImagesChange={setAllImages}
        onAiResult={applyAiResult}
        artists={artists}
        onArtistsChange={setArtists}
        features={features}
        onFeaturesChange={setFeatures}
        companies={companies}
        collections={collections}
      />

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || saved} onClick={() => handleStep2()}
          className={saved
            ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-white transition-colors'
            : BTN_PRIMARY}>
          {saved ? '✓ Added!' : busy ? 'Saving…' : subscriptionSlug ? (existingBookId ? 'Create Edition & Link' : 'Create & Link to Month') : 'Create Edition'}
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