'use client'

import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { PersonPicker, type PersonEntry } from './pickers/PersonPicker'
import { GenreTagsPicker } from './pickers/GenreTagsPicker'
import { EditionFieldsSection, type AiParseResult, type ArtistEntry, type EditionCompany, type FeaturePreviewHandle, FEATURE_TAGS_QUERY_KEY } from './EditionFieldsSection'
import { applyAiEditionResult } from '@/lib/applyAiEditionResult'
import { GoodreadsParser, SeriesEntriesEditor, seriesEntriesToPayload, StagedComponentsEditor, type AiBookResult, type SeriesEntryFormState, type StagedComponent } from './BookForm'
import { INP, LBL, BTN_PRIMARY, BTN_GHOST } from '@/lib/adminFormStyles'
import { computeGeneralSaleDatePrefill } from '@/lib/generalSalePrefill'

// ─── Types ────────────────────────────────────────────────────────────────────
const ISO_TO_LANGUAGE: Record<string, string> = {
  EN: 'English', PL: 'Polish', FR: 'French', DE: 'German', ES: 'Spanish',
  IT: 'Italian', PT: 'Portuguese', NL: 'Dutch', CS: 'Czech', HU: 'Hungarian',
  RO: 'Romanian', UK: 'Ukrainian', JA: 'Japanese', KO: 'Korean', ZH: 'Chinese',
}
function resolveLanguage(lang: string | null | undefined): string {
  if (!lang) return 'English'
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
  renewalDayUserSet?: boolean | null
  renewalMonthOffset?: number | null
  defaultLanguage?: string | null
  monthYear?: number
  monthMonth?: number
  /** Pre-fill date fields from a sale announcement context */
  defaultFirstAccessDate?: string | null
  defaultEarlyAccessDate?: string | null
  defaultGeneralSaleDate?: string | null
  /** Bundle prefill defaults */
  defaultPublisher?: string
  defaultCollectionId?: string
  defaultPhotoCredit?: string
  defaultArtists?: Array<{ name: string; role: string }>
  defaultFeatureTags?: Array<{ rawValue: string; categories: string[] }>
  /** If true, form stops after Step 1 (book only — no edition or month linking) */
  bookOnly?: boolean
  /** If provided, skip step 1 and start at edition creation for an existing book */
  existingBookId?: string
  /** When set, the created edition is linked into this edition's variant group (e.g. "Duplicate as variant"). */
  sourceEditionId?: string
  defaultVariantLabel?: string
  onSuccess: (editionId?: string) => void
  /** Called after book creation in bookOnly mode — useful to chain into edition creation */
  onBookCreated?: (bookId: string, bookTitle: string) => void
  onCancel: () => void
}

