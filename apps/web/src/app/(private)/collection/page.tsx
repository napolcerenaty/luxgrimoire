'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch, API_BASE } from '@/lib/authFetch'
import Image from 'next/image'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { useCreateSaleGroup } from '@/hooks/useCreateSaleGroup'
import { getSaleGroups, deleteSaleGroup } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EditionCard } from '@/components/books/EditionCard'
import { Plus, Trash2, BookOpen, ShoppingBag, Tag, X, Pencil, Truck, Search, Check, History, LayoutGrid, List } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import type { ApiSearchResult, ApiSearchEdition } from '@luxgrimoire/shared-types'
import { CURRENCIES, SALE_PLATFORMS } from '@/components/sale/SaleFormFields'
import { useModalState } from '@/hooks/useModalState'

const OWNERSHIP_LABEL: Record<string, string> = {
  OWNED: 'OWN',
  PREORDER: 'PREORDER',
  SHIPPING: 'SHIPPING',
  BORROWED: 'BORROWED',
  LENDED: 'LENDED',
  TO_SELL: 'TO SELL',
  SOLD: 'SOLD',
  GIFTED_AWAY: 'GIFTED AWAY',
}
const fmtStatus = (s: string) => OWNERSHIP_LABEL[s] ?? s.replace(/_/g, ' ').toUpperCase()

interface CollectionEntry {
  id: string
  isWishlist: boolean
  condition: string | null
  acquiredAt: string | null
  ownershipStatus: string
  readingStatus: string
  signatureType: string | null
  trackingNumbers: Array<{ id: string; trackingNumber: string; label: string | null; addedAt: string }>
  isOriginalPrint: boolean
  saleAnnouncementEditionId: string | null
  saleAnnouncementEdition: {
    id: string
    isReprint: boolean
    announcement: { id: string; title: string; generalSaleDate: string | null }
  } | null
  tags: string[]
  subscriptionEntry: {
    subscription: { id: string; name: string; parentSubscriptionId: string | null }
  } | null
  purchaseGroup: {
    id: string; currency: string; purchasedAt: string; totalAmount: number; shippingAmount: number | null
    fromSubscription: boolean; isSecondHand: boolean; sourcePlatform: string | null; _count: { bookEntries: number }
    fees: Array<{ id: string; amount: string; currency: string; date: string }>
    discounts: Array<{ id: string; amount: string; currency: string; date: string }>
    refunds: Array<{ id: string; amount: string; currency: string; date: string }>
  } | null
  edition: {
    id: string
    slug: string
    publisher: string | null
    additionalImages: string[]
    communityPhotoCover?: string | null
    bookBoxCompany: { id: string; name: string; slug: string; brandColors?: string[] | null } | null
    book: {
      id: string
      title: string
      slug: string
      seriesName: string | null
      volumeNumber: number | null
      authors: Array<{ id: string; name: string; slug: string }>
    }
  }
}

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

interface FeeEntry {
  key: number
  templateId: string
  amount: string
  currency: string
}

interface FeeTemplate {
  id: string
  name: string
  category: string | null
  defaultAmount: number | null
  defaultCurrency: string | null
  isActive: boolean
}

interface DiscountEntry { key: number; name: string; amount: string; currency: string }

const ADD_OWNERSHIP_OPTIONS = [
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping' },
  { value: 'OWNED', label: 'Own' },
  { value: 'BORROWED', label: 'Borrowed' },
  { value: 'LENDED', label: 'Lended' },
  { value: 'TO_SELL', label: 'To Sell' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'GIFTED_AWAY', label: 'Gifted Away' },
] as const

interface AddSaleFormProps {
  entries: CollectionEntry[]
  onClose: () => void
  onSuccess: () => void
  saleTitle: string; setSaleTitle: (v: string) => void
  salePlatform: string; setSalePlatform: (v: string) => void
  saleCustomPlatform: string; setSaleCustomPlatform: (v: string) => void
  saleTotalAmount: string; setSaleTotalAmount: (v: string) => void
  saleCurrency: string; setSaleCurrency: (v: string) => void
  saleSoldAt: string; setSaleSoldAt: (v: string) => void
  saleNotes: string; setSaleNotes: (v: string) => void
  saleDistribution: 'EQUAL' | 'CUSTOM'; setSaleDistribution: (v: 'EQUAL' | 'CUSTOM') => void
  saleSelectedEntries: string[]; setSaleSelectedEntries: (v: string[]) => void
  saleCustomAmounts: Record<string, string>; setSaleCustomAmounts: (v: Record<string, string>) => void
  saleBookSearch: string; setSaleBookSearch: (v: string) => void
}

