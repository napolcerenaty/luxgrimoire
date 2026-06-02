'use client'

import { useState, useRef, useEffect, forwardRef, useImperativeHandle, type Ref } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { PersonPicker, type PersonEntry } from './pickers/PersonPicker'
import { PublisherPicker } from './pickers/PublisherPicker'
import MultiImageUpload from './MultiImageUpload'
import { BTN_PRIMARY, INP, LBL } from '@/lib/adminFormStyles'

// ─── Styles ───────────────────────────────────────────────────────────────────
const BTN_SM = 'px-2 py-1 rounded-lg text-xs font-medium transition-colors'

// Common currencies for book edition subscriptions
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'PLN', 'SGD', 'CHF', 'SEK', 'DKK', 'NOK']

// ─── Types ────────────────────────────────────────────────────────────────────
export type ArtistEntry = { id?: string; name: string; role: string; existing?: boolean }
export type EditionCompany = { id: string; name: string; slug: string; defaultCurrency?: string | null }
export type FeatureTag = {
  id: string
  rawValue: string
  isManual: boolean
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
const CATEGORY_GROUP_ORDER = ['signed', 'edges', 'cover', 'binding', 'extras', 'interior', 'format']

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
    featureTags?: Record<string, string[]>
    /** All feature raw values in source-text order (standalone + artist-attributed) */
    featureOrder?: string[]
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
export const FEATURE_TAGS_QUERY_KEY = (slug: string) => ['edition-feature-tags', slug] as const

export type FeaturePreviewHandle = {
  flushChanges: (slugOverride?: string) => Promise<void>
  getCurrentRawValues: () => string[]
  applyRetagResult: (result: Array<{ rawValue: string; categories: string[] }>) => void
}

// Synthetic ID for tags not yet in DB
const newTagId = (rawValue: string) => `_new_${rawValue}`
const isNewTag = (id: string) => id.startsWith('_new_')

export const FeatureCategoryPreview = forwardRef<FeaturePreviewHandle, {
  editionSlug?: string
  initialTags?: FeatureTag[]
  /** When true, all edits are staged locally and flushed to API via flushChanges() */
  staged?: boolean
  pendingTags?: Array<{ rawValue: string; categories: string[] }>
}>(function FeatureCategoryPreview({ editionSlug, initialTags, staged = false, pendingTags = [] }, ref) {
  const qc = useQueryClient()
  const [editingRow, setEditingRow] = useState<Record<string, { rawValue: string; saving: boolean }>>({})
  const [newRaw, setNewRaw] = useState('')
  const [newCategories, setNewCategories] = useState<string[]>([])
  const [newCategoryPick, setNewCategoryPick] = useState('')
  const [addingNew, setAddingNew] = useState(false)

  // Staged mode: single unified tag list (DB tags + new/pending with synthetic IDs)
  const [localTags, setLocalTags] = useState<FeatureTag[]>(initialTags ?? [])
  const [deletedDbIds, setDeletedDbIds] = useState<Set<string>>(new Set())
  const originalTagsRef = useRef<FeatureTag[]>(initialTags ?? [])

  const startEdit = (tag: FeatureTag) =>
    setEditingRow(prev => ({ ...prev, [tag.id]: { rawValue: tag.rawValue, saving: false } }))
  const cancelEdit = (tagId: string) =>
    setEditingRow(prev => { const n = { ...prev }; delete n[tagId]; return n })

  // React Query fetch — disabled in staged-create mode (no slug yet)
  const { data: dbTags = initialTags ?? [] } = useQuery({
    queryKey: FEATURE_TAGS_QUERY_KEY(editionSlug ?? ''),
    queryFn: () => authFetch<FeatureTag[]>(`/editions/${editionSlug}/feature-tags`),
    initialData: initialTags,
    staleTime: 0,
    enabled: !!editionSlug,
  })

  // Sync DB data into local state once on initial load (staged mode)
  const dbSyncedRef = useRef(false)
  useEffect(() => {
    if (staged && dbTags.length > 0 && !dbSyncedRef.current) {
      setLocalTags(dbTags)
      originalTagsRef.current = dbTags
      dbSyncedRef.current = true
    }
  }, [staged, dbTags])

  // Merge incoming pendingTags into localTags — no visual distinction (same as DB tags)
  const prevPendingRef = useRef<typeof pendingTags>([])
  useEffect(() => {
    if (!staged) return
    const prev = new Set(prevPendingRef.current.map(t => t.rawValue))
    const toAdd = pendingTags.filter(t => !prev.has(t.rawValue))
    prevPendingRef.current = pendingTags
    if (toAdd.length === 0) return
    setLocalTags(cur => {
      const existing = new Set(cur.map(t => t.rawValue))
      const newEntries: FeatureTag[] = toAdd
        .filter(t => !existing.has(t.rawValue))
        .map(t => ({
          id: newTagId(t.rawValue),
          rawValue: t.rawValue,
          isManual: false,
          categories: t.categories.map(slug => ({ id: slug, slug, label: slug, group: '', sortOrder: 0 })),
        }))
      return [...cur, ...newEntries]
    })
  }, [staged, pendingTags])

  const tags = staged ? localTags : dbTags

  const { data: allCategories = [] } = useQuery({
    queryKey: ['feature-categories-all'],
    queryFn: () => authFetch<Array<{ id: string; slug: string; label: string; group: string; sortOrder: number }>>('/feature-categories'),
  })

  const refreshTags = () => {
    if (editionSlug) qc.invalidateQueries({ queryKey: FEATURE_TAGS_QUERY_KEY(editionSlug) })
  }

  // ── Handlers (staged: update local state; live: call API immediately) ────────

  const handleRemoveCategory = async (tagId: string, categorySlug: string) => {
    if (staged) {
      setLocalTags(prev => prev.map(t =>
        t.id === tagId ? { ...t, categories: t.categories.filter(c => c.slug !== categorySlug) } : t
      ))
      return
    }
    try {
      await authFetch<FeatureTag | { deleted: true }>(
        `/editions/${editionSlug}/feature-tags/${tagId}/categories/${categorySlug}`,
        { method: 'DELETE' }
      )
      refreshTags()
    } catch (e) { alert(`Remove failed: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const handleAddTag = async (rawValue: string, categories: string[]) => {
    if (staged) {
      setLocalTags(prev => {
        if (prev.some(t => t.rawValue === rawValue)) return prev
        const catObjs = categories
          .map(slug => allCategories.find(c => c.slug === slug))
          .filter((c): c is NonNullable<typeof c> => !!c)
        return [...prev, { id: newTagId(rawValue), rawValue, isManual: true, categories: catObjs }]
      })
      return
    }
    try {
      await authFetch<FeatureTag>(`/editions/${editionSlug}/feature-tags`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawValue, categories }),
      })
      refreshTags()
    } catch (e) { alert(`Add failed: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const handleAddNewTag = async () => {
    const raw = newRaw.trim()
    if (!raw) return
    setAddingNew(true)
    try {
      await handleAddTag(raw, newCategories)
      setNewRaw(''); setNewCategories([]); setNewCategoryPick('')
    } finally { setAddingNew(false) }
  }

  const handleAddCategoryToTag = async (tagId: string, currentSlugs: string[], newSlug: string) => {
    if (staged) {
      const cat = allCategories.find(c => c.slug === newSlug)
      if (!cat) return
      setLocalTags(prev => prev.map(t =>
        t.id === tagId ? { ...t, categories: [...t.categories, cat] } : t
      ))
      return
    }
    try {
      await authFetch(`/editions/${editionSlug}/feature-tags/${tagId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: [...currentSlugs, newSlug] }),
      })
      refreshTags()
    } catch (e) { alert(`Add category failed: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const handleUpdateTag = async (tagId: string) => {
    const editing = editingRow[tagId]
    if (!editing) return
    if (staged) {
      setLocalTags(prev => prev.map(t => t.id === tagId ? { ...t, rawValue: editing.rawValue } : t))
      cancelEdit(tagId)
      return
    }
    setEditingRow(prev => ({ ...prev, [tagId]: { ...prev[tagId], saving: true } }))
    try {
      await authFetch(`/editions/${editionSlug}/feature-tags/${tagId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawValue: editing.rawValue }),
      })
      refreshTags(); cancelEdit(tagId)
    } catch (e) {
      alert(`Update failed: ${e instanceof Error ? e.message : String(e)}`)
      setEditingRow(prev => ({ ...prev, [tagId]: { ...prev[tagId], saving: false } }))
    }
  }

  const handleDeleteTag = async (tagId: string) => {
    if (staged) {
      setLocalTags(prev => prev.filter(t => t.id !== tagId))
      if (!isNewTag(tagId)) setDeletedDbIds(prev => new Set([...prev, tagId]))
      return
    }
    await authFetch(`/editions/${editionSlug}/feature-tags/${tagId}`, { method: 'DELETE' })
    refreshTags()
  }

  useImperativeHandle(ref, () => ({
    getCurrentRawValues: () => localTags.map(t => t.rawValue),
    applyRetagResult: (result: Array<{ rawValue: string; categories: string[] }>) => {
      setLocalTags(prev => prev.map(tag => {
        const entry = result.find(r => r.rawValue === tag.rawValue)
        if (!entry) return tag
        const resolvedCategories = entry.categories
          .map(slug => allCategories.find(c => c.slug === slug))
          .filter((c): c is NonNullable<typeof c> => !!c)
        return { ...tag, categories: resolvedCategories }
      }))
    },
    flushChanges: async (slugOverride?: string) => {
      const slug = slugOverride ?? editionSlug
      // 1. POST new tags (synthetic IDs — AI-parsed or manually added)
      for (const tag of localTags.filter(t => isNewTag(t.id))) {
        await authFetch(`/editions/${slug}/feature-tags`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawValue: tag.rawValue, categories: tag.categories.map(c => c.slug) }),
        }).catch(() => null)
      }
      // 2. DELETE removed DB tags
      for (const id of deletedDbIds) {
        await authFetch(`/editions/${slug}/feature-tags/${id}`, { method: 'DELETE' }).catch(() => null)
      }
      // 3. PATCH modified DB tags (diff against original)
      const originalById = new Map(originalTagsRef.current.map(t => [t.id, t]))
      for (const tag of localTags.filter(t => !isNewTag(t.id))) {
        const orig = originalById.get(tag.id)
        if (!orig) continue
        const rawChanged = tag.rawValue !== orig.rawValue
        const catsChanged = JSON.stringify(tag.categories.map(c => c.slug).sort()) !==
          JSON.stringify(orig.categories.map(c => c.slug).sort())
        if (rawChanged || catsChanged) {
          await authFetch(`/editions/${slug}/feature-tags/${tag.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(rawChanged && { rawValue: tag.rawValue }),
              ...(catsChanged && { categories: tag.categories.map(c => c.slug) }),
            }),
          }).catch(() => null)
        }
      }
      refreshTags()
    }
  }))

  // ── Row renderer ─────────────────────────────────────────────────────────────
  const renderRow = (tag: FeatureTag) => {
    const { id: tagId, rawValue, categories: rowCategories, isManual } = tag
    const existingSlugs = new Set(rowCategories.map(c => c.slug))
    const available = allCategories.filter(c => !existingSlugs.has(c.slug))
    const editing = editingRow[tagId]

    return (
      <div key={tagId} className="py-2 border-b border-stone-800 last:border-0">
        <div className="flex items-start gap-2 mb-1.5">
          {editing ? (
            <div className="flex-1 flex items-center gap-1.5">
              <input
                autoFocus
                value={editing.rawValue}
                onChange={e => setEditingRow(prev => ({ ...prev, [tagId]: { ...prev[tagId], rawValue: e.target.value } }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleUpdateTag(tagId) }
                  if (e.key === 'Escape') cancelEdit(tagId)
                }}
                className="flex-1 text-xs bg-stone-900 border border-amber-600 rounded px-2 py-0.5 text-stone-100 focus:outline-none"
              />
              <button type="button" disabled={editing.saving}
                onClick={() => handleUpdateTag(tagId)}
                className="shrink-0 text-xs px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40">
                {editing.saving ? '…' : '✓'}
              </button>
              <button type="button" onClick={() => cancelEdit(tagId)}
                className="shrink-0 text-xs text-stone-500 hover:text-stone-300">✕</button>
            </div>
          ) : (
            <div className="flex-1 flex items-start justify-between gap-2 min-w-0">
              <span className="text-xs text-stone-300 leading-snug break-words">{rawValue}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => startEdit(tag)}
                  className="text-[10px] text-stone-500 hover:text-amber-400 px-1" title="Edit">✎</button>
                <button type="button" onClick={() => handleDeleteTag(tagId)}
                  className="text-[10px] text-stone-600 hover:text-red-400 px-1" title="Remove">🗑</button>
              </div>
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex flex-wrap items-center gap-1.5 pl-[4px]">
            {rowCategories
              .map(cat => allCategories.find(c => c.slug === cat.slug) ?? cat)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(cat => (
              <span key={cat.slug}
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                  isManual
                    ? 'bg-amber-900/40 border-amber-700 text-amber-200'
                    : 'bg-stone-700 border-stone-600 text-stone-200'
                }`}>
                {cat.label}
                <button type="button" onClick={() => handleRemoveCategory(tagId, cat.slug)}
                  className="text-stone-500 hover:text-red-400 ml-0.5 leading-none">×</button>
              </span>
            ))}
            {available.length > 0 && (
              <div className="flex items-center gap-1">
                <select value=""
                  onChange={e => { if (e.target.value) handleAddCategoryToTag(tagId, rowCategories.map(c => c.slug), e.target.value) }}
                  className="text-xs bg-stone-800 border border-stone-700 rounded px-1.5 py-0.5 text-stone-300 focus:outline-none focus:border-amber-500 max-w-[180px]">
                  <option value="">+ category…</option>
                  {Object.entries(
                    available.reduce<Record<string, typeof available>>((acc, c) => {
                      const g = c.group || 'Other';
                      (acc[g] = acc[g] ?? []).push(c);
                      return acc;
                    }, {})
                  ).sort(([a], [b]) => {
                    const ai = CATEGORY_GROUP_ORDER.indexOf(a)
                    const bi = CATEGORY_GROUP_ORDER.indexOf(b)
                    if (ai === -1 && bi === -1) return a.localeCompare(b)
                    if (ai === -1) return 1
                    if (bi === -1) return -1
                    return ai - bi
                  }).map(([group, cats]) => (
                    <optgroup key={group} label={group}>
                     {cats.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)).map(c =>
                        <option key={c.slug} value={c.slug}>{c.label}</option>
                      )}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const availableForNew = allCategories.filter(c => !newCategories.includes(c.slug))

  return (
    <div className="mt-3 p-3 bg-stone-800/50 border border-stone-700/50 rounded-lg">
      <div className="mb-2">
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Features with categories</span>
      </div>
      <p className="text-[10px] text-stone-500 mb-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-stone-700 border border-stone-600 mr-1" />auto-detected
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-900/40 border border-amber-700 mr-1 ml-3" />manually set
      </p>

      {tags.length > 0 ? (
        <div className="mb-2">{tags.map(tag => renderRow(tag))}</div>
      ) : (
        <p className="text-xs text-stone-500 italic mb-2">No features yet.</p>
      )}

      {/* Add new feature manually */}
      <div className="mt-3 pt-3 border-t border-stone-700/50">
        <p className="text-[10px] font-semibold uppercase text-stone-500 mb-2">Add feature manually</p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            value={newRaw}
            onChange={e => setNewRaw(e.target.value)}
            placeholder="Raw value (e.g. Foil cover, Sprayed edges…)"
            className="flex-1 min-w-[180px] text-xs bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-stone-200 focus:outline-none focus:border-amber-500 placeholder:text-stone-600"
          />
          <div className="flex flex-col gap-1 min-w-[160px]">
            {newCategories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {newCategories.map(slug => {
                  const cat = allCategories.find(c => c.slug === slug)
                  return (
                    <span key={slug} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 border border-amber-700 text-amber-200">
                      {cat?.label ?? slug}
                      <button type="button" onClick={() => setNewCategories(prev => prev.filter(s => s !== slug))}
                        className="text-amber-500 hover:text-red-400 leading-none">×</button>
                    </span>
                  )
                })}
              </div>
            )}
            {availableForNew.length > 0 && (
              <select value={newCategoryPick}
                onChange={e => { const v = e.target.value; if (v) { setNewCategories(prev => [...prev, v]); setNewCategoryPick('') } }}
                className="text-xs bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-stone-300 focus:outline-none focus:border-amber-500">
                <option value="">+ add category…</option>
                {Object.entries(
                  availableForNew.reduce<Record<string, typeof availableForNew>>((acc, c) => {
                    const g = c.group || 'Other'
                    ;(acc[g] = acc[g] ?? []).push(c)
                    return acc
                  }, {})
                ).sort(([a], [b]) => {
                  const ai = CATEGORY_GROUP_ORDER.indexOf(a)
                  const bi = CATEGORY_GROUP_ORDER.indexOf(b)
                  if (ai === -1 && bi === -1) return a.localeCompare(b)
                  if (ai === -1) return 1
                  if (bi === -1) return -1
                  return ai - bi
                }).map(([group, cats]) => (
                  <optgroup key={group} label={group}>
                  {cats.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)).map(c =>
                      <option key={c.slug} value={c.slug}>{c.label}</option>
                    )}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
          <button type="button" disabled={!newRaw.trim() || addingNew} onClick={handleAddNewTag}
            className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {addingNew ? 'Adding…' : '+ Add'}
          </button>
        </div>
      </div>
    </div>
  )
})

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
  /** Artists / contributors — managed in artist_contributions table */
  artists?: ArtistEntry[]
  onArtistsChange?: (artists: ArtistEntry[]) => void
  /** Called when an existing artist (existing: true) is removed — Edit form uses this to track deleted IDs */
  onRemoveExistingArtist?: (artistId: string) => void
  /** @deprecated Only used by Create form */
  features?: string[]
  /** @deprecated Only used by Create form */
  onFeaturesChange?: (features: string[]) => void
  /** Show omnibus toggle (Edit form only) */
  isOmnibus?: boolean
  onIsOmnibusChange?: (v: boolean) => void
  /** When provided together with isOmnibus=true, renders OmnibusComponentsPanel */
  editionSlug?: string
  /** Existing feature tags from DB — shown in FeatureCategoryPreview (edit form only) */
  featureTags?: FeatureTag[]
  /** AI-parsed feature tags staged for save — merged into FeatureCategoryPreview as regular entries */
  pendingFeatureTags?: Array<{ rawValue: string; categories: string[] }>
  /** Ref to FeatureCategoryPreview for calling flushChanges() on save (staged mode) */
  featurePreviewRef?: Ref<FeaturePreviewHandle>
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
  artists = [], onArtistsChange, onRemoveExistingArtist,
  features = [], onFeaturesChange,
  isOmnibus, onIsOmnibusChange, editionSlug, featureTags,
  pendingFeatureTags, featurePreviewRef,
  companies, collections,
}: EditionFieldsSectionProps) {
  const handleRemoveArtist = (index: number) => {
    const art = artists[index]
    if (art.existing && art.id) {
      onRemoveExistingArtist?.(art.id)
    }
    onArtistsChange?.(artists.filter((_, j) => j !== index))
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
            <select
              value={CURRENCIES.includes(currency) ? currency : ''}
              onChange={e => onCurrencyChange(e.target.value)}
              className="w-24 bg-stone-800 border border-stone-700 rounded-lg px-2 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm"
            >
              {!CURRENCIES.includes(currency) && <option value="">{currency || 'USD'}</option>}
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
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

      {/* Artists / contributors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={LBL}>Artists / contributors</label>
          <button type="button"
            onClick={() => onArtistsChange?.([...artists, { name: '', role: '' }])}
            className={`${BTN_SM} bg-stone-700 text-stone-400 hover:bg-stone-600`}>+ Add artist</button>
        </div>
        {artists.length > 0 && (
          <div className="space-y-2">
            {artists.map((art, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  {art.id ? (
                    <div className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200">
                      {!art.existing && art.id && <span className="text-amber-400 text-[9px] font-semibold uppercase">new</span>}
                      <span className="flex-1">{art.name}</span>
                      <button
                        onClick={() => onArtistsChange?.(artists.map((x, j) => j === i ? { ...x, id: undefined, name: '', existing: false } : x))}
                        className="text-stone-500 hover:text-red-400 text-xs">×</button>
                    </div>
                  ) : art.name ? (
                    <div className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200">
                      {!art.existing && <span className="text-amber-400 text-[9px] font-semibold uppercase">new</span>}
                      <span className="flex-1">{art.name}</span>
                      <button
                        onClick={() => onArtistsChange?.(artists.map((x, j) => j === i ? { ...x, id: undefined, name: '', existing: false } : x))}
                        className="text-stone-500 hover:text-red-400 text-xs">×</button>
                    </div>
                  ) : (
                    <PersonPicker endpoint="artists" placeholder="Search or create artist…"
                      initialQuery={art.name || undefined}
                      onAdd={(a: PersonEntry) => onArtistsChange?.(artists.map((x, j) => j === i ? { ...x, id: a.id, name: a.name } : x))} />
                  )}
                </div>
                <input value={art.role}
                  onChange={e => onArtistsChange?.(artists.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                  placeholder="Role (e.g. cover art, map…)"
                  className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-2 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-xs" />
                <button type="button" onClick={() => handleRemoveArtist(i)}
                  className="mt-2 text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features / Category tags */}
      <div>
        {(editionSlug || featurePreviewRef) && (
          <FeatureCategoryPreview
            ref={featurePreviewRef}
            editionSlug={editionSlug}
            initialTags={featureTags}
            staged={!!featurePreviewRef}
            pendingTags={pendingFeatureTags}
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