export default function CreateBookEditionForm({
  subscriptionSlug, subscriptionId, defaultCurrency, defaultCompanyId,
  defaultPrice, renewalDay, renewalDayUserSet, renewalMonthOffset, defaultLanguage,
  monthYear, monthMonth, existingBookId, bookOnly, sourceEditionId, defaultVariantLabel,
  defaultFirstAccessDate, defaultEarlyAccessDate, defaultGeneralSaleDate,
  defaultPublisher, defaultCollectionId, defaultPhotoCredit, defaultArtists, defaultFeatureTags,
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
  const [seriesEntries, setSeriesEntries] = useState<SeriesEntryFormState[]>([])
  const [isOmnibus, setIsOmnibus] = useState(false)
  const [stagedComponents, setStagedComponents] = useState<StagedComponent[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [createdBookId, setCreatedBookId] = useState(existingBookId ?? '')
  const [createdBookSlug, setCreatedBookSlug] = useState('')
  const [saved, setSaved] = useState(false)

  // ── Step 2: Edition ──────────────────────────────────────────────────────
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? '')
  const [price, setPrice] = useState(defaultPrice != null ? String(defaultPrice) : '')
  const [currency, setCurrency] = useState(defaultCurrency ?? 'USD')
  const [publisher, setPublisher] = useState(defaultPublisher ?? '')
  const [photoCredit, setPhotoCredit] = useState(defaultPhotoCredit ?? '')
  const [firstAccessDate, setFirstAccessDate] = useState(defaultFirstAccessDate ?? '')
  const [earlyAccessDate, setEarlyAccessDate] = useState(defaultEarlyAccessDate ?? '')
  const [generalSaleDate, setGeneralSaleDate] = useState(() => {
    if (defaultGeneralSaleDate) return defaultGeneralSaleDate
    return computeGeneralSaleDatePrefill(monthYear, monthMonth, renewalDay, renewalDayUserSet, renewalMonthOffset)
  })
  const [allImages, setAllImages] = useState<string[]>([])
  const [language, setLanguage] = useState(resolveLanguage(defaultLanguage))
  const [variantLabel, setVariantLabel] = useState(defaultVariantLabel ?? '')
  // Feature tags to POST after edition creation (filled by AI parser or bundle defaults)
  const [pendingFeatureTags, setPendingFeatureTags] = useState<Array<{ rawValue: string; categories: string[] }>>(defaultFeatureTags ?? [])
  const featurePreviewRef = useRef<FeaturePreviewHandle>(null)
  // Artists to POST after edition creation (filled by AI parser / user input / bundle defaults)
  const [artists, setArtists] = useState<ArtistEntry[]>(defaultArtists ?? [])

  // Duplicate detection
  const [duplicateBook, setDuplicateBook] = useState<{ id: string; slug: string; title: string; authors: { name: string }[] } | null>(null)
  const [duplicateEdition, setDuplicateEdition] = useState<{ id: string; slug: string; bookBoxCompany: { name: string } | null; collection: { name: string } | null } | null>(null)
  // Duplicating an existing edition (via sourceEditionId) is expected to collide with the
  // book+company duplicate check — skip that check entirely in this flow, since linking into
  // the variant group already happens server-side at creation time via sourceEditionId.
  const [bypassDuplicate, setBypassDuplicate] = useState(!!sourceEditionId)
  const [linkMode, setLinkMode] = useState<'history' | 'variant'>('history')
  const [createdEditionSlug, setCreatedEditionSlug] = useState<string | null>(null)
  const [createdEditionId, setCreatedEditionId] = useState<string | null>(null)
  const [showLinkStep, setShowLinkStep] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkDone, setLinkDone] = useState(false)
  const [retagging, setRetagging] = useState(false)
  const [retagDone, setRetagDone] = useState(false)

  // ── Companies ────────────────────────────────────────────────────────────
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => authFetch<{ data: EditionCompany[] }>('/companies?pageSize=100'),
  })
  const companies = companiesData?.data ?? []

  // ── Collections (for selected company) ──────────────────────────────────
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? '')
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
    if (r.book?.seriesName) {
      setSeriesEntries([{
        seriesName: r.book.seriesName,
        volumeNumbers: r.book.volumeNumber != null ? String(r.book.volumeNumber) : '',
        isPrimary: true,
      }])
    }
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
    applyAiEditionResult(r, { setPublisher, setPrice, setCurrency, setFirstAccessDate, setEarlyAccessDate, setGeneralSaleDate, setArtists })
    // Stage features for POST after edition creation:
    // Use featureOrder (AI-emitted) for correct source-text ordering; fall back to
    // standalones-first if the field is absent (older responses / edge cases).
    const standaloneFeatures = (r.edition?.features ?? []).map(f => f.trim()).filter(Boolean)
    const artistBaseFeatures = (r.edition?.artists ?? [])
      .map(a => (a.role?.trim() ?? '').replace(/\s*\(\w+\)$/, '').trim())
      .filter(Boolean)
    const orderedRaws: string[] = r.edition?.featureOrder?.length
      ? Array.from(new Set(r.edition.featureOrder.map(f => f.trim()).filter(Boolean)))
      : Array.from(new Set([...standaloneFeatures, ...artistBaseFeatures]))
    const newFeatureTags: Array<{ rawValue: string; categories: string[] }> = orderedRaws
      .map(rawValue => ({ rawValue, categories: r.edition?.featureTags?.[rawValue] ?? [] }))
    if (newFeatureTags.length > 0) {
      setPendingFeatureTags(prev => {
        const existing = new Set(prev.map(p => p.rawValue))
        return [...prev, ...newFeatureTags.filter(t => !existing.has(t.rawValue))]
      })
    }
  }

  // ── Goodreads parser handler ─────────────────────────────────────────────
  const applyGoodreadsResult = (data: AiBookResult) => {
    if (data.title) setTitle(data.title)
    if (data.description) setDescription(data.description)
    if (data.seriesName) {
      setSeriesEntries([{
        seriesName: data.seriesName,
        volumeNumbers: data.volumeNumber != null ? String(data.volumeNumber) : '',
        isPrimary: true,
      }])
    }
    if (Array.isArray(data.genres) && data.genres.length) setGenres(data.genres.slice(0, 5))
    if (Array.isArray(data.authors) && data.authors.length) {
      setAuthors(prev => {
        const existing = new Set(prev.map(a => a.name.toLowerCase()))
        const toAdd = data.authors!.filter(a => !existing.has(a.name.toLowerCase()))
        return [...prev, ...toAdd.map(a => ({ name: a.name }))]
      })
    }
  }

  // ── Retag preview ─────────────────────────────────────────────────────────
  const handleRetag = async () => {
    setRetagging(true)
    setRetagDone(false)
    try {
      const features = featurePreviewRef.current?.getCurrentRawValues() ?? []
      if (features.length === 0) {
        setRetagDone(true)
        setTimeout(() => setRetagDone(false), 3000)
        return
      }
      const result = await authFetch<Array<{ rawValue: string; categories: string[] }>>(
        '/feature-categories/tag-preview',
        { method: 'POST', body: JSON.stringify({ features }) },
      )
      featurePreviewRef.current?.applyRetagResult(result)
      setRetagDone(true)
      setTimeout(() => setRetagDone(false), 3000)
    } catch (e: unknown) {
      alert(`Retag failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRetagging(false)
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
          seriesEntries: seriesEntriesToPayload(seriesEntries),
          genres: genres.length ? genres : undefined,
        }),
      })
      for (const auth of authors) {
        let authorId = auth.id
        if (!authorId) {
          const searchRes = await authFetch<{ data: { id: string; name: string }[] }>(
            `/authors?search=${encodeURIComponent(auth.name.trim())}&pageSize=5`
          )
          const match = searchRes.data?.find(a => a.name.toLowerCase() === auth.name.trim().toLowerCase())
          if (match) {
            authorId = match.id
          } else {
            const created = await authFetch<{ id: string }>('/authors', {
              method: 'POST', body: JSON.stringify({ name: auth.name }),
            })
            authorId = created.id
          }
        }
        await authFetch(`/books/${book.slug}/authors/${authorId}`, { method: 'POST' })
      }
      if (isPrivileged && stagedComponents.length > 0) {
        await Promise.all(stagedComponents.map(c =>
          authFetch(`/books/${book.slug}/components`, {
            method: 'POST',
            body: JSON.stringify({
              bookId: c.bookId,
              volumeNumber: c.volumeNumber ? parseFloat(c.volumeNumber) : undefined,
              order: c.order ? parseInt(c.order, 10) : undefined,
            }),
          }).catch(() => null)
        ))
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
  const handleStep2 = async (forceBypass?: boolean) => {
    setBusy(true)
    const shouldBypass = forceBypass ?? bypassDuplicate
    // Only clear the duplicate warning when we're re-checking (not bypassing).
    // When bypassing, we preserve duplicateEdition so the link step can reference it.
    if (!shouldBypass) setDuplicateEdition(null)
    try {
      // Duplicate edition check
      if (companyId && !shouldBypass) {
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
          variantLabel: variantLabel.trim() || undefined,
          sourceEditionId: sourceEditionId || undefined,
        }),
      })
      // POST AI-parsed / staged feature tags via ref (flushChanges handles new, deleted and patched)
      if (featurePreviewRef.current) {
        await featurePreviewRef.current.flushChanges(ed.slug)
      } else if (pendingFeatureTags.length > 0) {
        await Promise.all(pendingFeatureTags.map(t =>
          authFetch(`/editions/${ed.slug}/feature-tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawValue: t.rawValue, categories: t.categories }),
          }).catch(() => null)
        ))
        qc.invalidateQueries({ queryKey: FEATURE_TAGS_QUERY_KEY(ed.slug) })
      }
      // POST artists — auto-search/create by name (no manual linking required)
      const artistIdByName = new Map<string, string>()
      for (const art of artists) {
        const name = art.name.trim()
        if (!name) continue
        const key = name.toLowerCase()
        let artistId = art.id
        if (!artistId) {
          if (artistIdByName.has(key)) {
            artistId = artistIdByName.get(key)!
          } else {
            const res = await authFetch<{ data: { id: string; name: string }[] }>(
              `/artists?search=${encodeURIComponent(name)}&pageSize=5`
            )
            const match = res.data?.find(a => a.name.toLowerCase() === key)
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
        }).catch(() => null)
      }
      setCreatedEditionSlug(ed.slug)
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
      // If this was a re-edition (bypassed duplicate check), show the link step
      if (shouldBypass && duplicateEdition) {
        setCreatedEditionId(ed.id)
        setShowLinkStep(true)
      } else {
        setTimeout(() => onSuccess(ed.id), 800)
      }
    } catch (e: unknown) {
      alert(`Error creating edition: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // ── LINK HISTORY / VARIANT STEP ──────────────────────────────────────────
  if (showLinkStep && createdEditionSlug && duplicateEdition) {
    const handleLink = async () => {
      setLinkBusy(true)
      try {
        const endpoint = linkMode === 'variant' ? 'link-variant' : 'link-history'
        await authFetch(`/editions/${createdEditionSlug}/${endpoint}`, {
          method: 'POST',
          body: JSON.stringify({ relatedEditionSlug: duplicateEdition.slug }),
        })
        setLinkDone(true)
        qc.invalidateQueries({ queryKey: ['admin', 'editions'] })
        setTimeout(() => onSuccess(createdEditionId ?? undefined), 600)
      } catch (e) {
        alert(`Link failed: ${e instanceof Error ? e.message : String(e)}`)
        setLinkBusy(false)
      }
    }
    return (
      <div className="space-y-4 p-4 bg-stone-800/60 rounded-xl border border-amber-700/30">
        <p className="text-sm text-stone-300 font-semibold">✓ New edition created!</p>
        <p className="text-sm text-stone-400">
          {linkMode === 'variant'
            ? 'Link it as a variant of the existing edition (e.g. White/Black — released together)?'
            : 'Link it to the previous edition from the same company (reissue)?'}
        </p>
        <div className="p-3 rounded-lg bg-stone-700/50 text-sm text-stone-200">
          {duplicateEdition.bookBoxCompany?.name ?? duplicateEdition.slug}
          {duplicateEdition.collection ? ` — ${duplicateEdition.collection.name}` : ''}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={linkBusy || linkDone} onClick={handleLink}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-400 text-stone-950 hover:bg-amber-300 disabled:opacity-50 transition-colors">
            {linkDone ? '✓ Linked!' : linkBusy ? 'Linking…' : linkMode === 'variant' ? 'Link as variant' : 'Link as re-edition'}
          </button>
          <button type="button" onClick={() => onSuccess(createdEditionId ?? undefined)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors">
            Skip
          </button>
        </div>
      </div>
    )
  }

  // ── STEP 1 RENDER ─────────────────────────────────────────────────────────
  if (step === 1) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500 uppercase tracking-wide font-semibold">
          {bookOnly ? 'Book details' : 'Step 1 / 2 — Book'}
        </span>
      </div>

      <GoodreadsParser onResult={applyGoodreadsResult} />

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
          rows={3} placeholder="Short synopsis or description…" className={`${INP} resize-y min-h-[4.5rem]`} />
      </div>

      {/* Authors */}
      <div>
        <label className={LBL}>Author(s)</label>
        <PersonPicker endpoint="authors" placeholder="Search or create author…"
          onAdd={a => {
            setAuthors(prev => {
              if (prev.find(ex => ex.name.toLowerCase() === a.name.toLowerCase())) return prev
              return [...prev, a]
            })
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

      {/* Series */}
      <SeriesEntriesEditor entries={seriesEntries} onChange={setSeriesEntries} />

      {/* Omnibus components — admin/moderator only, since attaching components requires that role */}
      {isPrivileged && (
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isOmnibus}
              onChange={e => setIsOmnibus(e.target.checked)}
              className="w-4 h-4 accent-amber-400"
            />
            <span className={LBL}>Is omnibus (contains multiple volumes/titles)</span>
          </label>
          {isOmnibus && (
            <div className="mt-3">
              <StagedComponentsEditor components={stagedComponents} onChange={setStagedComponents} />
            </div>
          )}
        </div>
      )}

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
        pendingFeatureTags={pendingFeatureTags}
        featurePreviewRef={featurePreviewRef}
        editionSlug={createdEditionSlug ?? undefined}
        companies={companies}
        collections={collections}
      />

      <div>
        <label className={LBL}>Variant label</label>
        <input
          type="text"
          value={variantLabel}
          onChange={e => setVariantLabel(e.target.value)}
          placeholder="e.g. White Edition, Overlay Edition, Numbered — leave blank if this isn't a variant"
          className={INP}
        />
        {sourceEditionId && (
          <p className="text-xs text-amber-500/80 mt-1">This will be linked as a variant of the edition you duplicated from.</p>
        )}
      </div>

      <p className="text-xs text-stone-500 italic">If this is an omnibus edition, edit it after creation to set component books.</p>

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || saved} onClick={() => handleStep2()}
          className={saved
            ? 'px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-white transition-colors'
            : BTN_PRIMARY}>
          {saved ? '✓ Added!' : busy ? 'Saving…' : subscriptionSlug ? (existingBookId ? 'Create Edition & Link' : 'Create & Link to Month') : 'Create Edition'}
        </button>
        <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        <button
          type="button"
          disabled={retagging || busy}
          onClick={handleRetag}
          className={retagDone
            ? 'ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-green-900/50 text-green-300 transition-colors'
            : 'ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900/50 text-blue-300 hover:bg-blue-800/50 transition-colors disabled:opacity-50'}
        >
          {retagDone ? '✓ Retagged!' : retagging ? 'Retagging…' : '↺ Retag'}
        </button>
      </div>

      {duplicateEdition && !bypassDuplicate && (
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
            <button
              type="button"
              onClick={() => { setLinkMode('history'); setBypassDuplicate(true); handleStep2(true) }}
              className="px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 text-amber-100 rounded-lg transition-colors"
            >
              Create anyway (re-edition)
            </button>
            <button
              type="button"
              onClick={() => { setLinkMode('variant'); setBypassDuplicate(true); handleStep2(true) }}
              className="px-3 py-1.5 text-xs bg-violet-700 hover:bg-violet-600 text-violet-100 rounded-lg transition-colors"
            >
              Create anyway (variant)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}