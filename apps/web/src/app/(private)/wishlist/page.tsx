'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'
import { EditionCard } from '@/components/books/EditionCard'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
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

interface PaginatedEntries {
  data: CollectionEntry[]
  total: number
  page: number
  pageSize: number
}

interface SaleRegion {
  id: string
  firstAccessDate: string | null
  earlyAccessDate: string | null
  generalSaleDate: string | null
}

interface SaleInterestItem {
  userId: string
  announcementId: string
  tier: string
  regionId: string | null
  selectedPrice: number | null
  selectedPriceCurrency: string | null
  announcement: {
    id: string
    title: string
    imageUrl: string | null
    basePrice: number | null
    subscriberBasePrice: number | null
    currency: string | null
    generalSaleDate: string | null
    earlyAccessDate: string | null
    firstAccessDate: string | null
    company: { id: string; name: string; slug: string; logoUrl: string | null; brandColors?: string[] | null }
    regions: SaleRegion[]
  }
}

/** Returns the effective sale-open date for this interest based on region + tier. */
function getEffectiveDate(interest: SaleInterestItem): string | null {
  const { announcement: sa, regionId, tier } = interest
  const region = regionId ? sa.regions?.find((r) => r.id === regionId) : null

  const fa = region?.firstAccessDate ?? sa.firstAccessDate
  const ea = region?.earlyAccessDate ?? sa.earlyAccessDate
  const gs = region?.generalSaleDate ?? sa.generalSaleDate

  if (tier === 'FA') return fa ?? ea ?? gs
  if (tier === 'EA') return ea ?? gs
  return gs // 'GS' or unknown
}

function tierLabel(tier: string): string {
  if (tier === 'FA') return 'First Access'
  if (tier === 'EA') return 'Early Access'
  return 'General Sale'
}

const OWNERSHIP_OPTIONS = [
  { value: 'OWNED', label: 'Owned' },
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping / In transit' },
  { value: 'BORROWED', label: 'Borrowed' },
  { value: 'LENDED', label: 'Lent out' },
] as const