function AddSaleForm({
  entries, onSuccess,
  saleTitle, setSaleTitle,
  salePlatform, setSalePlatform,
  saleCustomPlatform, setSaleCustomPlatform,
  saleTotalAmount, setSaleTotalAmount,
  saleCurrency, setSaleCurrency,
  saleSoldAt, setSaleSoldAt,
  saleNotes, setSaleNotes,
  saleDistribution, setSaleDistribution,
  saleSelectedEntries, setSaleSelectedEntries,
  saleCustomAmounts, setSaleCustomAmounts,
  saleBookSearch, setSaleBookSearch,
}: AddSaleFormProps) {
  const createSaleMutation = useCreateSaleGroup()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  const total = parseDecimalInput(saleTotalAmount)
  const count = saleSelectedEntries.length
  const perBook = count > 0 ? (total / count).toFixed(2) : '0.00'

  const filteredEntries = entries.filter(e =>
    e.edition.book.title.toLowerCase().includes(saleBookSearch.toLowerCase())
  )

  // Always show selected entries + up to 20 non-selected when search is empty
  const MAX_VISIBLE = 20
  const visibleEntries = useMemo(() => {
    const selected = filteredEntries.filter(e => saleSelectedEntries.includes(e.id))
    const unselected = filteredEntries.filter(e => !saleSelectedEntries.includes(e.id))
    const cappedUnselected = saleBookSearch ? unselected : unselected.slice(0, MAX_VISIBLE)
    return [...selected, ...cappedUnselected]
  }, [filteredEntries, saleSelectedEntries, saleBookSearch])

  const hiddenCount = saleBookSearch ? 0 : Math.max(0, filteredEntries.filter(e => !saleSelectedEntries.includes(e.id)).length - MAX_VISIBLE)

  const toggleEntry = (id: string) => {
    setSaleSelectedEntries(
      saleSelectedEntries.includes(id)
        ? saleSelectedEntries.filter(x => x !== id)
        : [...saleSelectedEntries, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (saleSelectedEntries.length === 0) { setError('Select at least one book'); return }
    if (!saleTotalAmount || total <= 0) { setError('Enter a valid total amount'); return }
    if (!saleSoldAt) { setError('Enter the sale date'); return }
    const platform = salePlatform === 'other' ? saleCustomPlatform : salePlatform

    const customAmounts: Record<string, number> | undefined =
      saleDistribution === 'CUSTOM'
        ? Object.fromEntries(Object.entries(saleCustomAmounts).map(([k, v]) => [k, parseDecimalInput(v)]))
        : undefined

    setPending(true)
    try {
      await createSaleMutation.mutateAsync({
        entryIds: saleSelectedEntries,
        title: saleTitle || undefined,
        platform: platform || undefined,
        totalAmount: total,
        currency: saleCurrency,
        soldAt: saleSoldAt,
        notes: saleNotes || undefined,
        priceDistribution: saleDistribution,
        customAmounts,
      })
      setSuccess(true)
      setTimeout(onSuccess, 1200)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">✓</div>
        <p className="text-green-400 font-semibold">Sale recorded!</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <label className={LBL}>Sale title (optional)</label>
        <input className={INP} value={saleTitle} onChange={e => setSaleTitle(e.target.value)} placeholder="e.g. The Broken Binding series set" />
      </div>

      <div>
        <label className={LBL}>Platform</label>
        <select className={INP} value={salePlatform} onChange={e => setSalePlatform(e.target.value)}>
          <option value="">— Select platform —</option>
          {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {salePlatform === 'other' && (
          <input className={`${INP} mt-2`} value={saleCustomPlatform} onChange={e => setSaleCustomPlatform(e.target.value)} placeholder="Platform name…" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LBL}>Total sold for *</label>
          <input required type="number" step="0.01" min="0.01" className={INP} value={saleTotalAmount} onChange={e => setSaleTotalAmount(e.target.value)} />
        </div>
        <div>
          <label className={LBL}>Currency</label>
          <select className={INP} value={saleCurrency} onChange={e => setSaleCurrency(e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={LBL}>Sale date *</label>
        <input required type="date" className={INP} value={saleSoldAt} onChange={e => setSaleSoldAt(e.target.value)} />
      </div>

      <div>
        <label className={LBL}>Notes</label>
        <input className={INP} value={saleNotes} onChange={e => setSaleNotes(e.target.value)} placeholder="Any notes…" />
      </div>

      {/* Book selector */}
      <div>
        <label className={LBL}>Books *</label>
        <input className={`${INP} mb-2`} value={saleBookSearch} onChange={e => setSaleBookSearch(e.target.value)} placeholder="Filter by title…" />
        <div className="max-h-44 overflow-y-auto border border-stone-700 rounded-lg divide-y divide-stone-800">
          {visibleEntries.length === 0 && (
            <p className="text-stone-500 text-sm px-3 py-2">No books found</p>
          )}
          {visibleEntries.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => toggleEntry(e.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                saleSelectedEntries.includes(e.id) ? 'bg-amber-500/10 text-amber-400' : 'text-stone-300 hover:bg-stone-800'
              }`}
            >
              <span className="w-4 h-4 border rounded flex items-center justify-center text-xs shrink-0 border-stone-600">
                {saleSelectedEntries.includes(e.id) ? '✓' : ''}
              </span>
              <span className="flex-1 truncate">{e.edition.book.title}</span>
              {e.purchaseGroup && (
                <span className="text-stone-500 text-xs shrink-0">
                  {(Number(e.purchaseGroup.totalAmount) + Number(e.purchaseGroup.shippingAmount ?? 0)).toFixed(2)} {e.purchaseGroup.currency}
                </span>
              )}
            </button>
          ))}
          {hiddenCount > 0 && (
            <p className="text-stone-600 text-xs px-3 py-2 italic">+{hiddenCount} more — type to search</p>
          )}
        </div>
        {count > 0 && <p className="text-xs text-stone-500 mt-1">{count} book{count !== 1 ? 's' : ''} selected</p>}
      </div>

      {/* Price distribution — only relevant for multi-book sales */}
      {count > 1 && total > 0 && (
        <div>
          <label className={LBL}>Price split</label>
          <div className="flex gap-2">
            {(['EQUAL', 'CUSTOM'] as const).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setSaleDistribution(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  saleDistribution === d ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'border-stone-700 text-stone-400 hover:border-stone-500'
                }`}
              >
                {d === 'EQUAL' ? 'Equal' : 'Custom per book'}
              </button>
            ))}
          </div>
          {saleDistribution === 'EQUAL' && count > 0 && (
            <p className="text-xs text-stone-400 mt-1">{perBook} {saleCurrency} per book</p>
          )}
          {saleDistribution === 'CUSTOM' && (
            <div className="mt-2 flex flex-col gap-2">
              {saleSelectedEntries.map(eid => {
                const entry = entries.find(e => e.id === eid)
                if (!entry) return null
                return (
                  <div key={eid} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-stone-300 truncate">{entry.edition.book.title}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-24 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-stone-100"
                      value={saleCustomAmounts[eid] ?? ''}
                      onChange={e => setSaleCustomAmounts({ ...saleCustomAmounts, [eid]: e.target.value })}
                      placeholder="0.00"
                    />
                    <span className="text-xs text-stone-500">{saleCurrency}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Record Sale'}
      </button>
    </form>
  )
}

interface CollectionStats {
  totalOwned: number
  totalWishlist?: number
}

// ── Tag Editor ─────────────────────────────────────────────────────────────
function TagEditor({
  entryId,
  editionId,
  tags,
  allTags,
  onSaved,
}: {
  entryId: string
  editionId: string
  tags: string[]
  allTags: string[]
  onSaved: (editionId: string, tags: string[]) => void
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [localTags, setLocalTags] = useState<string[]>(tags)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep local in sync when parent re-queries
  useEffect(() => { setLocalTags(tags) }, [tags])

  const suggestions = useMemo(() => {
    if (!input.trim()) return allTags.filter(t => !localTags.includes(t))
    return allTags.filter(t => t.toLowerCase().includes(input.toLowerCase()) && !localTags.includes(t))
  }, [input, allTags, localTags])

  const save = useCallback(async (nextTags: string[]) => {
    setLocalTags(nextTags)
    const saved = await authFetch<string[]>(`/collection/entry/${entryId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags: nextTags }),
    })
    onSaved(entryId, saved)
  }, [entryId, onSaved])

  const addTag = (tag: string) => {
    const t = tag.trim()
    if (!t || localTags.includes(t)) return
    void save([...localTags, t])
    setInput('')
  }

  const removeTag = (tag: string) => {
    void save(localTags.filter(t => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="mt-1.5" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
      {/* Existing tag chips */}
      {localTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {localTags.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-full"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="ml-0.5 hover:text-red-400 transition-colors"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add tag trigger */}
      {open ? (
        <div className="relative">
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add tag…"
            className="w-full bg-stone-800 border border-amber-500/40 rounded-lg px-2 py-1 text-[11px] text-stone-100 placeholder:text-stone-600 focus:outline-none"
          />
          {(suggestions.length > 0 || input.trim()) && (
            <div className="absolute top-full left-0 right-0 mt-0.5 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden max-h-32 overflow-y-auto">
              {input.trim() && !localTags.includes(input.trim()) && !suggestions.includes(input.trim()) && (
                <button
                  type="button"
                  onClick={() => addTag(input)}
                  className="w-full text-left text-[11px] px-2.5 py-1.5 hover:bg-stone-800 text-amber-400 transition-colors"
                >
                  + Add &ldquo;{input.trim()}&rdquo;
                </button>
              )}
              {suggestions.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className="w-full text-left text-[11px] px-2.5 py-1.5 hover:bg-stone-800 text-stone-300 transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[10px] text-stone-600 hover:text-amber-400 transition-colors"
        >
          <Tag size={10} />
          {localTags.length === 0 ? 'Add tag' : 'Edit tags'}
        </button>
      )}
    </div>
  )
}
// ───────────────────────────────────────────────────────────────────────────

const CONDITION_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  MINT: 'success',
  NEAR_MINT: 'success',
  FINE: 'default',
  VERY_GOOD: 'default',
  GOOD: 'warning',
  FAIR: 'warning',
  POOR: 'destructive',
}

type FilterMode = 'ALL' | 'BOOK' | 'SERIES' | 'YEAR' | 'AUTHOR' | 'COMPANY'
type SortOrder = 'DATE_DESC' | 'DATE_ASC'
type ViewMode = 'grid' | 'list'

const COLLECTION_PREFS_KEY = 'collection_prefs'
function loadPrefs(): { filter: FilterMode; sortOrder: SortOrder; viewMode: ViewMode } {
  if (typeof window === 'undefined') return { filter: 'ALL', sortOrder: 'DATE_DESC', viewMode: 'grid' }
  try {
    const raw = localStorage.getItem(COLLECTION_PREFS_KEY)
    if (!raw) return { filter: 'ALL', sortOrder: 'DATE_DESC', viewMode: 'grid' }
    const parsed = JSON.parse(raw)
    return {
      filter: parsed.filter ?? 'ALL',
      sortOrder: parsed.sortOrder ?? 'DATE_DESC',
      viewMode: parsed.viewMode ?? 'grid',
    }
  } catch {
    return { filter: 'ALL', sortOrder: 'DATE_DESC', viewMode: 'grid' }
  }
}
function savePrefs(prefs: { filter: FilterMode; sortOrder: SortOrder; viewMode: ViewMode }) {
  try { localStorage.setItem(COLLECTION_PREFS_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}

export default function CollectionPage() {
  const queryClient = useQueryClient()
  const getBrandColors = useBrandColors()
  const { user } = useAuth()
  const [filter, setFilter] = useState<FilterMode>(() => loadPrefs().filter)
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => loadPrefs().sortOrder)
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadPrefs().viewMode)
  const [bookFilter, setBookFilter] = useState('')
  const [sigFilter, setSigFilter] = useState<'ALL' | 'UNSIGNED' | 'SIGNED' | 'AUTOPEN' | 'DIGITALLY_SIGNED' | 'SIGNED_BOOKPLATE' | 'STAMPED'>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [companyFilter, setCompanyFilter] = useState<string>('ALL')
  const [tagFilter, setTagFilter] = useState<string>('ALL')
  const [readingFilter, setReadingFilter] = useState<'ALL' | 'UNREAD' | 'READING' | 'READ' | 'DNF'>('ALL')
  const [subFilter, setSubFilter] = useState<string>('ALL')
  const { isOpen: addModalOpen, setIsOpen: setAddModalOpen } = useModalState()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [conversionRates, setConversionRates] = useState<Record<string, number>>({})
  // Local tag state per editionId (updated optimistically after saves)
  const [tagOverrides, setTagOverrides] = useState<Record<string, string[]>>({})
  // Paginated collection accumulation
  // Initialize from React Query cache so back-navigation doesn't flash an empty list
  const [allEntries, setAllEntries] = useState<CollectionEntry[]>(() => {
    const cached = queryClient.getQueryData<CollectionEntry[]>(['collection', false])
    return cached ?? []
  })
  const [collectionTotal, setCollectionTotal] = useState(0)
  const [collectionPage, setCollectionPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  // Close dropdowns on outside click (but not when clicking inside a dropdown)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-dropdown]')) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Persist view preferences to localStorage
  useEffect(() => {
    savePrefs({ filter, sortOrder, viewMode })
  }, [filter, sortOrder, viewMode])

  const { isLoading: entriesLoading } = useQuery({
    queryKey: ['collection', false],
    queryFn: async () => {
      const r = await authFetch<{ data: CollectionEntry[]; total: number }>('/collection?isWishlist=false&pageSize=100')
      setAllEntries(r.data)
      setCollectionTotal(r.total)
      setCollectionPage(1)
      return r.data
    },
  })
  const entries = allEntries

  const loadMoreCollection = async () => {
    setLoadingMore(true)
    try {
      const nextPage = collectionPage + 1
      const r = await authFetch<{ data: CollectionEntry[]; total: number }>(
        `/collection?isWishlist=false&pageSize=100&page=${nextPage}`
      )
      setAllEntries((prev) => [...prev, ...r.data])
      setCollectionTotal(r.total)
      setCollectionPage(nextPage)
    } finally {
      setLoadingMore(false)
    }
  }

  const { data: allUserTags = [] } = useQuery({
    queryKey: ['collection-tags'],
    queryFn: () => authFetch<string[]>('/collection/tags'),
  })

  const { data: stats } = useQuery({
    queryKey: ['collection-stats'],
    queryFn: () => authFetch<CollectionStats>('/collection/stats'),
  })

  const { data: saleGroups = [] } = useQuery({
    queryKey: ['sale-groups'],
    queryFn: getSaleGroups,
  })

  // Called by TagEditor when tags are saved — update local override + re-fetch allUserTags
  const handleTagsSaved = useCallback((entryId: string, tags: string[]) => {
    setTagOverrides(prev => ({ ...prev, [entryId]: tags }))
    void queryClient.invalidateQueries({ queryKey: ['collection-tags'] })
  }, [queryClient])

  const [addSaleOpen, setAddSaleOpen] = useState(false)
  // Track shipment modal
  const [trackEntry, setTrackEntry] = useState<{ id: string; trackingNumbers: Array<{ id: string; trackingNumber: string; label: string | null }> } | null>(null)
  const [trackingInput, setTrackingInput] = useState('')
  const [trackingLabelInput, setTrackingLabelInput] = useState('')
  const [showAddTracking, setShowAddTracking] = useState(false)
  // Ownership history modal
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<{ id: string; status: string; changedAt: string }[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyEditId, setHistoryEditId] = useState<string | null>(null)
  const [historyEditStatus, setHistoryEditStatus] = useState('')
  const [historyEditDate, setHistoryEditDate] = useState('')
  const [saleTitle, setSaleTitle] = useState('')
  const [salePlatform, setSalePlatform] = useState('')
  const [saleCustomPlatform, setSaleCustomPlatform] = useState('')
  const [saleTotalAmount, setSaleTotalAmount] = useState('')
  const [saleCurrency, setSaleCurrency] = useState('GBP')
  const [saleSoldAt, setSaleSoldAt] = useState('')
  const [saleNotes, setSaleNotes] = useState('')
  const [saleDistribution, setSaleDistribution] = useState<'EQUAL' | 'CUSTOM'>('EQUAL')
  const [saleSelectedEntries, setSaleSelectedEntries] = useState<string[]>([])
  const [saleCustomAmounts, setSaleCustomAmounts] = useState<Record<string, string>>({})
  const [saleBookSearch, setSaleBookSearch] = useState('')

  function openRecordSale(entryId: string, currency: string) {
    setSaleTitle('')
    setSalePlatform('')
    setSaleCustomPlatform('')
    setSaleTotalAmount('')
    setSaleCurrency(currency)
    setSaleSoldAt('')
    setSaleNotes('')
    setSaleDistribution('EQUAL')
    setSaleSelectedEntries([entryId])
    setSaleCustomAmounts({})
    setSaleBookSearch('')
    setAddSaleOpen(true)
  }

  const deleteSaleMut = useMutation({
    mutationFn: (id: string) => deleteSaleGroup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sale-groups'] }),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/collection/${id}`, { method: 'DELETE' }),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['collection'] })
      const previous = queryClient.getQueryData<CollectionEntry[]>(['collection', false])
      const previousAll = allEntries
      queryClient.setQueryData<CollectionEntry[]>(['collection', false], (old) =>
        old ? old.filter((e) => e.id !== id) : []
      )
      setAllEntries((prev) => prev.filter((e) => e.id !== id))
      return { previous, previousAll }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['collection', false], context.previous)
      }
      if (context?.previousAll) {
        setAllEntries(context.previousAll)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] })
      void queryClient.invalidateQueries({ queryKey: ['collection-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['spending-stats-v2'] })
    },
  })

  // Fetch currency conversion rates for entries with purchase groups
  // Includes: pgCur→dc (display), feeCur→pgCur, discountCur→pgCur, refundCur→pgCur
  useEffect(() => {
    const defaultCurrency = user?.preferredCurrency
    if (!defaultCurrency || entries.length === 0) return
    const combos = new Set<string>()
    for (const e of entries) {
      if (!e.purchaseGroup) continue
      const pg = e.purchaseGroup
      const pgCur = pg.currency
      const pgDate = pg.purchasedAt.slice(0, 10)
      // pgCur → defaultCurrency (for display conversion)
      if (pgCur !== defaultCurrency) {
        combos.add(`${pgCur}:${defaultCurrency}:${pgDate}`)
      }
      // fee/discount/refund currencies → pgCur (to normalize into purchase currency)
      for (const fee of pg.fees ?? []) {
        if (fee.currency !== pgCur) {
          combos.add(`${fee.currency}:${pgCur}:${fee.date?.slice(0, 10) ?? pgDate}`)
        }
      }
      for (const discount of pg.discounts ?? []) {
        if (discount.currency !== pgCur) {
          combos.add(`${discount.currency}:${pgCur}:${discount.date?.slice(0, 10) ?? pgDate}`)
        }
      }
      for (const refund of pg.refunds ?? []) {
        if (refund.currency !== pgCur) {
          combos.add(`${refund.currency}:${pgCur}:${refund.date?.slice(0, 10) ?? pgDate}`)
        }
      }
    }
    if (combos.size === 0) return
    void Promise.all(
      Array.from(combos).map(async (key) => {
        const [from, to, date] = key.split(':')
        try {
          const res = await authFetch<{ rate: number }>(`/currency/rate?from=${from}&to=${to}&date=${date}`)
          return [key, res.rate] as [string, number]
        } catch {
          return null
        }
      })
    ).then((results) => {
      const map: Record<string, number> = {}
      for (const r of results) {
        if (r) map[r[0]] = r[1]
      }
      setConversionRates(map)
    })
  }, [entries, user?.preferredCurrency])

  const companies = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      if (e.edition.bookBoxCompany?.name) set.add(e.edition.bookBoxCompany.name)
    }
    return Array.from(set).sort()
  }, [entries])

  const { data: subscriptions = [] } = useQuery<{ id: string; name: string; parentSubscriptionId: string | null }[]>({
    queryKey: ['collection-subscriptions'],
    queryFn: () => authFetch('/collection/subscriptions'),
  })
  // Show child subs only (specific tiers); fall back to all if none have a parent
  const subFilterOptions = subscriptions.some(s => s.parentSubscriptionId !== null)
    ? subscriptions.filter(s => s.parentSubscriptionId !== null)
    : subscriptions

  const filtered = entries.filter((e) => {
    if (e.ownershipStatus === 'SOLD') return false
    if (bookFilter && !e.edition.book.title.toLowerCase().includes(bookFilter.toLowerCase())) return false
    if (sigFilter === 'UNSIGNED' && e.signatureType) return false
    if (sigFilter === 'SIGNED' && e.signatureType !== 'signed') return false
    if (sigFilter === 'AUTOPEN' && e.signatureType !== 'autopen') return false
    if (sigFilter === 'DIGITALLY_SIGNED' && e.signatureType !== 'digitally_signed') return false
    if (sigFilter === 'SIGNED_BOOKPLATE' && e.signatureType !== 'signed_bookplate') return false
    if (sigFilter === 'STAMPED' && e.signatureType !== 'stamped') return false
    if (statusFilter !== 'ALL' && e.ownershipStatus !== statusFilter) return false
    if (companyFilter !== 'ALL' && e.edition.bookBoxCompany?.name !== companyFilter) return false
    if (tagFilter !== 'ALL') {
      const entryTags = e.edition?.id ? (tagOverrides[e.edition.id] ?? e.tags) : e.tags
      if (!entryTags.includes(tagFilter)) return false
    }
    if (readingFilter !== 'ALL' && e.readingStatus !== readingFilter) return false
    if (subFilter !== 'ALL') {
      const sub = e.subscriptionEntry?.subscription
      if (!sub || sub.id !== subFilter) return false
    }
    if (filter === 'SERIES') return !!e.edition.book.seriesName
    if (filter === 'YEAR') return !!(e.purchaseGroup?.purchasedAt ?? e.acquiredAt)
    return true
  })

  const grouped: CollectionEntry[][] = (() => {
    // Apply sort first
    const sortDate = (e: CollectionEntry) => e.purchaseGroup?.purchasedAt ?? e.acquiredAt ?? ''
    const sorted = [...filtered].sort((a, b) => {
      const da = sortDate(a), db = sortDate(b)
      return sortOrder === 'DATE_DESC' ? db.localeCompare(da) : da.localeCompare(db)
    })

    if (filter === 'BOOK') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of sorted) {
        const key = e.edition.book.id
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.values()).sort((a, b) => b.length - a.length)
    }
    if (filter === 'SERIES') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of sorted) {
        const key = e.edition.book.seriesName ?? 'Standalone'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.values())
    }
    if (filter === 'YEAR') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of sorted) {
        const dateStr = e.purchaseGroup?.purchasedAt ?? e.acquiredAt
        const key = dateStr ? new Date(dateStr).getFullYear().toString() : 'Unknown'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([, v]) => v)
    }
    if (filter === 'AUTHOR') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of sorted) {
        const authors = e.edition.book.authors as any[]
        const key = authors.length > 0 ? authors.map(a => (a.author ?? a).name).join(', ') : 'Unknown Author'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, v]) => v)
    }
    if (filter === 'COMPANY') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of sorted) {
        const key = e.edition.bookBoxCompany?.name ?? 'Unknown Company'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, v]) => v)
    }
    return [sorted]
  })()

  if (entriesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-stone-400 animate-pulse">Loading collection…</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-start min-[480px]:justify-between gap-3 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">My Collection</h1>
          <p className="text-stone-400 text-sm mt-1">Your physical book library</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-stone-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 hover:text-stone-300 bg-stone-900'}`}
              aria-label="Grid view"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 border-l border-stone-700 transition-colors ${viewMode === 'list' ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 hover:text-stone-300 bg-stone-900'}`}
              aria-label="List view"
            >
              <List size={15} />
            </button>
          </div>
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-3 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={16} />
            Add Book
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Total Owned</p>
          <p className="text-2xl font-serif font-bold text-amber-400">{entries.filter(e => e.ownershipStatus !== 'SOLD').length}</p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Series</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {new Set(entries.filter(e => e.ownershipStatus !== 'SOLD').map((e) => e.edition.book.seriesName).filter(Boolean)).size}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Authors</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {new Set(entries.filter(e => e.ownershipStatus !== 'SOLD').flatMap((e) => e.edition.book.authors.map((a) => (a as any).author?.id ?? a.id))).size}
          </p>
        </div>
      </div>

      {/* Books */}
      <>
        {/* Search + Filters — all inline */}
          <div className="flex gap-2 flex-wrap items-center mb-6">
            <input
              type="text"
              value={bookFilter}
              onChange={e => setBookFilter(e.target.value)}
              placeholder="Search by title…"
              className="bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-1.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors min-w-[160px]"
            />

            {/* Group by */}
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as FilterMode)}
              className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-amber-400 transition-colors cursor-pointer ${filter !== 'ALL' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
            >
              <option value="ALL">Group: All</option>
              <option value="BOOK">Group: By Book</option>
              <option value="SERIES">Group: By Series</option>
              <option value="YEAR">Group: By Year</option>
              <option value="AUTHOR">Group: By Author</option>
              <option value="COMPANY">Group: By Company</option>
            </select>

            {/* Sort order */}
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as SortOrder)}
              className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-amber-400 transition-colors cursor-pointer ${sortOrder !== 'DATE_DESC' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
            >
              <option value="DATE_DESC">Sort: Newest first</option>
              <option value="DATE_ASC">Sort: Oldest first</option>
            </select>

            {/* Signature */}
            <select
              value={sigFilter}
              onChange={e => setSigFilter(e.target.value as typeof sigFilter)}
              className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-purple-400 transition-colors cursor-pointer ${sigFilter !== 'ALL' ? 'text-purple-400 border-purple-500/30 bg-purple-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
            >
              <option value="ALL">Signature: Any</option>
              <option value="UNSIGNED">Unsigned</option>
              <option value="SIGNED">✍️ Signed</option>
              <option value="AUTOPEN">✒️ Autopen</option>
              <option value="DIGITALLY_SIGNED">🖨️ Digitally Signed</option>
              <option value="SIGNED_BOOKPLATE">🏷️ Signed Bookplate</option>
              <option value="STAMPED">🕹️ Stamped</option>
            </select>

            {/* Ownership status */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-blue-400 transition-colors cursor-pointer ${statusFilter !== 'ALL' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
            >
              <option value="ALL">Status: Any</option>
              <option value="PREORDER">Preorder</option>
              <option value="SHIPPING">Shipping</option>
              <option value="OWNED">Own</option>
              <option value="BORROWED">Borrowed</option>
              <option value="LENDED">Lended</option>
              <option value="TO_SELL">To Sell</option>
              <option value="GIFTED_AWAY">Gifted Away</option>
            </select>

            {/* Company */}
            {companies.length > 0 && (
              <select
                value={companyFilter}
                onChange={e => setCompanyFilter(e.target.value)}
                className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-amber-400 transition-colors cursor-pointer ${companyFilter !== 'ALL' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
              >
                <option value="ALL">Box: Any</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {/* Tag filter */}
            {allUserTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={e => setTagFilter(e.target.value)}
                className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-amber-400 transition-colors cursor-pointer ${tagFilter !== 'ALL' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
              >
                <option value="ALL">Tag: Any</option>
                {allUserTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

            {/* Reading status filter */}
            <select
              value={readingFilter}
              onChange={e => setReadingFilter(e.target.value as typeof readingFilter)}
              className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-green-400 transition-colors cursor-pointer ${readingFilter !== 'ALL' ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
            >
              <option value="ALL">Read: Any</option>
              <option value="UNREAD">📚 Unread</option>
              <option value="READING">📖 Reading</option>
              <option value="READ">✅ Read</option>
              <option value="DNF">❌ DNF</option>
            </select>

            {/* Subscription filter */}
            {subFilterOptions.length > 0 && (
              <select
                value={subFilter}
                onChange={e => setSubFilter(e.target.value)}
                className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-purple-400 transition-colors cursor-pointer ${subFilter !== 'ALL' ? 'text-purple-400 border-purple-500/30 bg-purple-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
              >
                <option value="ALL">Sub: Any</option>
                {subFilterOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}

            {/* Reset all */}
            {(sigFilter !== 'ALL' || statusFilter !== 'ALL' || companyFilter !== 'ALL' || tagFilter !== 'ALL' || readingFilter !== 'ALL' || subFilter !== 'ALL' || filter !== 'ALL' || bookFilter) && (
              <button
                type="button"
                onClick={() => { setSigFilter('ALL'); setStatusFilter('ALL'); setCompanyFilter('ALL'); setTagFilter('ALL'); setReadingFilter('ALL'); setSubFilter('ALL'); setFilter('ALL'); setBookFilter('') }}
                className="px-3 py-1.5 rounded-lg text-xs text-stone-500 border border-stone-700 hover:text-red-400 hover:border-red-700/50 transition-colors"
              >
                ✕ Clear
              </button>
            )}

            <span className="text-xs text-stone-600 ml-auto">
              {filtered.length}/{collectionTotal || entries.length}
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-500">
              <BookOpen size={48} className="mb-4 opacity-30" />
              <p className="font-serif text-lg">Your collection is empty</p>
              <p className="text-sm mt-1">Start adding books you own</p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map((group, gi) => {
                const groupLabel =
                  filter === 'BOOK'
                    ? (group[0]?.edition.book.title ?? null)
                    : filter === 'SERIES'
                    ? (group[0]?.edition.book.seriesName ?? 'Standalone')
                    : filter === 'YEAR'
                      ? (() => {
                          const d = group[0]?.purchaseGroup?.purchasedAt ?? group[0]?.acquiredAt
                          return d ? new Date(d).getFullYear().toString() : 'Unknown'
                        })()
                    : filter === 'AUTHOR'
                      ? ((group[0]?.edition.book.authors as any[]).map(a => (a.author ?? a).name).join(', ') || 'Unknown Author')
                    : filter === 'COMPANY'
                      ? (group[0]?.edition.bookBoxCompany?.name ?? 'Unknown Company')
                    : null

                return (
                  <div key={gi}>
                    {groupLabel && (
                      <h2 className="text-lg font-serif font-semibold text-stone-300 mb-4 border-b border-stone-800 pb-2 flex items-center gap-2">
                        {filter === 'BOOK' && group[0] && (
                          <a href={`/books/${group[0].edition.book.slug}`} className="hover:text-amber-400 transition-colors">
                            {groupLabel}
                          </a>
                        )}
                        {filter === 'AUTHOR' && group[0] && (
                          <a href={`/authors/${((group[0].edition.book.authors[0] as any)?.author ?? group[0].edition.book.authors[0])?.slug}`} className="hover:text-amber-400 transition-colors">
                            {groupLabel}
                          </a>
                        )}
                        {filter === 'COMPANY' && group[0]?.edition.bookBoxCompany && (
                          <a href={`/book-boxes/${group[0].edition.bookBoxCompany.slug}`} className="hover:text-amber-400 transition-colors">
                            {groupLabel}
                          </a>
                        )}
                        {(filter === 'SERIES' || filter === 'YEAR' || (filter === 'COMPANY' && !group[0]?.edition.bookBoxCompany)) && groupLabel}
                        {filter === 'BOOK' && group.length > 1 && (
                          <span className="text-xs font-sans font-normal text-stone-500 bg-stone-800 rounded-full px-2 py-0.5">{group.length} editions</span>
                        )}
                        <span className="text-xs font-sans font-normal text-stone-500 bg-stone-800 rounded-full px-2 py-0.5 ml-auto">{group.length}</span>
                      </h2>
                    )}
                {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {group.map((entry) => (
                    <EditionCard
                      key={entry.id}
                      href={`/editions/${entry.edition.slug}?entry=${entry.id}`}
                      coverImage={resolveEditionCoverRaw(entry.edition)}
                      companyName={entry.edition.bookBoxCompany?.name}
                      companyBrandColors={getBrandColors(entry.edition.bookBoxCompany?.slug) ?? entry.edition.bookBoxCompany?.brandColors}
                      seriesName={entry.edition.book.seriesName}
                      volumeNumber={entry.edition.book.volumeNumber}
                      title={entry.edition.book.title}
                      authors={(entry.edition.book.authors as any[]).map(a => a.author ?? a)}
                      imageActions={
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMutation.mutate(entry.id) }}
                          disabled={removeMutation.isPending}
                          className="absolute top-2 right-2 p-1.5 bg-stone-950/80 text-stone-400 hover:text-red-400 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                          aria-label="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      }
                      footer={
                        <div className="flex flex-col gap-1 mt-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            {/* Ownership status badge */}
                            <div
                              className="relative"
                              data-dropdown
                            >
                              <span
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenDropdown(prev => prev === `${entry.id}-ownership` ? null : `${entry.id}-ownership`) }}
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer select-none ${
                                  entry.ownershipStatus === 'OWNED' ? 'text-green-700 bg-green-500/20 border-green-500/40' :
                                  entry.ownershipStatus === 'PREORDER' ? 'text-amber-600 bg-amber-500/20 border-amber-500/40' :
                                  entry.ownershipStatus === 'TO_SELL' ? 'text-purple-600 bg-purple-500/20 border-purple-500/40' :
                                  (entry.ownershipStatus === 'SHIPPING' || entry.ownershipStatus === 'SHIPPED') ? 'text-blue-600 bg-blue-500/20 border-blue-500/40' :
                                  'text-stone-500 bg-stone-500/10 border-stone-500/30'
                                }`}
                              >
                                {fmtStatus(entry.ownershipStatus)}
                              </span>
                              {openDropdown === `${entry.id}-ownership` && (
                                <div className="absolute bottom-full left-0 mb-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl w-28 overflow-hidden">
                                  {(['PREORDER', 'SHIPPING', 'OWNED', 'BORROWED', 'LENDED', 'TO_SELL', 'SOLD', 'GIFTED_AWAY'] as const).map((val) => (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        void authFetch(`/collection/${entry.id}`, {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ ownershipStatus: val }),
                                        }).then(() => queryClient.invalidateQueries({ queryKey: ['collection'] }))
                                        setOpenDropdown(null)
                                      }}
                                      className="w-full text-left text-xs px-2 py-1 hover:bg-stone-700 text-stone-200 transition-colors"
                                    >
                                      {fmtStatus(val)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Reading status badge */}
                            <div
                              className="relative"
                              data-dropdown
                            >
                              <span
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenDropdown(prev => prev === `${entry.id}-reading` ? null : `${entry.id}-reading`) }}
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer select-none ${
                                  entry.readingStatus === 'READ' ? 'text-teal-600 bg-teal-500/20 border-teal-500/40' :
                                  entry.readingStatus === 'READING' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                                  entry.readingStatus === 'DNF' ? 'text-rose-500 bg-rose-500/10 border-rose-500/30' :
                                  'text-stone-500 bg-stone-500/10 border-stone-500/30'
                                }`}
                              >
                                {entry.readingStatus === 'DNF' ? 'DNF' : entry.readingStatus === 'READ' ? 'READ' : entry.readingStatus === 'READING' ? 'READING' : 'UNREAD'}
                              </span>
                              {openDropdown === `${entry.id}-reading` && (
                                <div className="absolute bottom-full left-0 mb-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl min-w-max overflow-hidden">
                                  {(['READ', 'READING', 'UNREAD', 'DNF'] as const).map((val) => (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        void authFetch(`/collection/${entry.id}`, {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ readingStatus: val }),
                                        }).then(() => queryClient.invalidateQueries({ queryKey: ['collection'] }))
                                        setOpenDropdown(null)
                                      }}
                                      className="w-full text-left text-xs px-2 py-1 hover:bg-stone-700 text-stone-200 transition-colors"
                                    >
                                      {val}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {entry.condition && (
                              <Badge variant={CONDITION_COLORS[entry.condition] ?? 'default'}>
                                {entry.condition.replace('_', ' ')}
                              </Badge>
                            )}
                            {entry.signatureType && entry.signatureType !== 'unsigned' && (
                              <div className="relative" data-dropdown>
                                <span
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenDropdown(prev => prev === `${entry.id}-sig-grid` ? null : `${entry.id}-sig-grid`) }}
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer select-none ${
                                    entry.signatureType === 'signed'
                                      ? 'text-purple-400 bg-purple-500/10 border-purple-500/30'
                                      : entry.signatureType === 'signed_bookplate'
                                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                                      : entry.signatureType === 'autopen'
                                      ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                                      : entry.signatureType === 'stamped'
                                      ? 'text-teal-400 bg-teal-500/10 border-teal-500/30'
                                      : 'text-blue-400 bg-blue-500/10 border-blue-500/30'
                                  }`}
                                >
                                  {entry.signatureType === 'signed' ? '✍️ SIGNED' : entry.signatureType === 'signed_bookplate' ? '🏷️ BOOKPLATE' : entry.signatureType === 'autopen' ? '✒️ AUTOPEN' : entry.signatureType === 'stamped' ? '🕹️ STAMPED' : '🖨️ DIGITALLY SIGNED'}
                                </span>
                                {openDropdown === `${entry.id}-sig-grid` && (
                                  <div className="absolute top-full left-0 mt-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl min-w-max overflow-hidden">
                                    {(['unsigned', 'signed', 'signed_bookplate', 'autopen', 'digitally_signed', 'stamped'] as const).map((val) => (
                                      <button key={val} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void authFetch(`/collection/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signatureType: val }) }).then(() => queryClient.invalidateQueries({ queryKey: ['collection'] })); setOpenDropdown(null) }}
                                        className="w-full text-left text-xs px-2 py-1 hover:bg-stone-700 text-stone-200 transition-colors"
                                      >{val === 'unsigned' ? 'No signature' : val === 'signed' ? '✍️ Signed' : val === 'signed_bookplate' ? '🏷️ Bookplate' : val === 'autopen' ? '✒️ Autopen' : val === 'stamped' ? '🕹️ Stamped' : '🖨️ Digitally Signed'}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {(!entry.signatureType || entry.signatureType === 'unsigned') && (
                              <div className="relative" data-dropdown>
                                <span
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenDropdown(prev => prev === `${entry.id}-sig-grid` ? null : `${entry.id}-sig-grid`) }}
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer select-none text-stone-600 bg-stone-800 border-stone-700"
                                  title="Set signature type"
                                >UNSIGNED</span>
                                {openDropdown === `${entry.id}-sig-grid` && (
                                  <div className="absolute top-full left-0 mt-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl min-w-max overflow-hidden">
                                    {(['unsigned', 'signed', 'signed_bookplate', 'autopen', 'digitally_signed', 'stamped'] as const).map((val) => (
                                      <button key={val} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void authFetch(`/collection/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signatureType: val }) }).then(() => queryClient.invalidateQueries({ queryKey: ['collection'] })); setOpenDropdown(null) }}
                                        className="w-full text-left text-xs px-2 py-1 hover:bg-stone-700 text-stone-200 transition-colors"
                                      >{val === 'unsigned' ? 'No signature' : val === 'signed' ? '✍️ Signed' : val === 'signed_bookplate' ? '🏷️ Bookplate' : val === 'autopen' ? '✒️ Autopen' : val === 'stamped' ? '🕹️ Stamped' : '🖨️ Digitally Signed'}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {entry.saleAnnouncementEdition?.isReprint && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-amber-400 bg-amber-500/10 border-amber-500/30">
                                🔁 REPRINT
                              </span>
                            )}
                          </div>

                          {/* Cost display */}
                          {entry.purchaseGroup ? (() => {
                            const pg = entry.purchaseGroup
                            const pgCur = pg.currency
                            const dateStr = pg.purchasedAt.slice(0, 10)
                            let total = Number(pg.totalAmount) + Number(pg.shippingAmount ?? 0)
                            // Add fees (normalized to pgCur)
                            for (const fee of pg.fees ?? []) {
                              if (fee.currency === pgCur) {
                                total += Number(fee.amount)
                              } else {
                                const rate = conversionRates[`${fee.currency}:${pgCur}:${fee.date?.slice(0, 10) ?? dateStr}`]
                                if (rate) total += Number(fee.amount) * rate
                              }
                            }
                            // Subtract discounts (normalized to pgCur)
                            for (const discount of pg.discounts ?? []) {
                              if (discount.currency === pgCur) {
                                total -= Number(discount.amount)
                              } else {
                                const rate = conversionRates[`${discount.currency}:${pgCur}:${discount.date?.slice(0, 10) ?? dateStr}`]
                                if (rate) total -= Number(discount.amount) * rate
                              }
                            }
                            // Subtract refunds (normalized to pgCur)
                            for (const refund of pg.refunds ?? []) {
                              if (refund.currency === pgCur) {
                                total -= Number(refund.amount)
                              } else {
                                const rate = conversionRates[`${refund.currency}:${pgCur}:${refund.date?.slice(0, 10) ?? dateStr}`]
                                if (rate) total -= Number(refund.amount) * rate
                              }
                            }
                            const bookCount = pg._count?.bookEntries ?? 1
                            const perBook = bookCount > 1 ? total / bookCount : total
                            const dc = user?.preferredCurrency
                            return (
                              <p className="text-[10px] text-stone-400">
                                {perBook.toFixed(2)} {pgCur}
                                {bookCount > 1 && <span className="text-stone-600"> /book</span>}
                                {dc && pgCur !== dc && (() => {
                                  const key = `${pgCur}:${dc}:${dateStr}`
                                  const rate = conversionRates[key]
                                  if (!rate) return null
                                  return <span className="text-stone-500"> · ~{(perBook * rate).toFixed(2)} {dc}</span>
                                })()}
                              </p>
                            )
                          })() : null}

                          {entry.acquiredAt && (
                            <p className="text-[10px] text-stone-500">
                              {new Date(entry.acquiredAt).toLocaleDateString()}
                            </p>
                          )}

                          {/* Tags */}
                          {entry.edition?.id && (
                            <TagEditor
                              entryId={entry.id}
                              editionId={entry.edition.id}
                              tags={tagOverrides[entry.id] ?? entry.tags ?? []}
                              allTags={allUserTags}
                              onSaved={handleTagsSaved}
                            />
                          )}

                          {/* Quick action buttons */}
                          <div className="flex gap-1 mt-2 pt-1.5 border-t border-stone-800/60">
                            {/* Track shipment — show if SHIPPING/PREORDER or has tracking numbers */}
                            {(entry.ownershipStatus === 'SHIPPING' || entry.ownershipStatus === 'PREORDER' || entry.trackingNumbers.length > 0) && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault(); e.stopPropagation()
                                  setTrackEntry({ id: entry.id, trackingNumbers: entry.trackingNumbers })
                                  setTrackingInput('')
                                  setTrackingLabelInput('')
                                  setShowAddTracking(entry.trackingNumbers.length === 0)
                                }}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                                  entry.trackingNumbers.length > 0
                                    ? 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20'
                                    : 'text-stone-400 border-stone-700 hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/10'
                                }`}
                                title={entry.trackingNumbers.length > 0 ? `${entry.trackingNumbers.length} tracking number(s)` : 'Add tracking number'}
                              >
                                <Truck size={10} />
                                {entry.trackingNumbers.length > 0 ? 'Tracked' : 'Track'}
                              </button>
                            )}

                            {/* Sell */}
                            {entry.ownershipStatus !== 'SOLD' && entry.ownershipStatus !== 'GIFTED_AWAY' && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault(); e.stopPropagation()
                                  openRecordSale(entry.id, entry.purchaseGroup?.currency ?? 'GBP')
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border border-stone-700 text-stone-400 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/10 transition-colors"
                                title="Record sale"
                              >
                                <ShoppingBag size={10} />
                                Sell
                              </button>
                            )}

                            {/* Ownership history */}
                            <button
                              onClick={async (e) => {
                                e.preventDefault(); e.stopPropagation()
                                setHistoryEntryId(entry.id)
                                setHistoryLoading(true)
                                setHistoryItems([])
                                const data = await authFetch<{ id: string; status: string; changedAt: string }[]>(`/collection/entry/${entry.id}/history`)
                                setHistoryItems(data)
                                setHistoryLoading(false)
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border border-stone-700 text-stone-400 hover:text-stone-200 hover:border-stone-600 hover:bg-stone-700/40 transition-colors"
                              title="Ownership history"
                            >
                              <History size={10} />
                              History
                            </button>
                          </div>
                        </div>
                      }
                    />
                  ))}
                </div>
                ) : (
                /* ── List view ── */
                <div className="flex flex-col divide-y divide-stone-800/60 border border-stone-800 rounded-xl">
                  {group.map((entry) => {
                    const cover = cloudinaryUrl(resolveEditionCoverRaw(entry.edition), 'w_80,h_120,c_fill,q_auto,f_auto')
                    const book = entry.edition.book
                    const authors = (book.authors as any[]).map(a => (a.author ?? a).name).join(', ')
                    const pg = entry.purchaseGroup
                    const dateLabel = pg?.purchasedAt
                      ? new Date(pg.purchasedAt).toLocaleDateString()
                      : entry.acquiredAt
                      ? new Date(entry.acquiredAt).toLocaleDateString()
                      : null
                    return (
                      <a
                        key={entry.id}
                        href={`/editions/${entry.edition.slug}?entry=${entry.id}`}
                        className="group flex items-center gap-3 px-3 py-2.5 bg-stone-900 hover:bg-stone-800/80 transition-colors first:rounded-t-xl last:rounded-b-xl"
                      >
                        {/* Thumbnail */}
                        <div className="w-10 h-[60px] flex-shrink-0 rounded overflow-hidden">
                          {cover
                            ? <img src={cover} alt={book.title} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-stone-600" style={brandGradientStyle(getBrandColors(entry.edition.bookBoxCompany?.slug) ?? entry.edition.bookBoxCompany?.brandColors)}>
                                <BookOpen size={14} />
                              </div>
                          }
                        </div>

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-100 truncate">{book.title}</p>
                          {authors && <p className="text-xs text-stone-400 truncate">{authors}</p>}
                          {(book.seriesName || entry.edition.bookBoxCompany?.name) && (
                            <p className="text-[10px] text-stone-500 truncate">
                              {book.seriesName && <span>{book.seriesName}{book.volumeNumber ? ` #${book.volumeNumber}` : ''}</span>}
                              {book.seriesName && entry.edition.bookBoxCompany?.name && <span className="mx-1">·</span>}
                              {entry.edition.bookBoxCompany?.name && <span>{entry.edition.bookBoxCompany.name}</span>}
                            </p>
                          )}
                        </div>

                        {/* Badges */}
                        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                          {/* Ownership */}
                          <div className="relative" data-dropdown>
                            <span
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenDropdown(prev => prev === `${entry.id}-ownership` ? null : `${entry.id}-ownership`) }}
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer select-none ${
                                entry.ownershipStatus === 'OWNED' ? 'text-green-700 bg-green-500/20 border-green-500/40' :
                                entry.ownershipStatus === 'PREORDER' ? 'text-amber-600 bg-amber-500/20 border-amber-500/40' :
                                entry.ownershipStatus === 'TO_SELL' ? 'text-purple-600 bg-purple-500/20 border-purple-500/40' :
                                (entry.ownershipStatus === 'SHIPPING' || entry.ownershipStatus === 'SHIPPED') ? 'text-blue-600 bg-blue-500/20 border-blue-500/40' :
                                'text-stone-500 bg-stone-500/10 border-stone-500/30'
                              }`}
                            >
                              {fmtStatus(entry.ownershipStatus)}
                            </span>
                            {openDropdown === `${entry.id}-ownership` && (
                              <div className="absolute top-full left-0 mt-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl w-28 overflow-hidden">
                                {(['PREORDER', 'SHIPPING', 'OWNED', 'BORROWED', 'LENDED', 'TO_SELL', 'SOLD', 'GIFTED_AWAY'] as const).map((val) => (
                                  <button key={val} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void authFetch(`/collection/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownershipStatus: val }) }).then(() => queryClient.invalidateQueries({ queryKey: ['collection'] })); setOpenDropdown(null) }}
                                    className="w-full text-left text-xs px-2 py-1 hover:bg-stone-700 text-stone-200 transition-colors"
                                  >{fmtStatus(val)}</button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Reading status */}
                          <div className="relative" data-dropdown>
                            <span
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenDropdown(prev => prev === `${entry.id}-reading` ? null : `${entry.id}-reading`) }}
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer select-none ${
                                entry.readingStatus === 'READ' ? 'text-teal-600 bg-teal-500/20 border-teal-500/40' :
                                entry.readingStatus === 'READING' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                                entry.readingStatus === 'DNF' ? 'text-rose-500 bg-rose-500/10 border-rose-500/30' :
                                'text-stone-500 bg-stone-500/10 border-stone-500/30'
                              }`}
                            >
                              {entry.readingStatus === 'DNF' ? 'DNF' : entry.readingStatus === 'READ' ? 'READ' : entry.readingStatus === 'READING' ? 'READING' : 'UNREAD'}
                            </span>
                            {openDropdown === `${entry.id}-reading` && (
                              <div className="absolute top-full left-0 mt-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl min-w-max overflow-hidden">
                                {(['READ', 'READING', 'UNREAD', 'DNF'] as const).map((val) => (
                                  <button key={val} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void authFetch(`/collection/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ readingStatus: val }) }).then(() => queryClient.invalidateQueries({ queryKey: ['collection'] })); setOpenDropdown(null) }}
                                    className="w-full text-left text-xs px-2 py-1 hover:bg-stone-700 text-stone-200 transition-colors"
                                  >{val}</button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Signature type */}
                          <div className="relative" data-dropdown>
                            <span
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenDropdown(prev => prev === `${entry.id}-sig` ? null : `${entry.id}-sig`) }}
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer select-none ${entry.signatureType && entry.signatureType !== 'unsigned' ? (entry.signatureType === 'signed' ? 'text-purple-400 bg-purple-500/10 border-purple-500/30' : entry.signatureType === 'stamped' ? 'text-teal-400 bg-teal-500/10 border-teal-500/30' : 'text-stone-400 bg-stone-500/10 border-stone-500/30') : 'text-stone-600 bg-stone-800 border-stone-700'}`}
                            >
                              {entry.signatureType === 'signed' ? '✍️' : entry.signatureType === 'signed_bookplate' ? '🏷️' : entry.signatureType === 'autopen' ? '✒️' : entry.signatureType === 'digitally_signed' ? '🖨️' : entry.signatureType === 'stamped' ? '🕹️' : '—'}
                            </span>
                            {openDropdown === `${entry.id}-sig` && (
                              <div className="absolute top-full left-0 mt-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl min-w-max overflow-hidden">
                                {(['unsigned', 'signed', 'signed_bookplate', 'autopen', 'digitally_signed', 'stamped'] as const).map((val) => (
                                  <button key={val} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void authFetch(`/collection/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signatureType: val }) }).then(() => queryClient.invalidateQueries({ queryKey: ['collection'] })); setOpenDropdown(null) }}
                                    className="w-full text-left text-xs px-2 py-1 hover:bg-stone-700 text-stone-200 transition-colors"
                                  >{val === 'unsigned' ? 'No signature' : val === 'signed' ? '✍️ Signed' : val === 'signed_bookplate' ? '🏷️ Bookplate' : val === 'autopen' ? '✒️ Autopen' : val === 'stamped' ? '🕹️ Stamped' : '🖨️ Digitally Signed'}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Date & cost */}
                        <div className="hidden md:flex flex-col items-end gap-0.5 flex-shrink-0 min-w-[80px]">
                          {dateLabel && <p className="text-[10px] text-stone-500">{dateLabel}</p>}
                          {pg && (() => {
                            const total = Number(pg.totalAmount) + Number(pg.shippingAmount ?? 0)
                            const bookCount = pg._count?.bookEntries ?? 1
                            const perBook = bookCount > 1 ? total / bookCount : total
                            return <p className="text-[10px] text-stone-400">{perBook.toFixed(2)} {pg.currency}</p>
                          })()}
                        </div>

                        {/* Actions (hover) */}
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                          {(entry.ownershipStatus === 'SHIPPING' || entry.ownershipStatus === 'PREORDER' || entry.trackingNumbers.length > 0) && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTrackEntry({ id: entry.id, trackingNumbers: entry.trackingNumbers }); setTrackingInput(''); setTrackingLabelInput(''); setShowAddTracking(entry.trackingNumbers.length === 0) }}
                              className={`p-1.5 rounded-lg transition-colors ${entry.trackingNumbers.length > 0 ? 'text-blue-400 hover:bg-blue-500/10' : 'text-stone-500 hover:text-blue-400 hover:bg-blue-500/10'}`}
                              title={entry.trackingNumbers.length > 0 ? `${entry.trackingNumbers.length} tracking number(s)` : 'Add tracking number'}
                            >
                              <Truck size={12} />
                            </button>
                          )}
                          {entry.ownershipStatus !== 'SOLD' && entry.ownershipStatus !== 'GIFTED_AWAY' && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openRecordSale(entry.id, entry.purchaseGroup?.currency ?? 'GBP') }}
                              className="p-1.5 rounded-lg text-stone-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                              title="Record sale"
                            >
                              <ShoppingBag size={12} />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMutation.mutate(entry.id) }}
                            disabled={removeMutation.isPending}
                            className="p-1.5 text-stone-600 hover:text-red-400 transition-all"
                            aria-label="Remove"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </a>
                    )
                  })}
                </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* Load more */}
      {entries.length < collectionTotal && (
        <div className="text-center mt-8">
          <button
            onClick={() => void loadMoreCollection()}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : `Show more (${entries.length} / ${collectionTotal})`}
          </button>
        </div>
      )}
      </>

      {/* Add to Collection modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add to Collection">
        <AddToCollectionSearch
          existingEditionIds={new Set(entries.map(e => e.edition.id))}
          onAdded={() => {
            void queryClient.invalidateQueries({ queryKey: ['collection'] })
            void queryClient.invalidateQueries({ queryKey: ['collection-stats'] })
            void queryClient.invalidateQueries({ queryKey: ['spending-stats-v2'] })
            setAddModalOpen(false)
          }}
        />
      </Modal>

      {/* ─── Ownership History Modal ─── */}
      <Modal
        open={!!historyEntryId}
        onClose={() => { setHistoryEntryId(null); setHistoryItems([]); setHistoryEditId(null) }}
        title="Ownership History"
      >
        <div className="flex flex-col gap-3 min-w-[320px]">
          {historyLoading && <p className="text-stone-400 text-sm">Loading…</p>}
          {!historyLoading && historyItems.length === 0 && (
            <p className="text-stone-500 text-sm">No history recorded yet.</p>
          )}
          {historyItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 group">
              {historyEditId === item.id ? (
                <>
                  <select
                    value={historyEditStatus}
                    onChange={e => setHistoryEditStatus(e.target.value)}
                    className="bg-stone-800 border border-stone-600 text-stone-200 text-xs rounded px-2 py-1"
                  >
                    {['PREORDER','SHIPPING','OWNED','BORROWED','LENDED','TO_SELL','SOLD','GIFTED_AWAY'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={historyEditDate}
                    onChange={e => setHistoryEditDate(e.target.value)}
                    className="bg-stone-800 border border-stone-600 text-stone-200 text-xs rounded px-2 py-1"
                  />
                  <button
                    onClick={async () => {
                      const updated = await authFetch<{ id: string; status: string; changedAt: string }>(
                        `/collection/entry/${historyEntryId}/history/${item.id}`,
                        { method: 'PATCH', body: JSON.stringify({ status: historyEditStatus, changedAt: historyEditDate ? new Date(historyEditDate).toISOString() : undefined }) },
                      )
                      setHistoryItems(prev => prev.map(h => h.id === item.id ? updated : h))
                      setHistoryEditId(null)
                    }}
                    className="text-xs text-green-400 hover:text-green-300 px-1"
                  >Save</button>
                  <button onClick={() => setHistoryEditId(null)} className="text-xs text-stone-500 hover:text-stone-300 px-1">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-stone-300 w-28 shrink-0">{item.status}</span>
                  <span className="text-xs text-stone-500 flex-1">{new Date(item.changedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  <button
                    onClick={() => { setHistoryEditId(item.id); setHistoryEditStatus(item.status); setHistoryEditDate(new Date(item.changedAt).toISOString().slice(0,10)) }}
                    className="opacity-0 group-hover:opacity-100 text-stone-500 hover:text-stone-300 transition-opacity"
                    title="Edit"
                  ><Pencil size={11} /></button>
                  <button
                    onClick={async () => {
                      await authFetch(`/collection/entry/${historyEntryId}/history/${item.id}`, { method: 'DELETE' })
                      setHistoryItems(prev => prev.filter(h => h.id !== item.id))
                    }}
                    className="opacity-0 group-hover:opacity-100 text-stone-500 hover:text-rose-400 transition-opacity"
                    title="Delete"
                  ><X size={11} /></button>
                </>
              )}
            </div>
          ))}

          {/* Add new entry */}
          <div className="border-t border-stone-700 pt-3 mt-1">
            <p className="text-xs text-stone-500 mb-2">Add entry manually</p>
            <div className="flex gap-2 flex-wrap">
              <select
                id="new-hist-status"
                defaultValue="OWNED"
                className="bg-stone-800 border border-stone-600 text-stone-200 text-xs rounded px-2 py-1"
              >
                {['PREORDER','SHIPPING','OWNED','BORROWED','LENDED','TO_SELL','SOLD','GIFTED_AWAY'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                id="new-hist-date"
                type="date"
                className="bg-stone-800 border border-stone-600 text-stone-200 text-xs rounded px-2 py-1"
              />
              <button
                onClick={async () => {
                  const statusEl = document.getElementById('new-hist-status') as HTMLSelectElement
                  const dateEl = document.getElementById('new-hist-date') as HTMLInputElement
                  const created = await authFetch<{ id: string; status: string; changedAt: string }>(
                    `/collection/entry/${historyEntryId}/history`,
                    { method: 'POST', body: JSON.stringify({ status: statusEl.value, changedAt: dateEl.value ? new Date(dateEl.value).toISOString() : undefined }) },
                  )
                  setHistoryItems(prev => [...prev, created].sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()))
                  dateEl.value = ''
                }}
                className="px-3 py-1 rounded-lg bg-stone-700 hover:bg-stone-600 text-xs text-stone-200 transition-colors"
              >Add</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ─── Track Shipment Modal ─── */}
      <Modal
        open={!!trackEntry}
        onClose={() => { setTrackEntry(null); setTrackingInput(''); setTrackingLabelInput(''); setShowAddTracking(false) }}
        title="Track Shipment"
      >
        <div className="flex flex-col gap-4">
          {/* Existing tracking numbers list */}
          {trackEntry && trackEntry.trackingNumbers.length > 0 && (
            <div className="flex flex-col gap-2">
              {trackEntry.trackingNumbers.map((tn) => (
                <div key={tn.id} className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <Truck size={14} className="text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {tn.label && <p className="text-[10px] text-stone-400 mb-0.5">{tn.label}</p>}
                    <a
                      href={`https://parcelsapp.com/en/tracking/${encodeURIComponent(tn.trackingNumber)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all transition-colors"
                    >
                      {tn.trackingNumber}
                    </a>
                  </div>
                  <button
                    onClick={async () => {
                      if (!trackEntry) return
                      await authFetch(`/collection/${trackEntry.id}/tracking/${tn.id}`, { method: 'DELETE' })
                      await queryClient.invalidateQueries({ queryKey: ['collection'] })
                      setTrackEntry(prev => prev ? { ...prev, trackingNumbers: prev.trackingNumbers.filter(t => t.id !== tn.id) } : null)
                    }}
                    className="p-1.5 text-stone-600 hover:text-red-400 transition-colors shrink-0"
                    title="Remove tracking number"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add tracking form */}
          {showAddTracking ? (
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Tracking number (e.g. JD014600006278907695)"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
                autoFocus
              />
              <input
                type="text"
                placeholder="Label (optional, e.g. Volume 1)"
                value={trackingLabelInput}
                onChange={(e) => setTrackingLabelInput(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
              />
              {trackingInput.trim() && (
                <a
                  href={`https://parcelsapp.com/en/tracking/${encodeURIComponent(trackingInput.trim())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-stone-400 hover:text-amber-400 transition-colors"
                >
                  <Truck size={12} /> Preview on ParcelsApp ↗
                </a>
              )}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!trackEntry || !trackingInput.trim()) return
                    const result = await authFetch<{ id: string; trackingNumber: string; label: string | null }>(`/collection/${trackEntry.id}/tracking`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ trackingNumber: trackingInput.trim(), label: trackingLabelInput.trim() || undefined }),
                    })
                    await queryClient.invalidateQueries({ queryKey: ['collection'] })
                    setTrackEntry(prev => prev ? { ...prev, trackingNumbers: [...prev.trackingNumbers, result] } : null)
                    setTrackingInput('')
                    setTrackingLabelInput('')
                    setShowAddTracking(false)
                  }}
                  disabled={!trackingInput.trim()}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => { setTrackingInput(''); setTrackingLabelInput(''); setShowAddTracking(false) }}
                  className="px-4 py-2.5 rounded-xl text-sm border border-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddTracking(true)}
              className="flex items-center gap-2 text-sm text-stone-400 hover:text-amber-400 transition-colors"
            >
              <Plus size={14} /> Add tracking number
            </button>
          )}
        </div>
      </Modal>

      {/* ─── Add Sale Modal ─── */}
      <Modal open={addSaleOpen} onClose={() => setAddSaleOpen(false)} title="Record a Sale">
        <AddSaleForm
          entries={entries.filter(e => e.ownershipStatus !== 'SOLD')}
          onClose={() => setAddSaleOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['sale-groups'] })
            queryClient.invalidateQueries({ queryKey: ['collection'] })
            queryClient.invalidateQueries({ queryKey: ['spending-stats-v2'] })
            setAddSaleOpen(false)
          }}
          saleTitle={saleTitle} setSaleTitle={setSaleTitle}
          salePlatform={salePlatform} setSalePlatform={setSalePlatform}
          saleCustomPlatform={saleCustomPlatform} setSaleCustomPlatform={setSaleCustomPlatform}
          saleTotalAmount={saleTotalAmount} setSaleTotalAmount={setSaleTotalAmount}
          saleCurrency={saleCurrency} setSaleCurrency={setSaleCurrency}
          saleSoldAt={saleSoldAt} setSaleSoldAt={setSaleSoldAt}
          saleNotes={saleNotes} setSaleNotes={setSaleNotes}
          saleDistribution={saleDistribution} setSaleDistribution={setSaleDistribution}
          saleSelectedEntries={saleSelectedEntries} setSaleSelectedEntries={setSaleSelectedEntries}
          saleCustomAmounts={saleCustomAmounts} setSaleCustomAmounts={setSaleCustomAmounts}
          saleBookSearch={saleBookSearch} setSaleBookSearch={setSaleBookSearch}
        />
      </Modal>
    </div>
  )
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

