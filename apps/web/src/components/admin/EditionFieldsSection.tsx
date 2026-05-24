'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { PersonPicker, type PersonEntry } from './pickers/PersonPicker'
import { PublisherPicker } from './pickers/PublisherPicker'
import MultiImageUpload from './MultiImageUpload'
import { BTN_PRIMARY, INP, LBL } from '@/lib/adminFormStyles'

// ─── Styles ───────────────────────────────────────────────────────────────────
const BTN_SM = 'px-2 py-1 rounded-lg text-xs font-medium transition-colors'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ArtistEntry = { id?: string; name: string; role: string; existing?: boolean }
export type EditionCompany = { id: string; name: string; slug: string; defaultCurrency?: string | null }
export type FeatureTag = {
  id: string
  rawValue: string
  source: string
  isManual: boolean
  artistId?: string | null
  artistName?: string | null
  categories: Array<{ id: string; slug: string; label: string; group: string; sortOrder: number }>
}

const CATEGORY_GROUP_LABELS: Record<string, string> = {
  cover: 'Cover',
  binding: 'Binding',
  interior: 'Interior',
  signatures: 'Signatures',
  extras: 'Extras',
  format: 'Format',
  edition_type: 'Edition Type',
}
const CATEGORY_GROUP_ORDER = ['edition_type', 'cover', 'binding', 'interior', 'signatures', 'extras', 'format']

const BOOK_LANGUAGES = [
  'English', 'Polish', 'French', 'German', 'Spanish',
  'Italian', 'Portuguese', 'Dutch', 'Czech', 'Hungarian',
  'Romanian', 'Ukrainian', 'Japanese', 'Korean', 'Chinese',
]

export interface AiParseResult {
  book?: {
    title?: string
    description?: string
    authors?: { name: string }[]
    seriesName?: string
    volumeNumber?: number
    genres?: string[]
  }
  edition?: {
    publisher?: string
    price?: number
    currency?: string
    firstAccessDate?: string
    earlyAccessDate?: string
    generalSaleDate?: string
    features?: string[]
    artists?: { name: string; role: string }[]
    artistTags?: Record<string, string[]>
  }
}

