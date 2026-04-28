'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Image from 'next/image'
import { createPurchaseGroup, getPurchaseGroups, getSaleGroups, createSaleGroup, deleteSaleGroup } from '@/lib/api'
import type { ApiPurchaseGroup, ApiSaleGroup } from '@luxgrimoire/shared-types'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EditionCard } from '@/components/books/EditionCard'
import { Plus, Trash2, BookOpen, Package, ShoppingBag, Tag, X } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { parseDecimalInput } from '@/lib/parseDecimalInput'

interface CollectionEntry {
  id: string
  isWishlist: boolean
  condition: string | null
  acquiredAt: string | null
  purchaseDate: string | null
  ownershipStatus: string
  readingStatus: string
  allocatedPrice: string | null
  priceCurrency: string | null
  purchaseFees: Array<{ id: string; name: string; amount: string; currency: string; category: string }>
  signatureType: string | null
  tags: string[]
  purchaseGroup: { id: string; currency: string; purchasedAt: string } | null
  edition: {
    id: string
    slug: string
    coverImage: string | null
    publisher: string | null
    bookBoxCompany: { id: string; name: string; slug: string } | null
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

interface EditionSearchResult {
  id: string
  slug: string
  coverImage: string | null
  publisher: string | null
  book: {
    id: string
    title: string
    slug: string
    authors: Array<{ id: string; name: string; slug: string }>
  }
}

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

function AddBundleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: '',
    totalAmount: '',
    currency: 'USD',
    shippingAmount: '',
    purchasedAt: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [editionSearch, setEditionSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedEditions, setSelectedEditions] = useState<EditionSearchResult[]>([])
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(editionSearch), 300)
    return () => clearTimeout(t)
  }, [editionSearch])

  const { data: searchResults = [] } = useQuery({
    queryKey: ['editions-search', debouncedSearch],
    queryFn: () =>
      debouncedSearch.length >= 2
        ? authFetch<{ data: EditionSearchResult[] }>(`/editions?search=${encodeURIComponent(debouncedSearch)}&pageSize=10`).then(r => r.data)
        : Promise.resolve([]),
    enabled: debouncedSearch.length >= 2,
  })

  const mutation = useMutation({
    mutationFn: () =>
      createPurchaseGroup({
        title: form.title || undefined,
        totalAmount: Number(form.totalAmount),
        currency: form.currency,
        shippingAmount: form.shippingAmount ? Number(form.shippingAmount) : undefined,
        purchasedAt: form.purchasedAt,
        notes: form.notes || undefined,
        editionIds: selectedEditions.map(e => e.id),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-groups'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      setSuccess(true)
      setTimeout(() => {
        onClose()
        setSuccess(false)
        setForm({ title: '', totalAmount: '', currency: 'USD', shippingAmount: '', purchasedAt: new Date().toISOString().slice(0, 10), notes: '' })
        setSelectedEditions([])
        setEditionSearch('')
      }, 1500)
    },
  })

  const addEdition = (ed: EditionSearchResult) => {
    if (!selectedEditions.find(e => e.id === ed.id)) {
      setSelectedEditions(prev => [...prev, ed])
    }
  }

  const removeEdition = (id: string) => {
    setSelectedEditions(prev => prev.filter(e => e.id !== id))
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Bundle">
      {success ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-green-400 font-semibold">Bundle added to your collection!</p>
        </div>
      ) : (
        <form
          onSubmit={e => { e.preventDefault(); mutation.mutate() }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className={LBL}>Bundle Title (optional)</label>
            <input className={INP} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. BOTM October 2024" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LBL}>Total Amount *</label>
              <input required type="number" step="0.01" min="0" className={INP} value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} />
            </div>
            <div>
              <label className={LBL}>Currency</label>
              <input className={INP} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LBL}>Shipping Amount</label>
              <input type="number" step="0.01" min="0" className={INP} value={form.shippingAmount} onChange={e => setForm(f => ({ ...f, shippingAmount: e.target.value }))} />
            </div>
            <div>
              <label className={LBL}>Purchase Date *</label>
              <input required type="date" className={INP} value={form.purchasedAt} onChange={e => setForm(f => ({ ...f, purchasedAt: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={LBL}>Notes</label>
            <input className={INP} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {/* Edition search */}
          <div>
            <label className={LBL}>Search Editions *</label>
            <input
              className={INP}
              value={editionSearch}
              onChange={e => setEditionSearch(e.target.value)}
              placeholder="Search by title, author…"
            />
            {searchResults.length > 0 && (
              <div className="mt-2 bg-stone-800 border border-stone-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {searchResults.map(ed => (
                  <button
                    key={ed.id}
                    type="button"
                    onClick={() => addEdition(ed)}
                    className="w-full text-left px-3 py-2 hover:bg-stone-700 transition-colors flex items-center gap-2 text-sm"
                  >
                    {ed.coverImage && (
                      <Image src={ed.coverImage} alt="" width={32} height={40} className="object-cover rounded" unoptimized />
                    )}
                    <div>
                      <p className="text-stone-200">{ed.book.title}</p>
                      <p className="text-stone-500 text-xs">{ed.publisher ?? ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected editions */}
          {selectedEditions.length > 0 && (
            <div>
              <p className="text-xs text-stone-500 mb-2">{selectedEditions.length} edition{selectedEditions.length !== 1 ? 's' : ''} selected:</p>
              <div className="flex flex-wrap gap-2">
                {selectedEditions.map(ed => (
                  <span key={ed.id} className="flex items-center gap-1 bg-stone-700 text-stone-200 text-xs px-2.5 py-1 rounded-full">
                    {ed.book.title}
                    <button type="button" onClick={() => removeEdition(ed.id)} className="text-stone-500 hover:text-red-400">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {mutation.isError && (
            <p className="text-red-400 text-sm">{(mutation.error as Error).message}</p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || selectedEditions.length === 0}
            className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? 'Adding…' : 'Add Bundle'}
          </button>
        </form>
      )}
    </Modal>
  )
}

const SALE_PLATFORMS = [
  { value: 'vinted', label: '🛍️ Vinted' },
  { value: 'ebay', label: '🛒 eBay' },
  { value: 'facebook', label: '📘 Facebook' },
  { value: 'instagram', label: '📷 Instagram' },
  { value: 'depop', label: '👗 Depop' },
  { value: 'whatnot', label: '🎉 Whatnot' },
  { value: 'local', label: '🤝 Local / In-person' },
  { value: 'other', label: '✏️ Other (custom)' },
]

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
      await createSaleGroup({
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
          <input className={INP} value={saleCurrency} onChange={e => setSaleCurrency(e.target.value)} placeholder="GBP" />
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
              {e.allocatedPrice && (
                <span className="text-stone-500 text-xs shrink-0">{e.allocatedPrice} {e.priceCurrency}</span>
              )}
            </button>
          ))}
          {hiddenCount > 0 && (
            <p className="text-stone-600 text-xs px-3 py-2 italic">+{hiddenCount} more — type to search</p>
          )}
        </div>
        {count > 0 && <p className="text-xs text-stone-500 mt-1">{count} book{count !== 1 ? 's' : ''} selected</p>}
      </div>

      {/* Price distribution */}
      {count > 0 && total > 0 && (
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
    const saved = await authFetch<string[]>(`/collection/edition/${editionId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags: nextTags }),
    })
    onSaved(editionId, saved)
  }, [editionId, onSaved])

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

type FilterMode = 'ALL' | 'BOOK' | 'SERIES' | 'YEAR'

export default function CollectionPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [filter, setFilter] = useState<FilterMode>('ALL')
  const [bookFilter, setBookFilter] = useState('')
  const [sigFilter, setSigFilter] = useState<'ALL' | 'UNSIGNED' | 'SIGNED' | 'DIGITALLY_SIGNED' | 'SIGNED_BOOKPLATE'>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [companyFilter, setCompanyFilter] = useState<string>('ALL')
  const [tagFilter, setTagFilter] = useState<string>('ALL')
  const [tab, setTab] = useState<'books' | 'bundles' | 'sales'>('books')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addBundleOpen, setAddBundleOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [conversionRates, setConversionRates] = useState<Record<string, number>>({})
  // Local tag state per editionId (updated optimistically after saves)
  const [tagOverrides, setTagOverrides] = useState<Record<string, string[]>>({})

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

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['collection', false],
    queryFn: () =>
      authFetch<{ data: CollectionEntry[]; total: number }>('/collection?isWishlist=false').then((r) => r.data),
  })

  const { data: allUserTags = [] } = useQuery({
    queryKey: ['collection-tags'],
    queryFn: () => authFetch<string[]>('/collection/tags'),
  })

  const { data: stats } = useQuery({
    queryKey: ['collection-stats'],
    queryFn: () => authFetch<CollectionStats>('/collection/stats'),
  })

  const { data: bundles = [] } = useQuery({
    queryKey: ['purchase-groups'],
    queryFn: getPurchaseGroups,
  })

  const { data: saleGroups = [] } = useQuery({
    queryKey: ['sale-groups'],
    queryFn: getSaleGroups,
  })

  // Called by TagEditor when tags are saved — update local override + re-fetch allUserTags
  const handleTagsSaved = useCallback((editionId: string, tags: string[]) => {
    setTagOverrides(prev => ({ ...prev, [editionId]: tags }))
    void queryClient.invalidateQueries({ queryKey: ['collection-tags'] })
  }, [queryClient])

  const [addSaleOpen, setAddSaleOpen] = useState(false)
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

  const deleteSaleMut = useMutation({
    mutationFn: (id: string) => deleteSaleGroup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sale-groups'] }),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/collection/${id}`, { method: 'DELETE' }),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['collection'] })
      const previous = queryClient.getQueryData<CollectionEntry[]>(['collection', false])
      queryClient.setQueryData<CollectionEntry[]>(['collection', false], (old) =>
        old ? old.filter((e) => e.id !== id) : []
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['collection', false], context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] })
      void queryClient.invalidateQueries({ queryKey: ['collection-stats'] })
    },
  })

  // Fetch currency conversion rates for entries with purchase groups or priceCurrency
  // Includes: costCur→dc (for display) and feeCurrency→costCur (for fee normalization)
  useEffect(() => {
    const defaultCurrency = user?.preferredCurrency
    if (!defaultCurrency || entries.length === 0) return
    const combos = new Set<string>()
    for (const e of entries) {
      if (!e.allocatedPrice) continue
      const from = e.priceCurrency ?? e.purchaseGroup?.currency
      const date = e.purchaseGroup?.purchasedAt?.slice(0, 10)
        ?? e.purchaseDate?.slice(0, 10)
        ?? e.acquiredAt?.slice(0, 10)
        ?? new Date().toISOString().slice(0, 10)
      if (from) {
        // costCur → defaultCurrency (for display conversion)
        if (from !== defaultCurrency) {
          combos.add(`${from}:${defaultCurrency}:${date}`)
        }
        // feeCurrency → costCur (to normalize fees into purchase currency)
        for (const fee of e.purchaseFees ?? []) {
          if (fee.currency !== from) {
            combos.add(`${fee.currency}:${from}:${date}`)
          }
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

  const filtered = entries.filter((e) => {
    if (bookFilter && !e.edition.book.title.toLowerCase().includes(bookFilter.toLowerCase())) return false
    if (sigFilter === 'UNSIGNED' && e.signatureType) return false
    if (sigFilter === 'SIGNED' && e.signatureType !== 'signed') return false
    if (sigFilter === 'DIGITALLY_SIGNED' && e.signatureType !== 'digitally_signed') return false
    if (sigFilter === 'SIGNED_BOOKPLATE' && e.signatureType !== 'signed_bookplate') return false
    if (statusFilter !== 'ALL' && e.ownershipStatus !== statusFilter) return false
    if (companyFilter !== 'ALL' && e.edition.bookBoxCompany?.name !== companyFilter) return false
    if (tagFilter !== 'ALL') {
      const entryTags = e.edition?.id ? (tagOverrides[e.edition.id] ?? e.tags) : e.tags
      if (!entryTags.includes(tagFilter)) return false
    }
    if (filter === 'SERIES') return !!e.edition.book.seriesName
    if (filter === 'YEAR') return !!e.acquiredAt
    return true
  })

  const grouped: CollectionEntry[][] = (() => {
    if (filter === 'BOOK') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of filtered) {
        const key = e.edition.book.id
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      // Sort: books with multiple editions first
      return Array.from(map.values()).sort((a, b) => b.length - a.length)
    }
    if (filter === 'SERIES') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of filtered) {
        const key = e.edition.book.seriesName ?? 'Standalone'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.values())
    }
    if (filter === 'YEAR') {
      const map = new Map<string, CollectionEntry[]>()
      for (const e of filtered) {
        const key = e.acquiredAt ? new Date(e.acquiredAt).getFullYear().toString() : 'Unknown'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      }
      return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([, v]) => v)
    }
    return [filtered]
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">My Collection</h1>
          <p className="text-stone-400 text-sm mt-1">Your physical book library</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddBundleOpen(true)}
            className="flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-stone-100 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Package size={16} />
            Add Bundle
          </button>
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
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
          <p className="text-2xl font-serif font-bold text-amber-400">{stats?.totalOwned ?? entries.length}</p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Series</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {new Set(entries.map((e) => e.edition.book.seriesName).filter(Boolean)).size}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Authors</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {new Set(entries.flatMap((e) => e.edition.book.authors.map((a) => (a as any).author?.id ?? a.id))).size}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-stone-800 pb-0">
        <button
          onClick={() => setTab('books')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'books'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          Books
        </button>
        <button
          onClick={() => setTab('bundles')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'bundles'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          Bundles {bundles.length > 0 && <span className="ml-1 text-xs">({bundles.length})</span>}
        </button>
        <button
          onClick={() => setTab('sales')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'sales'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          Sales {saleGroups.length > 0 && <span className="ml-1 text-xs">({saleGroups.length})</span>}
        </button>
      </div>

      {tab === 'bundles' ? (
        /* ─── Bundles tab ─── */
        <div>
          {bundles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-500">
              <Package size={48} className="mb-4 opacity-30" />
              <p className="font-serif text-lg">No bundles yet</p>
              <p className="text-sm mt-1">Add a bundle to track a group purchase</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {bundles.map((bundle) => (
                <div key={bundle.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-4 hover:border-stone-700 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-stone-200 font-medium">
                        {bundle.title ?? new Date(bundle.purchasedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      {bundle.saleAnnouncement && (
                        <a
                          href={`/sale-announcements/${bundle.saleAnnouncement.id}`}
                          className="text-xs text-amber-400 hover:underline"
                        >
                          {bundle.saleAnnouncement.title}
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full">
                      {bundle.bookCount ?? 0} book{(bundle.bookCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div>
                      <p className="text-xs text-stone-500">Total</p>
                      <p className="text-lg font-bold text-amber-400">{bundle.totalAmount} {bundle.currency}</p>
                    </div>
                    {bundle.perBookCost != null && (bundle.bookCount ?? 0) > 1 && (
                      <div>
                        <p className="text-xs text-stone-500">Per book</p>
                        <p className="text-sm font-medium text-stone-300">{bundle.perBookCost} {bundle.currency}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'sales' ? (
        /* ─── Sales tab ─── */
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-stone-400">{saleGroups.length} sale{saleGroups.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setAddSaleOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus size={14} /> New Sale
            </button>
          </div>
          {saleGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-500">
              <ShoppingBag size={48} className="mb-4 opacity-30" />
              <p className="font-serif text-lg">No sales yet</p>
              <p className="text-sm mt-1">Track books you have sold — individually or as a set</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {saleGroups.map((sg) => (
                <div key={sg.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-4 hover:border-stone-700 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-stone-200 font-medium">
                        {sg.title ?? new Date(sg.soldAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      {sg.platform && (
                        <span className="text-xs text-stone-400 bg-stone-800 px-2 py-0.5 rounded-full mt-1 inline-block">
                          {sg.platform}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full">
                        {sg.entries?.length ?? 0} book{(sg.entries?.length ?? 0) !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => deleteSaleMut.mutate(sg.id)}
                        className="ml-1 p-1 text-stone-500 hover:text-red-400 transition-colors"
                        title="Delete sale"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div>
                      <p className="text-xs text-stone-500">Sold for</p>
                      <p className="text-lg font-bold text-amber-400">{sg.totalAmount} {sg.currency}</p>
                    </div>
                    {sg.profitLoss != null && (
                      <div>
                        <p className="text-xs text-stone-500">P&amp;L</p>
                        <p className={`text-sm font-semibold ${sg.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {sg.profitLoss >= 0 ? '+' : ''}{sg.profitLoss.toFixed(2)} {sg.currency}
                        </p>
                      </div>
                    )}
                  </div>
                  {sg.soldAt && (
                    <p className="text-xs text-stone-500 mt-2">{new Date(sg.soldAt).toLocaleDateString()}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ─── Books tab ─── */
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
              <option value="DIGITALLY_SIGNED">🖨️ Digitally Signed</option>
              <option value="SIGNED_BOOKPLATE">🏷️ Signed Bookplate</option>
            </select>

            {/* Ownership status */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-blue-400 transition-colors cursor-pointer ${statusFilter !== 'ALL' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
            >
              <option value="ALL">Status: Any</option>
              <option value="OWNED">Owned</option>
              <option value="PREORDER">Pre-order</option>
              <option value="TO_SELL">To Sell</option>
              <option value="SHIPPING">Shipping</option>
              <option value="BORROWED">Borrowed</option>
              <option value="LENDED">Lent Out</option>
              <option value="SOLD">Sold</option>
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

            {/* Reset all */}
            {(sigFilter !== 'ALL' || statusFilter !== 'ALL' || companyFilter !== 'ALL' || tagFilter !== 'ALL' || filter !== 'ALL' || bookFilter) && (
              <button
                type="button"
                onClick={() => { setSigFilter('ALL'); setStatusFilter('ALL'); setCompanyFilter('ALL'); setTagFilter('ALL'); setFilter('ALL'); setBookFilter('') }}
                className="px-3 py-1.5 rounded-lg text-xs text-stone-500 border border-stone-700 hover:text-red-400 hover:border-red-700/50 transition-colors"
              >
                ✕ Clear
              </button>
            )}

            <span className="text-xs text-stone-600 ml-auto">
              {filtered.length}/{entries.length}
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
                      ? (group[0]?.acquiredAt
                          ? new Date(group[0].acquiredAt).getFullYear().toString()
                          : 'Unknown')
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
                        {filter !== 'BOOK' && groupLabel}
                        {filter === 'BOOK' && group.length > 1 && (
                          <span className="text-xs font-sans font-normal text-stone-500 bg-stone-800 rounded-full px-2 py-0.5">{group.length} editions</span>
                        )}
                      </h2>
                    )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {group.map((entry) => (
                    <EditionCard
                      key={entry.id}
                      href={`/editions/${entry.edition.slug}`}
                      coverImage={entry.edition.coverImage}
                      companyName={entry.edition.bookBoxCompany?.name}
                      seriesName={entry.edition.book.seriesName}
                      volumeNumber={entry.edition.book.volumeNumber}
                      title={entry.edition.book.title}
                      authors={(entry.edition.book.authors as any[]).map(a => a.author ?? a)}
                      imageActions={
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMutation.mutate(entry.id) }}
                          disabled={removeMutation.isPending}
                          className="absolute top-2 right-2 p-1.5 bg-stone-950/80 text-stone-400 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
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
                                {entry.ownershipStatus}
                              </span>
                              {openDropdown === `${entry.id}-ownership` && (
                                <div className="absolute bottom-full left-0 mb-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl min-w-max overflow-hidden">
                                  {(['PREORDER', 'OWNED', 'TO_SELL', 'SHIPPING', 'BORROWED', 'LENDED', 'SOLD', 'GIFTED_AWAY'] as const).map((val) => (
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
                                      {val}
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
                                  entry.readingStatus === 'DNF' ? 'text-rose-500 bg-rose-500/10 border-rose-500/30' :
                                  'text-stone-500 bg-stone-500/10 border-stone-500/30'
                                }`}
                              >
                                {entry.readingStatus === 'DNF' ? 'DNF' : entry.readingStatus === 'READ' ? 'READ' : 'UNREAD'}
                              </span>
                              {openDropdown === `${entry.id}-reading` && (
                                <div className="absolute bottom-full left-0 mb-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl min-w-max overflow-hidden">
                                  {(['READ', 'UNREAD', 'DNF'] as const).map((val) => (
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
                                      {val === 'DNF' ? 'DNF (Did Not Finish)' : val === 'READ' ? 'Read' : 'Unread'}
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
                            {entry.signatureType && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                entry.signatureType === 'signed'
                                  ? 'text-purple-400 bg-purple-500/10 border-purple-500/30'
                                  : entry.signatureType === 'signed_bookplate'
                                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                                  : 'text-blue-400 bg-blue-500/10 border-blue-500/30'
                              }`}>
                                {entry.signatureType === 'signed' ? '✍️ SIGNED' : entry.signatureType === 'signed_bookplate' ? '🏷️ BOOKPLATE' : '🖨️ DIGITAL'}
                              </span>
                            )}
                          </div>

                          {/* Cost display */}
                          {entry.allocatedPrice && (entry.priceCurrency || entry.purchaseGroup?.currency) && (() => {
                            const costCur = entry.priceCurrency ?? entry.purchaseGroup!.currency
                            const dc = user?.preferredCurrency
                            const dateStr = entry.purchaseGroup?.purchasedAt?.slice(0, 10)
                              ?? entry.purchaseDate?.slice(0, 10)
                              ?? entry.acquiredAt?.slice(0, 10)
                              ?? new Date().toISOString().slice(0, 10)
                            const fees = entry.purchaseFees ?? []
                            // Convert each fee to costCur before summing
                            const feesInCostCur = fees.reduce((sum, f) => {
                              const feeAmt = parseDecimalInput(f.amount)
                              if (f.currency === costCur) return sum + feeAmt
                              const rateKey = `${f.currency}:${costCur}:${dateStr}`
                              const rate = conversionRates[rateKey]
                              return sum + (rate ? feeAmt * rate : feeAmt)
                            }, 0)
                            const totalInCostCur = parseDecimalInput(entry.allocatedPrice) + feesInCostCur
                            return (
                              <p className="text-[10px] text-stone-400">
                                {totalInCostCur.toFixed(2)} {costCur}
                                {dc && costCur !== dc && (() => {
                                  const key = `${costCur}:${dc}:${dateStr}`
                                  const rate = conversionRates[key]
                                  if (!rate) return null
                                  return <span className="text-stone-500"> · ~{(totalInCostCur * rate).toFixed(2)} {dc}</span>
                                })()}
                              </p>
                            )
                          })()}

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
                              tags={tagOverrides[entry.edition.id] ?? entry.tags ?? []}
                              allTags={allUserTags}
                              onSaved={handleTagsSaved}
                            />
                          )}
                        </div>
                      }
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
        </>
      )}

      {/* Add to Collection modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add to Collection">
        <div className="space-y-4">
          <p className="text-sm text-stone-400">
            Search for an edition to add to your collection.
          </p>
          <input
            type="text"
            placeholder="Search by title, author, series…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
          <a
            href={`/search?q=${encodeURIComponent(searchQuery)}`}
            className="block w-full text-center bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            Go to Search
          </a>
        </div>
      </Modal>

      <AddBundleModal open={addBundleOpen} onClose={() => setAddBundleOpen(false)} />

      {/* ─── Add Sale Modal ─── */}
      <Modal open={addSaleOpen} onClose={() => setAddSaleOpen(false)} title="Record a Sale">
        <AddSaleForm
          entries={entries.filter(e => e.ownershipStatus !== 'SOLD')}
          onClose={() => setAddSaleOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['sale-groups'] })
            queryClient.invalidateQueries({ queryKey: ['collection'] })
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

