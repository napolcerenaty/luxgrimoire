'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { EditionCard } from '@/components/books/EditionCard'
import { resolveEditionCoverRaw } from '@/lib/editionCover'
import { BookOpen, Megaphone, Tag, Trash2, MoveRight, X, Plus } from 'lucide-react'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { CURRENCIES, SALE_PLATFORMS } from '@/components/sale/SaleFormFields'

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

interface FeeEntry {
  key: number
  templateId: string
  amount: string
  currency: string
}

interface DiscountEntry {
  key: number
  name: string
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

interface PaginatedEntries {
  data: CollectionEntry[]
  total: number
  page: number
  pageSize: number
}

interface SaleInterestItem {
  userId: string
  announcementId: string
  tier: string
  regionId: string | null
  announcement: {
    id: string
    title: string
    imageUrl: string | null
    generalSaleDate: string | null
    earlyAccessDate: string | null
    firstAccessDate: string | null
    company: { id: string; name: string }
  }
}

const OWNERSHIP_OPTIONS = [
  { value: 'OWNED', label: 'Owned' },
  { value: 'PREORDER', label: 'Pre-order' },
  { value: 'SHIPPING', label: 'Shipping / In transit' },
  { value: 'BORROWED', label: 'Borrowed' },
  { value: 'LENDED', label: 'Lent out' },
] as const

const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
const LABEL = 'block text-xs font-medium text-stone-400 mb-1'

export default function WishlistPage() {
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'wishlist' | 'sales'>('wishlist')
  const [moveEntry, setMoveEntry] = useState<CollectionEntry | null>(null)
  const [moveDate, setMoveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [movePrice, setMovePrice] = useState('')
  const [moveCurrency, setMoveCurrency] = useState('EUR')
  const [moveOwnershipStatus, setMoveOwnershipStatus] = useState<string>('OWNED')
  const [shippingPrice, setShippingPrice] = useState('')
  const [feeEntries, setFeeEntries] = useState<FeeEntry[]>([])
  const [discountEntries, setDiscountEntries] = useState<DiscountEntry[]>([])
  const [isSecondHand, setIsSecondHand] = useState(false)
  const [sourcePlatform, setSourcePlatform] = useState('')
  const feeKeyRef = useRef(0)
  const discountKeyRef = useRef(0)

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

  const removeSaleInterestMutation = useMutation({
    mutationFn: (announcementId: string) => authFetch<void>(`/sale-interests/${announcementId}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sale-interests'] }),
  })

  const { data: feeTemplates = [] } = useQuery({
    queryKey: ['fee-templates'],
    queryFn: () => authFetch<FeeTemplate[]>('/fees/templates?activeOnly=true'),
    enabled: !!moveEntry,
  })

  const entries = result?.data ?? []

  const removeMutation = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/collection/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['collection'] }),
  })

  const moveMutation = useMutation({
    mutationFn: async ({ id, date, price, currency, ownershipStatus, shippingPrice, fees, discounts, isSecondHand, sourcePlatform }: {
      id: string; date: string; price: string; currency: string;
      ownershipStatus: string; shippingPrice: string; fees: FeeEntry[]; discounts: DiscountEntry[];
      isSecondHand: boolean; sourcePlatform: string;
    }) => {
      const body: Record<string, unknown> = { isWishlist: false, ownershipStatus }
      if (date) body.acquiredAt = new Date(date).toISOString()
      await authFetch<void>(`/collection/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      const feeDate = date || new Date().toISOString().slice(0, 10)
      const parsedPrice = parseDecimalInput(price)
      const parsedShipping = parseDecimalInput(shippingPrice)
      const hasFees = fees.some(f => parseDecimalInput(f.amount) > 0)
      const hasDiscounts = discounts.some(d => parseDecimalInput(d.amount) > 0)

      // Create a purchase group if price, shipping, fees or discounts provided
      let purchaseGroupId: string | null = null
      if (parsedPrice > 0 || parsedShipping > 0 || hasFees || hasDiscounts) {
        const group = await authFetch<{ id: string }>(`/collection/bundles/for-entry/${id}`, {
          method: 'POST',
          body: JSON.stringify({
            totalAmount: parsedPrice > 0 ? parsedPrice : 0,
            currency,
            shippingAmount: parsedShipping > 0 ? parsedShipping : undefined,
            purchasedAt: new Date(feeDate).toISOString(),
            isSecondHand,
            sourcePlatform: sourcePlatform || undefined,
          }),
        })
        purchaseGroupId = group?.id ?? null
      }

      for (const fee of fees) {
        const parsedAmount = parseDecimalInput(fee.amount)
        if (parsedAmount <= 0) continue
        const template = feeTemplates.find(t => t.id === fee.templateId)
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

      for (const disc of discounts) {
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
      setMovePrice('')
      setShippingPrice('')
      setFeeEntries([])
      setDiscountEntries([])
      setIsSecondHand(false)
      setSourcePlatform('')
      setMoveOwnershipStatus('OWNED')
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
                companyBrandColors={entry.edition.bookBoxCompany?.brandColors}
                volumeNumber={entry.edition.book.volumeNumber}
                title={entry.edition.book.title}
                authors={(entry.edition.book.authors as any[]).map(a => a.author ?? a)}
                imageActions={
                  <div className="absolute inset-0 bg-stone-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        setMoveEntry(entry)
                        setMoveDate(new Date().toISOString().slice(0, 10))
                        setMovePrice('')
                        setMoveCurrency('EUR')
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {saleInterests.map((interest) => {
              const { announcement: sa } = interest
              const coverSrc = sa.imageUrl ? cloudinaryUrl(sa.imageUrl, 'w_400,h_300,c_fill,q_auto,f_auto') : null
              const saleDate = sa.generalSaleDate ?? sa.earlyAccessDate ?? sa.firstAccessDate
              const isOpen = !!saleDate && new Date(saleDate) <= new Date()
              const dateLabel = saleDate
                ? new Date(saleDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                : null

              return (
                <div key={sa.id} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden group hover:border-stone-700 transition-colors">
                  {coverSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverSrc} alt={sa.title} className="w-full aspect-[4/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-stone-800 flex items-center justify-center">
                      <Megaphone size={32} className="text-stone-600" />
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    <p className="text-stone-100 text-sm font-medium leading-tight line-clamp-2">{sa.title}</p>
                    <p className="text-stone-500 text-xs">{sa.company.name}</p>
                    {dateLabel && (
                      <p className="text-xs text-stone-500 flex items-center gap-1">
                        <Tag size={10} />
                        {isOpen ? 'Sale opened' : 'General sale'}: {dateLabel}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Link
                        href={`/sale-announcements/${sa.id}`}
                        className={`flex-1 text-center text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                          isOpen
                            ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-700'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700'
                        }`}
                      >
                        {isOpen ? 'View & Add to Collection' : 'View Sale'}
                      </Link>
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
        )
      )}

      {/* Move to Collection Modal */}
      {moveEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMoveEntry(null) }}
        >
          <div className="w-full max-w-sm bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif font-semibold text-stone-100">Move to Collection</h2>
              <button onClick={() => setMoveEntry(null)} className="p-1 text-stone-500 hover:text-stone-200 transition-colors">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-stone-400">
              <span className="text-stone-200 font-medium">{moveEntry.edition.book.title}</span>
            </p>

            <div>
              <label className={LABEL}>Status</label>
              <select value={moveOwnershipStatus} onChange={e => setMoveOwnershipStatus(e.target.value)} className={INPUT}>
                {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className={LABEL}>Purchase date</label>
              <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} className={INPUT} />
            </div>

            <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
              <div>
                <label className={LABEL}>Price paid (optional)</label>
                <input
                  type="text"
                  value={movePrice}
                  onChange={e => setMovePrice(e.target.value)}
                  placeholder="0.00"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Shipping (optional)</label>
                <input
                  type="text"
                  value={shippingPrice}
                  onChange={e => setShippingPrice(e.target.value)}
                  placeholder="0.00"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Currency</label>
                <select value={moveCurrency} onChange={e => setMoveCurrency(e.target.value)} className={INPUT}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Multi-fee entries */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={LABEL.replace('mb-1', '')}>Additional fees (optional)</span>
                <button
                  type="button"
                  onClick={() => {
                    feeKeyRef.current++
                    setFeeEntries(prev => [...prev, { key: feeKeyRef.current, templateId: '', amount: '', currency: 'EUR' }])
                  }}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <Plus size={12} /> Add fee
                </button>
              </div>
              {feeEntries.length === 0 && (
                <p className="text-xs text-stone-500 italic">No additional fees</p>
              )}
              <div className="space-y-2">
                {feeEntries.map((fee) => (
                  <div key={fee.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                    <div>
                      <select
                        value={fee.templateId}
                        onChange={e => {
                          const tpl = feeTemplates.find(t => t.id === e.target.value)
                          setFeeEntries(prev => prev.map(f => f.key === fee.key ? {
                            ...f,
                            templateId: e.target.value,
                            amount: tpl?.defaultAmount != null ? String(tpl.defaultAmount) : f.amount,
                            currency: tpl?.defaultCurrency ?? f.currency,
                          } : f))
                        }}
                        className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400 transition-colors"
                      >
                        <option value="">— Template —</option>
                        {feeTemplates.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name}{t.category ? ` (${t.category})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={fee.amount}
                      onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, amount: e.target.value } : f))}
                      placeholder="0.00"
                      className="w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400 transition-colors"
                    />
                    <select
                      value={fee.currency}
                      onChange={e => setFeeEntries(prev => prev.map(f => f.key === fee.key ? { ...f, currency: e.target.value } : f))}
                      className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-amber-400 transition-colors"
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setFeeEntries(prev => prev.filter(f => f.key !== fee.key))}
                      className="p-2 text-stone-500 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Discounts */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={LABEL.replace('mb-1', '')}>Discounts (optional)</span>
                <button
                  type="button"
                  onClick={() => {
                    discountKeyRef.current++
                    setDiscountEntries(prev => [...prev, { key: discountKeyRef.current, name: '', amount: '', currency: moveCurrency || 'EUR' }])
                  }}
                  className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                >
                  <Plus size={12} /> Add discount
                </button>
              </div>
              {discountEntries.length === 0 && (
                <p className="text-xs text-stone-500 italic">No discounts</p>
              )}
              <div className="space-y-2">
                {discountEntries.map(disc => (
                  <div key={disc.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                    <input
                      type="text"
                      value={disc.name}
                      onChange={e => setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, name: e.target.value } : d))}
                      placeholder="e.g. Promo code, loyalty…"
                      className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400 transition-colors"
                    />
                    <input
                      type="text"
                      value={disc.amount}
                      onChange={e => setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, amount: e.target.value } : d))}
                      placeholder="0.00"
                      className="w-20 bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400 transition-colors"
                    />
                    <select
                      value={disc.currency}
                      onChange={e => setDiscountEntries(prev => prev.map(d => d.key === disc.key ? { ...d, currency: e.target.value } : d))}
                      className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-400 transition-colors"
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setDiscountEntries(prev => prev.filter(d => d.key !== disc.key))}
                      className="p-2 text-stone-500 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isSecondHand} onChange={e => { setIsSecondHand(e.target.checked); if (!e.target.checked) setSourcePlatform('') }}
                  className="w-4 h-4 rounded accent-amber-500" />
                <span className="text-sm text-stone-300">Second-hand purchase</span>
              </label>
              {isSecondHand && (
                <select value={sourcePlatform} onChange={e => setSourcePlatform(e.target.value)} className={INPUT}>
                  <option value="">Select platform (optional)</option>
                  {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setMoveEntry(null)}
                className="flex-1 py-2 rounded-xl border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => moveMutation.mutate({ id: moveEntry.id, date: moveDate, price: movePrice, currency: moveCurrency, ownershipStatus: moveOwnershipStatus, shippingPrice, fees: feeEntries, discounts: discountEntries, isSecondHand, sourcePlatform })}
                disabled={moveMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold py-2 rounded-xl text-sm transition-colors"
              >
                <MoveRight size={14} />
                {moveMutation.isPending ? 'Moving…' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