function AddToCollectionSearch({
  existingEditionIds,
  onAdded,
}: {
  existingEditionIds: Set<string>
  onAdded: () => void
}) {
  const [step, setStep] = useState<'search' | 'form'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiSearchEdition[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ApiSearchEdition | null>(null)

  // Form state
  const [ownershipStatus, setOwnershipStatus] = useState('PREORDER')
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [price, setPrice] = useState('')
  const [shipping, setShipping] = useState('')
  const [currency, setCurrency] = useState('GBP')
  const [feeEntries, setFeeEntries] = useState<FeeEntry[]>([])
  const [discountEntries, setDiscountEntries] = useState<DiscountEntry[]>([])
  const [isSecondHand, setIsSecondHand] = useState(false)
  const [sourcePlatform, setSourcePlatform] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const feeKeyRef = useRef(0)
  const discountKeyRef = useRef(0)

  const { data: feeTemplates = [] } = useQuery<FeeTemplate[]>({
    queryKey: ['fee-templates'],
    queryFn: () => authFetch<FeeTemplate[]>('/fees/templates?activeOnly=true'),
    enabled: step === 'form',
  })

  const fetchResults = useCallback(
    debounce(async (q: string) => {
      if (q.length < 2) { setResults([]); setLoading(false); return }
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data: ApiSearchResult = await res.json()
          setResults(data.editions ?? [])
        }
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }, 300),
    [],
  )

  useEffect(() => { fetchResults(query) }, [query, fetchResults])

  const openForm = (edition: ApiSearchEdition) => {
    setSelected(edition)
    setOwnershipStatus('PREORDER')
    setPurchasedAt(new Date().toISOString().slice(0, 10))
    setPrice('')
    setShipping('')
    setCurrency('GBP')
    setFeeEntries([])
    setDiscountEntries([])
    setIsSecondHand(false)
    setSourcePlatform('')
    setOrderNumber('')
    setError(null)
    setStep('form')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setSubmitting(true)
    setError(null)
    const feeDate = purchasedAt || new Date().toISOString().slice(0, 10)
    try {
      const parsedPrice = parseDecimalInput(price)
      const parsedShipping = parseDecimalInput(shipping)

      // Create the collection entry
      const res = await authFetch<{ id: string }>('/collection', {
        method: 'POST',
        body: JSON.stringify({
          bookEditionId: selected.id,
          ownershipStatus,
          acquiredAt: purchasedAt ? new Date(purchasedAt).toISOString() : undefined,
          _entityName: selected.book.title,
        }),
      })
      const entryId = res.id

      // Create purchase group if there are any financials
      const hasFees = feeEntries.some(f => parseDecimalInput(f.amount) > 0)
      const hasDiscounts = discountEntries.some(d => parseDecimalInput(d.amount) > 0)
      let purchaseGroupId: string | null = null
      if (parsedPrice > 0 || parsedShipping > 0 || hasFees || hasDiscounts) {
        const pgRes = await authFetch<{ id: string }>(`/collection/bundles/for-entry/${entryId}`, {
          method: 'POST',
          body: JSON.stringify({
            totalAmount: parsedPrice > 0 ? parsedPrice : 0,
            currency,
            shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
            purchasedAt: feeDate,
            isSecondHand,
            sourcePlatform: sourcePlatform || undefined,
          }),
        })
        purchaseGroupId = pgRes.id
      }

      for (const fee of feeEntries) {
        const amt = parseDecimalInput(fee.amount)
        if (amt <= 0) continue
        const tpl = feeTemplates.find(t => t.id === fee.templateId)
        await authFetch('/fees', {
          method: 'POST',
          body: JSON.stringify({
            feeTemplateId: tpl?.id,
            name: tpl?.name ?? 'Fee',
            amount: amt,
            currency: fee.currency,
            date: feeDate,
            category: tpl?.category ?? undefined,
            ...(purchaseGroupId ? { purchaseGroupId } : {}),
          }),
        })
      }

      for (const disc of discountEntries) {
        const amt = parseDecimalInput(disc.amount)
        if (amt <= 0 || !disc.name.trim()) continue
        await authFetch('/fees/discounts', {
          method: 'POST',
          body: JSON.stringify({
            name: disc.name.trim(),
            amount: amt,
            currency: disc.currency,
            date: feeDate,
            ...(purchaseGroupId ? { purchaseGroupId } : {}),
          }),
        })
      }

      if (orderNumber.trim()) {
        await authFetch<void>(`/collection/${entryId}`, {
          method: 'PATCH',
          body: JSON.stringify({ orderNumber: orderNumber.trim() }),
        }).catch(() => {})
      }

      onAdded()
    } catch (err) {
      setError((err as Error).message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'form' && selected) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Header with back */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setStep('search')} className="text-stone-500 hover:text-stone-200 transition-colors">
            <X size={16} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {selected.additionalImages?.[0] && (
              <Image src={cloudinaryUrl(selected.additionalImages[0]) ?? ''} alt={selected.book.title} width={32} height={32}
                className="w-8 h-8 rounded object-cover shrink-0" unoptimized />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-100 truncate">{selected.book.title}</p>
              <p className="text-xs text-stone-500 truncate">
                {[selected.bookBoxCompany?.name, selected.publisher].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className={LBL}>Status</label>
          <select value={ownershipStatus} onChange={e => setOwnershipStatus(e.target.value)} className={INP}>
            {ADD_OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className={LBL}>Purchase date</label>
          <input type="date" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} className={INP} />
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <div>
            <label className={LBL}>Price (optional)</label>
            <input type="text" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className={INP} />
          </div>
          <div>
            <label className={LBL}>Shipping (optional)</label>
            <input type="text" value={shipping} onChange={e => setShipping(e.target.value)} placeholder="0.00" className={INP} />
          </div>
          <div>
            <label className={LBL}>Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={INP}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Fees */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-400">Additional fees (optional)</span>
            <button type="button"
              onClick={() => { feeKeyRef.current++; setFeeEntries(p => [...p, { key: feeKeyRef.current, templateId: '', amount: '', currency }]) }}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors">
              <Plus size={12} /> Add fee
            </button>
          </div>
          {feeEntries.length === 0 && <p className="text-xs text-stone-500 italic">No additional fees</p>}
          <div className="space-y-2">
            {feeEntries.map(fee => (
              <div key={fee.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                <select value={fee.templateId}
                  onChange={e => {
                    const tpl = feeTemplates.find(t => t.id === e.target.value)
                    setFeeEntries(p => p.map(f => f.key === fee.key ? { ...f, templateId: e.target.value, amount: tpl?.defaultAmount != null ? String(tpl.defaultAmount) : f.amount, currency: tpl?.defaultCurrency ?? f.currency } : f))
                  }}
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400">
                  <option value="">— Template —</option>
                  {feeTemplates.map(t => <option key={t.id} value={t.id}>{t.name}{t.category ? ` (${t.category})` : ''}</option>)}
                </select>
                <input type="text" value={fee.amount} onChange={e => setFeeEntries(p => p.map(f => f.key === fee.key ? { ...f, amount: e.target.value } : f))}
                  placeholder="0.00" className="w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400" />
                <select value={fee.currency} onChange={e => setFeeEntries(p => p.map(f => f.key === fee.key ? { ...f, currency: e.target.value } : f))}
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => setFeeEntries(p => p.filter(f => f.key !== fee.key))} className="p-2 text-stone-500 hover:text-red-400 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Discounts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-400">Discounts (optional)</span>
            <button type="button"
              onClick={() => { discountKeyRef.current++; setDiscountEntries(p => [...p, { key: discountKeyRef.current, name: '', amount: '', currency }]) }}
              className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors">
              <Plus size={12} /> Add discount
            </button>
          </div>
          {discountEntries.length === 0 && <p className="text-xs text-stone-500 italic">No discounts</p>}
          <div className="space-y-2">
            {discountEntries.map(disc => (
              <div key={disc.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                <input type="text" value={disc.name} onChange={e => setDiscountEntries(p => p.map(d => d.key === disc.key ? { ...d, name: e.target.value } : d))}
                  placeholder="e.g. Promo code, loyalty…"
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400" />
                <input type="text" value={disc.amount} onChange={e => setDiscountEntries(p => p.map(d => d.key === disc.key ? { ...d, amount: e.target.value } : d))}
                  placeholder="0.00" className="w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400" />
                <select value={disc.currency} onChange={e => setDiscountEntries(p => p.map(d => d.key === disc.key ? { ...d, currency: e.target.value } : d))}
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => setDiscountEntries(p => p.filter(d => d.key !== disc.key))} className="p-2 text-stone-500 hover:text-red-400 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <label className={LBL}>Order number (optional)</label>
            <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)}
              placeholder="e.g. 12345678" className={INP} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isSecondHand} onChange={e => { setIsSecondHand(e.target.checked); if (!e.target.checked) setSourcePlatform('') }}
              className="w-4 h-4 rounded accent-amber-500" />
            <span className="text-sm text-stone-300">Second-hand purchase</span>
          </label>
          {isSecondHand && (
            <select value={sourcePlatform} onChange={e => setSourcePlatform(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 transition-colors">
              <option value="">Select platform (optional)</option>
              {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setStep('search')}
            className="flex-1 py-2 rounded-xl border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 transition-colors">
            Back
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold py-2 rounded-xl text-sm transition-colors">
            {submitting ? 'Adding…' : 'Add to Collection'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          type="text"
          autoFocus
          placeholder="Search by title, author, series…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
        />
        <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 ${loading ? 'animate-pulse' : ''}`} />
      </div>

      {query.length >= 2 && (
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          {results.length === 0 && !loading && (
            <p className="text-sm text-stone-500 text-center py-4">No editions found</p>
          )}
          {results.map((edition) => {
            const alreadyOwned = existingEditionIds.has(edition.id)
            return (
              <div key={edition.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-stone-800 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-stone-800 shrink-0 overflow-hidden">
                  {edition.additionalImages?.[0] ? (
                    <Image src={cloudinaryUrl(edition.additionalImages[0]) ?? ''} alt={edition.book.title}
                      width={40} height={40} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-700"><BookOpen size={14} /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-100 truncate">{edition.book.title}</p>
                  <p className="text-xs text-stone-500 truncate">
                    {[edition.bookBoxCompany?.name, edition.publisher].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  disabled={alreadyOwned}
                  onClick={() => openForm(edition)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    alreadyOwned
                      ? 'bg-stone-700 text-stone-500 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                  }`}
                >
                  {alreadyOwned ? <><Check size={11} /> Owned</> : <><Plus size={11} /> Add</>}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