// ─── FeatureTags ──────────────────────────────────────────────────────────────
export function FeatureTags({ features, onChange }: { features: string[]; onChange: (v: string[]) => void }) {
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

// ─── AiParseSection ───────────────────────────────────────────────────────────
export function AiParseSection({ onResult, disabled }: {
  onResult: (r: AiParseResult) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)

  const parse = async () => {
    setParsing(true)
    try {
      const payload = { text }
      const result = await authFetch<AiParseResult>('/ai/parse', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      onResult(result)
      setOpen(false)
      setText('')
    } catch (e: unknown) {
      alert(`AI parse failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setParsing(false)
    }
  }

  const canParse = text.trim().length > 10

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
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
            placeholder="Paste social media post, newsletter, or announcement text…"
            className={`${INP} resize-none`} />
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

// ─── OmnibusComponentsPanel ───────────────────────────────────────────────────
type EditionComponent = {
  id: string
  order: number | null
  volumeNumber: number | null
  customTitle: string | null
  book: { title: string } | null
}

function OmnibusComponentsPanel({ editionSlug }: { editionSlug: string }) {
  const qc = useQueryClient()
  const [bookSearch, setBookSearch] = useState('')
  const [selectedBook, setSelectedBook] = useState<{ id: string; title: string } | null>(null)
  const [customTitle, setCustomTitle] = useState('')
  const [volumeNumber, setVolumeNumber] = useState('')
  const [order, setOrder] = useState('')
  const [addError, setAddError] = useState('')

  const { data: components = [], isLoading } = useQuery<EditionComponent[]>({
    queryKey: ['omnibus-components', editionSlug],
    queryFn: () => authFetch<EditionComponent[]>(`/editions/${editionSlug}/components`),
  })

  const { data: bookResults = [] } = useQuery<{ id: string; title: string; slug: string; seriesName: string | null }[]>({
    queryKey: ['book-search', bookSearch],
    queryFn: async () => {
      const res = await authFetch<{ data: { id: string; title: string; slug: string; seriesName: string | null }[] }>(
        `/books?search=${encodeURIComponent(bookSearch)}&pageSize=8`
      )
      return res.data ?? []
    },
    enabled: bookSearch.length >= 2,
  })

  const addMutation = useMutation({
    mutationFn: (payload: {
      bookId?: string
      customTitle?: string
      volumeNumber?: number
      order?: number
    }) => authFetch(`/editions/${editionSlug}/components`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['omnibus-components', editionSlug] })
      setSelectedBook(null)
      setBookSearch('')
      setCustomTitle('')
      setVolumeNumber('')
      setOrder('')
      setAddError('')
    },
    onError: (e: unknown) => setAddError(e instanceof Error ? e.message : String(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (componentId: string) =>
      authFetch(`/editions/${editionSlug}/components/${componentId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['omnibus-components', editionSlug] }),
  })

  const handleAdd = () => {
    if (!selectedBook && !customTitle.trim()) {
      setAddError('Select a book or enter a custom title')
      return
    }
    addMutation.mutate({
      bookId: selectedBook?.id,
      customTitle: !selectedBook && customTitle.trim() ? customTitle.trim() : undefined,
      volumeNumber: volumeNumber ? parseFloat(volumeNumber) : undefined,
      order: order ? parseInt(order, 10) : undefined,
    })
  }

  return (
    <div className="border border-stone-700 rounded-xl p-4 space-y-4 bg-stone-900/50">
      <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">Omnibus Components</p>
      {isLoading ? (
        <p className="text-stone-500 text-xs">Loading…</p>
      ) : components.length === 0 ? (
        <p className="text-stone-500 text-xs">No components yet.</p>
      ) : (
        <div className="space-y-1.5">
          {components.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-sm text-stone-300">
              {c.volumeNumber != null && (
                <span className="text-xs text-amber-600/80 font-semibold w-14 shrink-0">Vol. {c.volumeNumber}</span>
              )}
              <span className="flex-1">
                {c.book ? c.book.title : (c.customTitle ?? '—')}
              </span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(c.id)}
                className={`${BTN_SM} bg-red-900/30 text-red-400 hover:bg-red-900/50`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-stone-700 pt-3 space-y-2">
        <p className="text-xs text-stone-500">Add component</p>
        {!selectedBook ? (
          <div className="relative">
            <input
              value={bookSearch}
              onChange={e => setBookSearch(e.target.value)}
              placeholder="Search book (2+ chars) or leave blank for custom title…"
              className={INP}
            />
            {bookSearch.length >= 2 && bookResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-stone-800 border border-stone-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {bookResults.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => { setSelectedBook({ id: b.id, title: b.title }); setBookSearch('') }}
                    className="w-full text-left px-3 py-2 text-sm text-stone-200 hover:bg-stone-700 transition-colors"
                  >
                    {b.title}
                    {b.seriesName && (
                      <span className="text-stone-400 ml-1">({b.seriesName})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200">
            <span className="flex-1">{selectedBook.title}</span>
            <button type="button" onClick={() => setSelectedBook(null)} className="text-stone-500 hover:text-red-400">×</button>
          </div>
        )}
        {!selectedBook && (
          <input
            value={customTitle}
            onChange={e => setCustomTitle(e.target.value)}
            placeholder="…or custom title"
            className={INP}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LBL}>Volume number</label>
            <input
              value={volumeNumber}
              onChange={e => setVolumeNumber(e.target.value)}
              placeholder="e.g. 1.5"
              type="number"
              step="0.5"
              className={INP}
            />
          </div>
          <div>
            <label className={LBL}>Order (sort)</label>
            <input
              value={order}
              onChange={e => setOrder(e.target.value)}
              placeholder="0"
              type="number"
              min="0"
              className={INP}
            />
          </div>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
        <button
          type="button"
          onClick={handleAdd}
          disabled={addMutation.isPending}
          className={BTN_PRIMARY}
        >
          {addMutation.isPending ? 'Adding…' : '+ Add component'}
        </button>
      </div>
    </div>
  )
}

// ─── FeatureCategoryPreview ───────────────────────────────────────────────────
export function FeatureCategoryPreview({
  editionSlug,
  initialTags,
  featureValues,
  artistEntries,
}: {
  editionSlug: string
  initialTags?: FeatureTag[]
  /** All raw feature strings from the edition */
  featureValues?: string[]
  /** Artist entries (name + role) for source=artist */
  artistEntries?: Array<{ name: string; role: string }>
}) {
  const [tags, setTags] = useState<FeatureTag[]>(initialTags ?? [])
  // Per-row "adding" state: key = `${source}::${rawValue}`, value = picked categorySlug
  const [adding, setAdding] = useState<Record<string, string>>({})
  // New manual entry form
  const [newRaw, setNewRaw] = useState('')
  const [newSource, setNewSource] = useState<'features' | 'artist'>('features')
  const [newCategory, setNewCategory] = useState('')
  const [addingNew, setAddingNew] = useState(false)

  // Fetch all categories for the add-picker
  const { data: allCategoriesData } = useQuery({
    queryKey: ['feature-categories-all'],
    queryFn: () => authFetch<{ data: Array<{ id: string; slug: string; label: string; group: string; sortOrder: number }> }>(
      '/feature-categories?pageSize=200'
    ),
  })
  const allCategories = allCategoriesData?.data ?? []

  const handleRemoveCategory = async (tagId: string, categorySlug: string) => {
    try {
      const res = await authFetch<FeatureTag | { deleted: true }>(
        `/editions/${editionSlug}/feature-tags/${tagId}/categories/${categorySlug}`,
        { method: 'DELETE' }
      )
      setTags(prev => {
        if ('deleted' in res) {
          return prev.filter(t => t.id !== tagId)
        }
        return prev.map(t => t.id === tagId ? res : t)
      })
    } catch (e) {
      alert(`Remove failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleAddTag = async (rawValue: string, source: string, categorySlug: string) => {
    if (!categorySlug) return
    try {
      const res = await authFetch<FeatureTag>(`/editions/${editionSlug}/feature-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawValue, source, categorySlug }),
      })
      setTags(prev => {
        const idx = prev.findIndex(t => t.rawValue === rawValue)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = res
          return updated
        }
        return [...prev, res]
      })
      setAdding(prev => ({ ...prev, [`${source}::${rawValue}`]: '' }))
    } catch (e) {
      alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleAddNewTag = async () => {
    const raw = newRaw.trim()
    if (!raw || !newCategory) return
    setAddingNew(true)
    try {
      await handleAddTag(raw, newSource, newCategory)
      setNewRaw('')
      setNewCategory('')
    } finally {
      setAddingNew(false)
    }
  }

  const tagsByKey = new Map<string, FeatureTag>()
  for (const tag of tags) {
    tagsByKey.set(tag.rawValue, tag)
  }

  const featureSet = new Set<string>(featureValues ?? [])
  for (const tag of tags) {
    if (tag.source === 'features') featureSet.add(tag.rawValue)
  }
  const featureRows = [...featureSet]

  const artistSet = new Map<string, string>()
  for (const a of (artistEntries ?? [])) {
    if (a.role) artistSet.set(a.role, a.name)
  }
  for (const tag of tags) {
    if (tag.source === 'artist' && !artistSet.has(tag.rawValue)) {
      artistSet.set(tag.rawValue, tag.artistName ?? tag.rawValue)
    }
  }

  const renderRow = (rawValue: string, source: string, label?: string) => {
    const tag = tagsByKey.get(rawValue)
    const tagId = tag?.id
    const rowCategories = tag?.categories ?? []
    const isManual = tag?.isManual ?? false
    const addValue = adding[`${source}::${rawValue}`] ?? ''
    const existingSlugs = new Set(rowCategories.map(c => c.slug))
    const available = allCategories.filter(c => !existingSlugs.has(c.slug))

    return (
      <div key={rawValue} className="flex flex-wrap items-start gap-2 py-1.5 border-b border-stone-800 last:border-0">
        <span className="text-xs text-stone-300 min-w-0 flex-1 pt-0.5 truncate" title={rawValue}>
          {label ?? rawValue}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {rowCategories.sort((a, b) => a.sortOrder - b.sortOrder).map(cat => (
            <span key={cat.slug}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                isManual
                  ? 'bg-amber-900/40 border-amber-700 text-amber-200'
                  : 'bg-stone-700 border-stone-600 text-stone-200'
              }`}
              title={isManual ? 'Manually assigned' : 'Auto-detected'}>
              {cat.label}
              {isManual && <span className="text-amber-500 text-[9px]">✎</span>}
              <button type="button" onClick={() => tagId && handleRemoveCategory(tagId, cat.slug)}
                className="text-stone-500 hover:text-red-400 ml-0.5 leading-none">×</button>
            </span>
          ))}
          {available.length > 0 && (
            <div className="flex items-center gap-1">
              <select
                value={addValue}
                onChange={e => setAdding(prev => ({ ...prev, [`${source}::${rawValue}`]: e.target.value }))}
                className="text-xs bg-stone-800 border border-stone-700 rounded px-1.5 py-0.5 text-stone-300 focus:outline-none focus:border-amber-500 max-w-[160px]"
              >
                <option value="">+ category…</option>
                {available.map(c => (
                  <option key={c.slug} value={c.slug}>{c.label}</option>
                ))}
              </select>
              {addValue && (
                <button type="button"
                  onClick={() => handleAddTag(rawValue, source, addValue)}
                  className="text-xs px-1.5 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-500">
                  Add
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 p-3 bg-stone-800/50 border border-stone-700/50 rounded-lg">
      <div className="mb-2">
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Category tags</span>
      </div>
      <p className="text-[10px] text-stone-500 mb-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-stone-700 border border-stone-600 mr-1" />auto-detected
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-900/40 border border-amber-700 mr-1 ml-3" />manually set
      </p>

      {featureRows.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase text-stone-500 mb-1">Features</p>
          {featureRows.map(rv => renderRow(rv, 'features'))}
        </div>
      )}

      {artistSet.size > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase text-stone-500 mb-1">Artist roles</p>
          {[...artistSet.entries()].map(([role, artistName]) =>
            renderRow(role, 'artist', artistName !== role ? `${artistName} — ${role}` : role)
          )}
        </div>
      )}

      {featureRows.length === 0 && artistSet.size === 0 && (
        <p className="text-xs text-stone-500 italic">No features or artists yet.</p>
      )}

      {/* ── Add new tag manually ── */}
      <div className="mt-3 pt-3 border-t border-stone-700/50">
        <p className="text-[10px] font-semibold uppercase text-stone-500 mb-2">Add entry manually</p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            value={newRaw}
            onChange={e => setNewRaw(e.target.value)}
            placeholder="Raw value (e.g. Foil cover, @artist — cover art…)"
            className="flex-1 min-w-[180px] text-xs bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500 placeholder:text-stone-600"
          />
          <select
            value={newSource}
            onChange={e => setNewSource(e.target.value as 'features' | 'artist')}
            className="text-xs bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-stone-300 focus:outline-none focus:border-amber-500"
          >
            <option value="features">Feature</option>
            <option value="artist">Artist role</option>
          </select>
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            className="text-xs bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-stone-300 focus:outline-none focus:border-amber-500 max-w-[160px]"
          >
            <option value="">— category —</option>
            {allCategories.map(c => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!newRaw.trim() || !newCategory || addingNew}
            onClick={handleAddNewTag}
            className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {addingNew ? 'Adding…' : '+ Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EditionFieldsSection ─────────────────────────────────────────────────────
export interface EditionFieldsSectionProps {
  companyId: string
  onCompanyChange: (id: string) => void
  /** Called additionally on company change when the company has a defaultCurrency (Create form) */
  onCompanyChangeCurrency?: (currency: string) => void
  collectionId: string
  onCollectionChange: (id: string) => void
  price: string
  onPriceChange: (v: string) => void
  currency: string
  onCurrencyChange: (v: string) => void
  publisher: string
  onPublisherChange: (v: string) => void
  photoCredit: string
  onPhotoCreditChange: (v: string) => void
  language: string
  onLanguageChange: (v: string) => void
  firstAccessDate: string
  onFirstAccessDateChange: (v: string) => void
  earlyAccessDate: string
  onEarlyAccessDateChange: (v: string) => void
  generalSaleDate: string
  onGeneralSaleDateChange: (v: string) => void
  allImages: string[]
  onImagesChange: (imgs: string[]) => void
  onAiResult: (r: AiParseResult) => void
  artists: ArtistEntry[]
  onArtistsChange: (artists: ArtistEntry[]) => void
  /** Called when an existing artist (existing: true) is removed — Edit form uses this to track deleted IDs */
  onRemoveExistingArtist?: (artistId: string) => void
  features: string[]
  onFeaturesChange: (features: string[]) => void
  /** Show omnibus toggle (Edit form only) */
  isOmnibus?: boolean
  onIsOmnibusChange?: (v: boolean) => void
  /** When provided together with isOmnibus=true, renders OmnibusComponentsPanel */
  editionSlug?: string
  /** Existing feature tags from DB — shown in FeatureCategoryPreview (edit form only) */
  featureTags?: FeatureTag[]
  companies: EditionCompany[]
  collections: { id: string; name: string }[]
}

export function EditionFieldsSection({
  companyId, onCompanyChange, onCompanyChangeCurrency,
  collectionId, onCollectionChange,
  price, onPriceChange, currency, onCurrencyChange,
  publisher, onPublisherChange, photoCredit, onPhotoCreditChange,
  language, onLanguageChange,
  firstAccessDate, onFirstAccessDateChange,
  earlyAccessDate, onEarlyAccessDateChange,
  generalSaleDate, onGeneralSaleDateChange,
  allImages, onImagesChange,
  onAiResult,
  artists, onArtistsChange, onRemoveExistingArtist,
  features, onFeaturesChange,
  isOmnibus, onIsOmnibusChange, editionSlug, featureTags,
  companies, collections,
}: EditionFieldsSectionProps) {
  const handleRemoveArtist = (index: number) => {
    const art = artists[index]
    if (art.existing && art.id) {
      onRemoveExistingArtist?.(art.id)
    }
    onArtistsChange(artists.filter((_, j) => j !== index))
  }

  return (
    <div className="space-y-4">
      {/* Company + price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Company (book box)</label>
          <select value={companyId} onChange={e => {
            const id = e.target.value
            onCompanyChange(id)
            onCollectionChange('')
            if (onCompanyChangeCurrency) {
              const co = companies.find(c => c.id === id)
              if (co?.defaultCurrency) onCompanyChangeCurrency(co.defaultCurrency)
            }
          }} className={INP}>
            <option value="">— none —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LBL}>Price</label>
          <div className="flex gap-2">
            <input value={price} onChange={e => onPriceChange(e.target.value)}
              placeholder="45.99" className={`${INP} flex-1`} />
            <input value={currency} onChange={e => onCurrencyChange(e.target.value.toUpperCase())}
              placeholder="USD" maxLength={3}
              className="w-16 bg-stone-800 border border-stone-700 rounded-lg px-2 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm text-center uppercase" />
          </div>
        </div>
      </div>

      {/* Collection — only shown when company has collections */}
      {companyId && collections.length > 0 && (
        <div>
          <label className={LBL}>Collection (optional)</label>
          <select value={collectionId} onChange={e => onCollectionChange(e.target.value)} className={INP}>
            <option value="">— no collection —</option>
            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Publisher */}
      <div>
        <label className={LBL}>Publisher</label>
        <PublisherPicker value={publisher} onChange={onPublisherChange} />
      </div>

      {/* Language */}
      <div>
        <label className={LBL}>Language</label>
        <select value={language} onChange={e => onLanguageChange(e.target.value)} className={INP}>
          <option value="">— select —</option>
          {BOOK_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={LBL}>First access</label>
          <input type="date" value={firstAccessDate} onChange={e => onFirstAccessDateChange(e.target.value)} className={INP} />
        </div>
        <div>
          <label className={LBL}>Early access</label>
          <input type="date" value={earlyAccessDate} onChange={e => onEarlyAccessDateChange(e.target.value)} className={INP} />
        </div>
        <div>
          <label className={LBL}>General sale</label>
          <input type="date" value={generalSaleDate} onChange={e => onGeneralSaleDateChange(e.target.value)} className={INP} />
        </div>
      </div>

      {/* Photo credit + Images */}
      <div>
        <label className={LBL}>Photo by (IG handle)</label>
        <input value={photoCredit} onChange={e => onPhotoCreditChange(e.target.value)}
          placeholder="@username" className={INP} />
      </div>

      {/* Images */}
      <div>
        <label className={LBL}>Images <span className="text-stone-600 font-normal normal-case tracking-normal">(first image will be the main cover)</span></label>
        <MultiImageUpload
          images={allImages}
          folder="luxgrimoire/editions"
          onChange={onImagesChange}
        />
      </div>

      <AiParseSection onResult={onAiResult} />

      {/* Artists */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={LBL}>Artists / contributors</label>
          <button type="button"
            onClick={() => onArtistsChange([...artists, { name: '', role: '' }])}
            className={`${BTN_SM} bg-stone-700 text-stone-400 hover:bg-stone-600`}>+ Add artist</button>
        </div>
        {artists.length > 0 && (
          <div className="space-y-2">
            {artists.map((art, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  {art.name ? (
                    <div className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200">
                      {!art.existing && <span className="text-amber-400 text-[9px] font-semibold uppercase">new</span>}
                      <span className="flex-1">{art.name}</span>
                      <button
                        onClick={() => onArtistsChange(artists.map((x, j) => j === i ? { ...x, id: undefined, name: '', existing: false } : x))}
                        className="text-stone-500 hover:text-red-400 text-xs">×</button>
                    </div>
                  ) : (
                    <PersonPicker endpoint="artists" placeholder="Search or create artist…"
                      onAdd={(a: PersonEntry) => onArtistsChange(artists.map((x, j) => j === i ? { ...x, id: a.id, name: a.name } : x))} />
                  )}
                </div>
                <input value={art.role}
                  onChange={e => onArtistsChange(artists.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                  placeholder="Role (e.g. cover art, map…)"
                  className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-2 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-xs" />
                <button type="button" onClick={() => handleRemoveArtist(i)}
                  className="mt-2 text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features */}
      <div>
        <label className={LBL}>Features / extras</label>
        <FeatureTags features={features} onChange={onFeaturesChange} />
        {editionSlug && (
          <FeatureCategoryPreview
            editionSlug={editionSlug}
            initialTags={featureTags}
          />
        )}
      </div>

      {/* Omnibus (Edit form only) */}
      {onIsOmnibusChange != null && (
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isOmnibus ?? false}
              onChange={e => onIsOmnibusChange(e.target.checked)}
              className="w-4 h-4 accent-amber-400"
            />
            <span className={LBL}>Is omnibus (contains multiple volumes/titles)</span>
          </label>
        </div>
      )}
      {isOmnibus && editionSlug && <OmnibusComponentsPanel editionSlug={editionSlug} />}
    </div>
  )
}
