'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'
import { EditionCard } from '@/components/books/EditionCard'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import { BookOpen, Megaphone, Tag, Trash2, MoveRight, ShoppingCart, X } from 'lucide-react'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import { AddToCollectionButton, type SaleEditionData } from '@/app/(public)/sale-announcements/[id]/AddToCollectionButton'
import { CollectionFormModal, type CollectionFormData } from '@/components/collection/CollectionFormModal'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

interface CollectionEntry {
  id: string
  isWishlist: boolean
  condition: string | null
  acquiredAt: string | null
  edition: {
    id: string
    slug: string
    publisher: string | null
    additionalImages: string[]
    communityPhotoCover?: string | null
    variantLabel?: string | null
    bookBoxCompany: { id: string; name: string; slug: string; brandColors?: string[] | null } | null
    book: {
      id: string
      title: string
      slug: string
      seriesName: string | null
      volumeNumbers: number[]
      authors: Array<{ id: string; name: string; slug: string }>
    }
  }
}

interface PaginatedEntries {
  data: CollectionEntry[]
  total: number
  page: number
  pageSize: number
}

interface SaleInterestItem {
  userId: string
  announcementId: string
  selectedPrice: number | null
  selectedPriceCurrency: string | null
  /** The concrete tier this interest points at — its date IS the resolved date, no
   *  FA/EA/GS fallback-chain needed. Null for pre-migration interests not yet backfilled. */
  saleTier: { id: string; name: string; date: string; regionId: string | null } | null
  announcement: {
    id: string
    title: string
    imageUrl: string | null
    basePrice: number | null
    subscriberBasePrice: number | null
    currency: string | null
    endsAt: string | null
    saleType: string | null
    company: { id: string; name: string; slug: string; logoUrl: string | null; brandColors?: string[] | null } | null
  }
}

function getEffectiveDate(interest: SaleInterestItem): string | null {
  // OPEN_PREORDER has no tier "opens at" moment — the relevant date is the closing deadline.
  if (interest.announcement.saleType === 'OPEN_PREORDER') return interest.announcement.endsAt
  return interest.saleTier?.date ?? null
}

const OWNERSHIP_OPTIONS = [
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping' },
  { value: 'OWNED', label: 'Own' },
  { value: 'BORROWED', label: 'Borrowed' },
  { value: 'LENDED', label: 'Lended' },
  { value: 'TO_SELL', label: 'To Sell' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'GIFTED_AWAY', label: 'Gifted Away' },
] as const