export default function WishlistPage() {
  const queryClient = useQueryClient()
  const getBrandColors = useBrandColors()
  const [activeTab, setActiveTab] = useState<'wishlist' | 'sales'>('wishlist')
  const [moveEntry, setMoveEntry] = useState<CollectionEntry | null>(null)

  const [addModalSale, setAddModalSale] = useState<ApiSaleAnnouncement | null>(null)
  const [addModalLoading, setAddModalLoading] = useState<string | null>(null)

  // Sale interests filters
  const [companyFilter, setCompanyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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
    saleInterests.forEach((i) => seen.set(i.announcement.company.id, i.announcement.company.name))
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [saleInterests])

  const hasFilters = companyFilter || dateFrom || dateTo

  const filteredInterests = useMemo(() => {
    if (!hasFilters) return saleInterests
    return saleInterests.filter((interest) => {
      if (companyFilter && interest.announcement.company.id !== companyFilter) return false
      if (dateFrom || dateTo) {
        const d = getEffectiveDate(interest)
        const dateStr = d ? d.slice(0, 10) : null
        if (dateFrom && (!dateStr || dateStr < dateFrom)) return false
        if (dateTo && (!dateStr || dateStr > dateTo)) return false
      }
      return true
    })
  }, [saleInterests, companyFilter, dateFrom, dateTo, hasFilters])

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
        <div className="text-stone-400 animate-pulse">Loading wishlist…</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-stone-100">My Library</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 bg-stone-900 border border-stone-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('wishlist')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'wishlist'
              ? 'bg-stone-800 text-stone-100'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <BookOpen size={15} />
          Books I want
          {entries.length > 0 && (
            <span className="bg-stone-700 text-stone-300 text-xs px-1.5 py-0.5 rounded-full">{entries.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'sales'
              ? 'bg-stone-800 text-stone-100'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Megaphone size={15} />
          Sale Announcements
          {saleInterests.length > 0 && (
            <span className="bg-stone-700 text-stone-300 text-xs px-1.5 py-0.5 rounded-full">{saleInterests.length}</span>
          )}
        </button>
      </div>

      {/* Wishlist tab */}
      {activeTab === 'wishlist' && (
        entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500">
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
                volumeNumber={entry.edition.book.volumeNumber}
                title={entry.edition.book.title}
                authors={(entry.edition.book.authors as any[]).map(a => a.author ?? a)}
                imageActions={
                  <div className="absolute inset-0 bg-stone-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        setMoveEntry(entry)
                      }}
                      className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold px-3 py-1.5 rounded-lg text-xs w-full justify-center transition-colors"
                    >
                      <MoveRight size={12} />
                      Move to Collection
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMutation.mutate(entry.id) }}
                      disabled={removeMutation.isPending}
                      className="flex items-center gap-1.5 border border-stone-600 text-stone-300 hover:text-red-400 hover:border-red-800 px-3 py-1.5 rounded-lg text-xs w-full justify-center transition-colors"
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
            <div className="text-stone-400 animate-pulse">Loading…</div>
          </div>
        ) : saleInterests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500">
            <Megaphone size={48} className="mb-4 opacity-30" />
            <p className="font-serif text-lg">No tracked sales</p>
            <p className="text-sm mt-1">Mark sale announcements as Interested to track them here</p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              {/* Company filter */}
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-300 focus:outline-none focus:border-amber-500 min-w-[160px]"
              >
                <option value="">All companies</option>
                {filterCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Date from */}
              <label className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-400 focus-within:border-amber-500">
                <span className="shrink-0 text-stone-500 text-xs">From</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  title="Sale date from"
                  className="bg-transparent text-stone-300 focus:outline-none"
                />
              </label>

              {/* Date to */}
              <label className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2.5 text-sm text-stone-400 focus-within:border-amber-500">
                <span className="shrink-0 text-stone-500 text-xs">To</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  title="Sale date to"
                  className="bg-transparent text-stone-300 focus:outline-none"
                />
              </label>

              {hasFilters && (
                <button
                  onClick={() => { setCompanyFilter(''); setDateFrom(''); setDateTo('') }}
                  className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300 border border-stone-700 hover:border-stone-600 px-3 py-2.5 rounded-xl transition-colors"
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            {/* Active filter chips */}
            {hasFilters && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs text-stone-500">Filtered:</span>
                {companyFilter && <span className="text-xs bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full text-stone-300">{filterCompanies.find(c => c.id === companyFilter)?.name}</span>}
                {dateFrom && <span className="text-xs bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full text-stone-300">from {dateFrom}</span>}
                {dateTo && <span className="text-xs bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full text-stone-300">to {dateTo}</span>}
                <span className="text-xs text-stone-500">{filteredInterests.length} / {saleInterests.length}</span>
              </div>
            )}

            {filteredInterests.length === 0 ? (
              <div className="text-center py-12 text-stone-500">
                <p>No results for current filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredInterests.map((interest) => {
                  const { announcement: sa } = interest
                  const coverSrc = sa.imageUrl ? cloudinaryUrl(sa.imageUrl, 'w_400,h_300,c_fill,q_auto,f_auto') : null
                  const effectiveDate = getEffectiveDate(interest)
                  const isOpen = !!effectiveDate && new Date(effectiveDate) <= new Date()
                  const dateLabel = effectiveDate
                    ? new Date(effectiveDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                    : null
                  const tl = tierLabel(interest.tier)

                  return (
                    <div key={sa.id} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden group hover:border-stone-700 transition-colors">
                      {coverSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverSrc} alt={sa.title} className="w-full aspect-[4/3] object-cover" />
                      ) : (
                        <div className="relative w-full aspect-[4/3] flex items-center justify-center bg-stone-900">
                          <div className="absolute inset-0 opacity-[0.18]" style={brandGradientStyle(getBrandColors(sa.company.slug) ?? sa.company.brandColors)} />
                          <span className="relative z-10 text-xs font-serif text-stone-300/80 text-center leading-snug line-clamp-4 px-3">{sa.title}</span>
                        </div>
                      )}
                      <div className="p-3 space-y-2">
                        <p className="text-stone-100 text-sm font-medium leading-tight line-clamp-2">{sa.title}</p>
                        <p className="text-stone-500 text-xs">{sa.company.name}</p>
                        {dateLabel && (
                          <p className="text-xs text-stone-500 flex items-center gap-1">
                            <Tag size={10} />
                            <span className={isOpen ? 'text-green-400' : ''}>{tl}{isOpen ? ' (open)' : ''}: {dateLabel}</span>
                          </p>
                        )}
                        <div className="flex gap-1.5 pt-1">
                          <Link
                            href={`/sale-announcements/${sa.id}`}
                            className="flex-1 text-center text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700"
                          >
                            View
                          </Link>
                          {isOpen && (
                            <button
                              onClick={() => openAddModal(sa.id)}
                              disabled={addModalLoading === sa.id}
                              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-700 disabled:opacity-50"
                            >
                              <ShoppingCart size={11} />
                              {addModalLoading === sa.id ? '…' : 'Add to collection'}
                            </button>
                          )}
                          <button
                            onClick={() => removeSaleInterestMutation.mutate(sa.id)}
                            disabled={removeSaleInterestMutation.isPending}
                            className="p-1.5 text-stone-600 hover:text-red-400 border border-stone-800 hover:border-red-900 rounded-lg transition-colors disabled:opacity-50"
                            title="Remove from tracked sales"
                          >
                            <Trash2 size={12} />
                          </button>
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
        subtitle={moveEntry?.edition.book.title ?? null}
        defaultOwnershipStatus="OWNED"
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
