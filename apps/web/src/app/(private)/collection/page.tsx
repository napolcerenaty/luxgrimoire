'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { createPurchaseGroup, getPurchaseGroups } from '@/lib/api'
import type { ApiPurchaseGroup } from '@luxgrimoire/shared-types'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EditionCard } from '@/components/books/EditionCard'
import { Plus, Trash2, BookOpen, Package } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

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
  purchaseGroup: { id: string; currency: string; purchasedAt: string } | null
  edition: {
    id: string
    slug: string
    coverImage: string | null
    publisher: string | null
    publishYear: number | null
    format: string | null
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
  publishYear: number | null
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ed.coverImage} alt="" className="w-8 h-10 object-cover rounded" />
                    )}
                    <div>
                      <p className="text-stone-200">{ed.book.title}</p>
                      <p className="text-stone-500 text-xs">{ed.publisher ?? ''} {ed.publishYear ?? ''}</p>
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

interface CollectionStats {
  totalOwned: number
  totalWishlist?: number
}

const CONDITION_COLORS: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  MINT: 'success',
  NEAR_MINT: 'success',
  FINE: 'default',
  VERY_GOOD: 'default',
  GOOD: 'warning',
  FAIR: 'warning',
  POOR: 'destructive',
}

type FilterMode = 'ALL' | 'SERIES' | 'YEAR'

export default function CollectionPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [filter, setFilter] = useState<FilterMode>('ALL')
  const [bookFilter, setBookFilter] = useState('')
  const [tab, setTab] = useState<'books' | 'bundles'>('books')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addBundleOpen, setAddBundleOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [conversionRates, setConversionRates] = useState<Record<string, number>>({})

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
      authFetch<{ data: CollectionEntry[]; total: number }>('/collection').then((r) => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['collection-stats'],
    queryFn: () => authFetch<CollectionStats>('/collection/stats'),
  })

  const { data: bundles = [] } = useQuery({
    queryKey: ['purchase-groups'],
    queryFn: getPurchaseGroups,
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
      if (from && from !== defaultCurrency) {
        combos.add(`${from}:${defaultCurrency}:${date}`)
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

  const filtered = entries.filter((e) => {
    if (bookFilter && !e.edition.book.title.toLowerCase().includes(bookFilter.toLowerCase())) return false
    if (filter === 'SERIES') return !!e.edition.book.seriesName
    if (filter === 'YEAR') return !!e.acquiredAt
    return true
  })

  const grouped: CollectionEntry[][] = (() => {
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
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
            {new Set(entries.flatMap((e) => e.edition.book.authors.map((a) => a.id))).size}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Bundles</p>
          <p className="text-2xl font-serif font-bold text-stone-100">{bundles.length}</p>
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
      ) : (
        /* ─── Books tab ─── */
        <>
          {/* Search + Filters */}
          <div className="flex flex-col gap-3 mb-6">
            <input
              type="text"
              value={bookFilter}
              onChange={e => setBookFilter(e.target.value)}
              placeholder="Filter by book title…"
              className="w-full max-w-sm bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
            <div className="flex gap-2 flex-wrap">
              {(['ALL', 'SERIES', 'YEAR'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  filter === f
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'text-stone-400 border-stone-700 hover:border-stone-500'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'SERIES' ? 'By Series' : 'By Year'}
              </button>
            ))}
            </div>
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
                  filter === 'SERIES'
                    ? (group[0]?.edition.book.seriesName ?? 'Standalone')
                    : filter === 'YEAR'
                      ? (group[0]?.acquiredAt
                          ? new Date(group[0].acquiredAt).getFullYear().toString()
                          : 'Unknown')
                      : null

                return (
                  <div key={gi}>
                    {groupLabel && (
                      <h2 className="text-lg font-serif font-semibold text-stone-300 mb-4 border-b border-stone-800 pb-2">
                        {groupLabel}
                      </h2>
                    )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {group.map((entry) => (
                    <EditionCard
                      key={entry.id}
                      href={`/books/${entry.edition.book.slug}`}
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
                                  'text-stone-500 bg-stone-500/10 border-stone-500/30'
                                }`}
                              >
                                {entry.readingStatus}
                              </span>
                              {openDropdown === `${entry.id}-reading` && (
                                <div className="absolute bottom-full left-0 mb-1 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl min-w-max overflow-hidden">
                                  {(['READ', 'UNREAD'] as const).map((val) => (
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
                            const feesTotal = fees
                              .reduce((sum, f) => sum + parseFloat(f.amount), 0)
                            const totalInCostCur = parseFloat(entry.allocatedPrice) + feesTotal
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
    </div>
  )
}