export default function WishlistPage() {
  const queryClient = useQueryClient()
  const getBrandColors = useBrandColors()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'wishlist' | 'sales'>(() =>
    searchParams.get('tab') === 'sales' ? 'sales' : 'wishlist'
  )
  const [moveEntry, setMoveEntry] = useState<CollectionEntry | null>(null)

  const [addModalSale, setAddModalSale] = useState<ApiSaleAnnouncement | null>(null)
  const [addModalLoading, setAddModalLoading] = useState<string | null>(null)

  // Sale interests filters
  const [companyFilter, setCompanyFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showSaleFilters, setShowSaleFilters] = useState(false)

  const openAddModal = async (announcementId: string) => {
    setAddModalLoading(announcementId)
    try {
      const sale = await apiFetch<ApiSaleAnnouncement>(`/announcements/${announcementId}`)
      setAddModalSale(sale)
    } catch { /* ignore */ } finally {
      setAddModalLoading(null)
    }
  }

  const { data: result, isLoading } = useQuery({
    queryKey: ['collection', 'wishlist-slim'],
    queryFn: () => authFetch<PaginatedEntries>('/collection?isWishlist=true&slim=true&pageSize=100'),
    enabled: activeTab === 'wishlist',
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const { data: saleInterests = [], isLoading: isLoadingSales } = useQuery({
    queryKey: ['sale-interests'],
    queryFn: () => authFetch<SaleInterestItem[]>('/sale-interests'),
    enabled: activeTab === 'sales',
  })

  // Derive company list from loaded interests (no extra API call)
  const filterCompanies = useMemo(() => {
    const seen = new Map<string, string>()
    saleInterests.forEach((i) => {
      const company = i.announcement?.company
      if (company?.id) seen.set(company.id, company.name)
    })
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [saleInterests])

  const clearAllFilters = () => {
    setCompanyFilter('')
    setSaleTypeFilter('')
    setTimeFilter('upcoming')
    setDateFrom('')
    setDateTo('')
  }

  // Time filter is its own always-visible segmented control (not tucked behind "Filters"), so
  // it doesn't need a redundant chip here — the active segment already shows the current state.
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = []
    if (companyFilter) chips.push({ key: 'company', label: filterCompanies.find(c => c.id === companyFilter)?.name ?? companyFilter, onRemove: () => setCompanyFilter('') })
    if (saleTypeFilter) chips.push({ key: 'saleType', label: saleTypeFilter.replace('_', ' ').toLowerCase(), onRemove: () => setSaleTypeFilter('') })
    if (dateFrom) chips.push({ key: 'dateFrom', label: `From ${dateFrom}`, onRemove: () => setDateFrom('') })
    if (dateTo) chips.push({ key: 'dateTo', label: `To ${dateTo}`, onRemove: () => setDateTo('') })
    return chips
  }, [companyFilter, saleTypeFilter, dateFrom, dateTo, filterCompanies])

  const filteredInterests = useMemo(() => {
    const now = new Date()
    const list = saleInterests.filter((interest) => {
      if (companyFilter && interest.announcement.company?.id !== companyFilter) return false
      if (saleTypeFilter && interest.announcement.saleType !== saleTypeFilter) return false
      const d = getEffectiveDate(interest)
      const saleDate = d ? new Date(d) : null
      if (timeFilter !== 'all') {
        if (timeFilter === 'upcoming' && (!saleDate || saleDate <= now)) return false
        if (timeFilter === 'past' && (!saleDate || saleDate > now)) return false
      }
      if (dateFrom || dateTo) {
        const dateStr = d ? d.slice(0, 10) : null
        if (dateFrom && (!dateStr || dateStr < dateFrom)) return false
        if (dateTo && (!dateStr || dateStr > dateTo)) return false
      }
      return true
    })

    // Ascending (soonest first) on Upcoming, descending (most recent first) on All/Past —
    // undated interests always sort last regardless of direction.
    const dir = timeFilter === 'upcoming' ? 1 : -1
    return list
      .map((interest) => ({ interest, date: getEffectiveDate(interest) }))
      .sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return dir * (new Date(a.date).getTime() - new Date(b.date).getTime())
      })
      .map(({ interest }) => interest)
  }, [saleInterests, companyFilter, saleTypeFilter, timeFilter, dateFrom, dateTo])

  const removeSaleInterestMutation = useMutation({
    mutationFn: (announcementId: string) => authFetch<void>(`/sale-interests/${announcementId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sale-interests'] }),
  })

  const entries = result?.data ?? []

  const removeMutation = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/collection/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['collection'] }),
  })

  const moveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CollectionFormData }) => {
      const body: Record<string, unknown> = { isWishlist: false, ownershipStatus: data.ownershipStatus }
      if (data.purchasedAt) body.acquiredAt = new Date(data.purchasedAt).toISOString()
      await authFetch<void>(`/collection/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      const feeDate = data.purchasedAt || new Date().toISOString().slice(0, 10)
      const parsedPrice = parseDecimalInput(data.totalAmount)
      const parsedShipping = parseDecimalInput(data.shippingAmount)
      const hasFees = data.feeEntries.some(f => parseDecimalInput(f.amount) > 0)
      const hasDiscounts = data.discountEntries.some(d => parseDecimalInput(d.amount) > 0)
      let purchaseGroupId: string | null = null
      if (parsedPrice > 0 || parsedShipping > 0 || hasFees || hasDiscounts) {
        const group = await authFetch<{ id: string }>(`/collection/bundles/for-entry/${id}`, {
          method: 'POST',
          body: JSON.stringify({
            totalAmount: parsedPrice > 0 ? parsedPrice : 0,
            currency: data.currency,
            shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
            purchasedAt: new Date(feeDate).toISOString(),
            isSecondHand: data.isSecondHand,
            sourcePlatform: data.sourcePlatform || undefined,
          }),
        })
        purchaseGroupId = group?.id ?? null
      }
      if (data.orderNumber.trim()) {
        await authFetch<void>(`/collection/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ orderNumber: data.orderNumber.trim() }),
        }).catch(() => {})
      }
      for (const fee of data.feeEntries) {
        const parsedAmount = parseDecimalInput(fee.amount)
        if (parsedAmount <= 0) continue
        const template = data.feeTemplates.find(t => t.id === fee.templateId)
        await authFetch('/fees', {
          method: 'POST',
          body: JSON.stringify({
            feeTemplateId: template?.id,
            name: template?.name ?? 'Fee',
            amount: parsedAmount,
            currency: fee.currency,
            date: feeDate,
            category: template?.category ?? undefined,
            ...(purchaseGroupId ? { purchaseGroupId } : {}),
          }),
        })
      }
      for (const disc of data.discountEntries) {
        const parsedAmount = parseDecimalInput(disc.amount)
        if (parsedAmount <= 0 || !disc.name.trim()) continue
        await authFetch('/fees/discounts', {
          method: 'POST',
          body: JSON.stringify({
            name: disc.name.trim(),
            amount: parsedAmount,
            currency: disc.currency,
            date: feeDate,
            ...(purchaseGroupId ? { purchaseGroupId } : {}),
          }),
        })
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] })
      void queryClient.invalidateQueries({ queryKey: ['collection-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['spending-stats-v2'] })
      setMoveEntry(null)
    },
  })

  if (isLoading && activeTab === 'wishlist') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-navy-400 animate-pulse">Loading wishlist…</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-navy-100">My Library</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 bg-navy-900 border border-navy-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('wishlist')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'wishlist'
              ? 'bg-navy-800 text-navy-100'
              : 'text-navy-400 hover:text-navy-200'
          }`}
        >
          <BookOpen size={15} />
          Books I want
          {entries.length > 0 && (
            <span className="bg-navy-700 text-navy-300 text-xs px-1.5 py-0.5 rounded-full">{entries.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'sales'
              ? 'bg-navy-800 text-navy-100'
              : 'text-navy-400 hover:text-navy-200'
          }`}
        >
          <Megaphone size={15} />
          Sale Announcements
          {saleInterests.length > 0 && (
            <span className="bg-navy-700 text-navy-300 text-xs px-1.5 py-0.5 rounded-full">{saleInterests.length}</span>
          )}
        </button>
      </div>

      {/* Wishlist tab */}
      {activeTab === 'wishlist' && (
        entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-navy-500">
            <BookOpen size={48} className="mb-4 opacity-30" />
            <p className="font-serif text-lg">Your wishlist is empty</p>
            <p className="text-sm mt-1">Add books you want to read or own</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {entries.map((entry) => (
              <EditionCard
                key={entry.id}
                href={`/editions/${entry.edition.slug}`}
                coverImage={resolveEditionCoverRaw(entry.edition)}
                companyName={entry.edition.bookBoxCompany?.name}
                companyBrandColors={getBrandColors(entry.edition.bookBoxCompany?.slug) ?? entry.edition.bookBoxCompany?.brandColors}
                volumeNumbers={entry.edition.book.volumeNumbers}
                title={entry.edition.book.title}
                variantLabel={entry.edition.variantLabel}
                authors={(entry.edition.book.authors as any[]).map(a => a.author ?? a)}
                imageActions={
                  <div className="absolute inset-0 bg-navy-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        setMoveEntry(entry)
                      }}
                      className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-60 text-navy-950 font-semibold px-3 py-1.5 rounded-lg text-xs w-full justify-center transition-colors"
                    >
                      <MoveRight size={12} />
                      Move to Collection
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMutation.mutate(entry.id) }}
                      disabled={removeMutation.isPending}
                      className="flex items-center gap-1.5 border border-navy-600 text-navy-300 hover:text-red-400 hover:border-red-800 px-3 py-1.5 rounded-lg text-xs w-full justify-center transition-colors"
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )
      )}

      {/* Sale Announcements tab */}
      {activeTab === 'sales' && (
        isLoadingSales ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-navy-400 animate-pulse">Loading…</div>
          </div>
        ) : saleInterests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-navy-500">
            <Megaphone size={48} className="mb-4 opacity-30" />
            <p className="font-serif text-lg">No tracked sales</p>
            <p className="text-sm mt-1">Mark sale announcements as Interested to track them here</p>
          </div>
        ) : (
          <>
            {/* Filters — sizing and chip convention matches SubscriptionList
                (apps/web/src/components/subscriptions/SubscriptionList.tsx) */}
            <div className="mb-4 space-y-2">
              {/* Time filter — always visible, not tucked behind the Filters toggle, since it's
                  the primary/most-used split. All first: it's the "no filter applied" baseline. */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-lg border border-navy-700 overflow-hidden text-sm w-fit shrink-0">
                  {(['all', 'upcoming', 'past'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => setTimeFilter(val)}
                      className={`px-3 py-2 capitalize transition-colors border-r border-navy-700 last:border-0 ${
                        timeFilter === val ? 'bg-brand-500/20 text-brand-400' : 'bg-navy-800 text-navy-400 hover:text-navy-200'
                      }`}
                    >
                      {val === 'upcoming' ? 'Upcoming' : val === 'past' ? 'Past' : 'All'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowSaleFilters(p => !p)}
                  aria-expanded={showSaleFilters}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm shrink-0 transition-colors ${
                    showSaleFilters ? 'bg-navy-700 border-brand-600 text-brand-400' : 'bg-navy-800 border-navy-700 text-navy-300'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  Filters
                  {activeFilterChips.length > 0 && (
                    <span className="ml-0.5 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center rounded-full bg-brand-600 text-[10px] font-semibold text-navy-950">
                      {activeFilterChips.length}
                    </span>
                  )}
                </button>
                <span className="text-sm text-navy-500">{filteredInterests.length} / {saleInterests.length}</span>
              </div>

              {/* Collapsible filter panel — company/type/date-range only; sized to content on
                  desktop (not stretched across half the row each) via flex-wrap + fixed widths. */}
              {showSaleFilters && (
                <div className="rounded-xl border border-navy-700/60 bg-navy-900/60 p-3">
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                    {/* Company filter */}
                    <select
                      value={companyFilter}
                      onChange={(e) => setCompanyFilter(e.target.value)}
                      className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-navy-200 focus:outline-none focus:border-brand-600 sm:w-44"
                    >
                      <option value="">All companies</option>
                      {filterCompanies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    {/* Sale type filter */}
                    <select
                      value={saleTypeFilter}
                      onChange={(e) => setSaleTypeFilter(e.target.value)}
                      className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-navy-200 focus:outline-none focus:border-brand-600 sm:w-40"
                    >
                      <option value="">All types</option>
                      <option value="LIMITED_PREORDER">⏳ Limited Preorder</option>
                      <option value="OPEN_PREORDER">🔓 Open Preorder</option>
                      <option value="OVERSTOCK">📦 Overstock</option>
                    </select>

                    {/* Date from */}
                    <label className="flex items-center gap-1.5 bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-navy-400 focus-within:border-brand-600 sm:w-auto">
                      <span className="shrink-0 text-navy-500">From</span>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-transparent text-navy-300 focus:outline-none w-full sm:w-auto"
                      />
                    </label>

                    {/* Date to */}
                    <label className="flex items-center gap-1.5 bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-navy-400 focus-within:border-brand-600 sm:w-auto">
                      <span className="shrink-0 text-navy-500">To</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-transparent text-navy-300 focus:outline-none w-full sm:w-auto"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Active filter chips — always visible when filters are applied, independent of
                  whether the panel is expanded, each removable individually */}
              {activeFilterChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      onClick={chip.onRemove}
                      className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-brand-950/40 border border-brand-800/50 text-brand-300 text-xs hover:bg-brand-950/70 transition-colors capitalize"
                    >
                      {chip.label}
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                  <button onClick={clearAllFilters} className="text-xs text-navy-500 hover:text-navy-300 underline underline-offset-2 ml-1">
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {filteredInterests.length === 0 ? (
              <div className="text-center py-12 text-navy-500">
                <p>No results for current filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredInterests.map((interest) => {
                  const { announcement: sa } = interest
                  const coverSrc = sa.imageUrl ? cloudinaryUrl(sa.imageUrl, 'w_400,h_600,c_fill,q_auto,f_auto') : null
                  const effectiveDate = getEffectiveDate(interest)
                  // effectiveDate is a closing deadline for OPEN_PREORDER (endsAt), not an
                  // opens-at date like FA/EA/GS — "open" means not yet past that deadline,
                  // the opposite comparison from every other sale type.
                  const isOpen = sa.saleType === 'OPEN_PREORDER'
                    ? !effectiveDate || new Date(effectiveDate) > new Date()
                    : !!effectiveDate && new Date(effectiveDate) <= new Date()
                  const dateLabel = effectiveDate
                    ? new Date(effectiveDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                    : null
                  const tl = interest.saleTier?.name ?? 'General Sale'

                  return (
                    <div key={sa.id} className="relative flex flex-col rounded-2xl bg-navy-900 border border-navy-800 hover:border-brand-700/60 transition-all hover:shadow-xl hover:shadow-brand-900/10 group">
                      {/* Image — same 2/3 portrait ratio as AnnouncementCard/EditionCard */}
                      <div className="relative aspect-[2/3] bg-navy-950 overflow-hidden rounded-t-2xl">
                        {coverSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={coverSrc}
                            alt={sa.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="relative w-full h-full flex items-center justify-center text-navy-600">
                            <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(sa.company ? (getBrandColors(sa.company.slug) ?? sa.company.brandColors) : null)} />
                            <p className="relative z-10 font-serif font-semibold text-center px-3 text-sm leading-snug line-clamp-4 text-navy-300">
                              {sa.title}
                            </p>
                          </div>
                        )}

                        {/* Company ribbon — same style as AnnouncementCard/EditionCarousel */}
                        {sa.company?.name && (
                          <div className="card-ribbon absolute bottom-0 left-0 right-0 px-2 py-2 text-center pointer-events-none">
                            <span
                              className="card-ribbon-text font-serif font-semibold uppercase leading-none line-clamp-1 text-white"
                              style={{ fontSize: '10px', letterSpacing: '0.12em' }}
                            >
                              {sa.company.name}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <p className="text-navy-100 text-sm font-medium leading-tight line-clamp-2 group-hover:text-brand-400 transition-colors">{sa.title}</p>
                        {dateLabel && (
                          <p className="text-xs text-navy-500 flex items-center gap-1">
                            <Tag size={10} />
                            <span className={isOpen ? 'text-green-400' : ''}>{tl}{isOpen ? ' (open)' : ''}: {dateLabel}</span>
                          </p>
                        )}
                        <div className="flex flex-col gap-1.5 pt-1">
                          <div className="flex gap-1.5">
                            <Link
                              href={`/sale-announcements/${sa.id}`}
                              className="flex-1 text-center text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-navy-800 hover:bg-navy-700 text-navy-300 border border-navy-700"
                            >
                              View
                            </Link>
                            <button
                              onClick={() => removeSaleInterestMutation.mutate(sa.id)}
                              disabled={removeSaleInterestMutation.isPending}
                              className="p-1.5 text-navy-600 hover:text-red-400 border border-navy-800 hover:border-red-900 rounded-lg transition-colors disabled:opacity-50"
                              title="Remove from tracked sales"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          {isOpen && (
                            <button
                              onClick={() => openAddModal(sa.id)}
                              disabled={addModalLoading === sa.id}
                              className="flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 border border-brand-700 disabled:opacity-50 w-full"
                            >
                              <ShoppingCart size={13} />
                              {addModalLoading === sa.id ? '…' : 'Add'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )
      )}

      <CollectionFormModal
        open={!!moveEntry}
        onClose={() => setMoveEntry(null)}
        title="Move to Collection"
        submitLabel="Move"
        subtitle={moveEntry ? formatEditionDisplayTitle(moveEntry.edition.book, moveEntry.edition) : null}
        defaultOwnershipStatus="PREORDER"
        ownershipOptions={[...OWNERSHIP_OPTIONS]}
        submitting={moveMutation.isPending}
        error={moveMutation.error instanceof Error ? moveMutation.error.message : null}
        onSubmit={async (data) => {
          if (!moveEntry) return
          await moveMutation.mutateAsync({ id: moveEntry.id, data })
        }}
      />

      {addModalSale && (
        <AddToCollectionButton
          saleAnnouncementId={addModalSale.id}
          editions={(addModalSale.editions ?? []) as SaleEditionData[]}
          basePrice={addModalSale.basePrice ?? undefined}
          currency={addModalSale.currency ?? 'EUR'}
          defaultOpen
          onClose={() => setAddModalSale(null)}
        />
      )}
    </div>
  )
}
