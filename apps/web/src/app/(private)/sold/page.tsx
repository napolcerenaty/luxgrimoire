'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useModalState } from '@/hooks/useModalState'
import { useCreateSaleGroup } from '@/hooks/useCreateSaleGroup'
import { authFetch } from '@/lib/authFetch'
import { EditionCard } from '@/components/books/EditionCard'
import { getSaleGroups, getSaleGroupsPaginated, updateSaleGroup, deleteSaleGroup } from '@/lib/api'
import type { ApiSaleGroup } from '@luxgrimoire/shared-types'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Plus, Pencil, Trash2, ShoppingBag, LayoutGrid, List, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { isValidCalendarDate } from '@/lib/dateValidation'
import { SaleFormFields, SALE_PLATFORMS, CURRENCIES } from '@/components/sale/SaleFormFields'
import { brandGradientStyle } from '@/lib/brandGradient'
import { useBrandColors } from '@/lib/useBrandColors'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { formatVolumeNumbers } from '@/lib/volumeNumbers'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'

interface CollectionEntry {
  id: string
  isWishlist: boolean
  ownershipStatus: string
  readingStatus: string
  condition: string | null
  acquiredAt: string | null
  signatureType: string | null
  salePrice: string | null
  saleCurrency: string | null
  saleDate: string | null
  tags: string[]
  purchaseGroup: { id: string; currency: string; purchasedAt: string; totalAmount: string } | null
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

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-brand-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

function RecordSaleModal({
  open,
  onClose,
  entries,
}: {
  open: boolean
  onClose: () => void
  entries: CollectionEntry[]
}) {
  const createSaleMutation = useCreateSaleGroup()
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('')
  const [customPlatform, setCustomPlatform] = useState('')
  const [total, setTotal] = useState('')
  const [currency, setCurrency] = useState('GBP')
  const [soldAt, setSoldAt] = useState('')
  const [notes, setNotes] = useState('')
  const [distribution, setDistribution] = useState<'EQUAL' | 'CUSTOM'>('EQUAL')
  const [selected, setSelected] = useState<string[]>([])
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [soldAtInvalid, setSoldAtInvalid] = useState(false)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  const totalNum = parseDecimalInput(total)
  const count = selected.length
  const perBook = count > 0 ? (totalNum / count).toFixed(2) : '0.00'

  const visible = entries.filter(e => formatEditionDisplayTitle(e.edition.book, e.edition).toLowerCase().includes(search.toLowerCase()))

  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleSoldAtChange = (v: string) => { setSoldAt(v); if (soldAtInvalid) { setSoldAtInvalid(false); setError(null) } }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (selected.length === 0) { setError('Select at least one book'); return }
    if (!total || totalNum <= 0) { setError('Enter a valid total amount'); return }
    if (!isValidCalendarDate(soldAt)) { setSoldAtInvalid(true); setError('Enter a valid sale date'); return }
    const plat = platform === 'other' ? customPlatform : platform
    const customs = distribution === 'CUSTOM'
      ? Object.fromEntries(Object.entries(customAmounts).map(([k, v]) => [k, parseDecimalInput(v)]))
      : undefined
    setPending(true)
    try {
      await createSaleMutation.mutateAsync({
        entryIds: selected,
        title: title || undefined,
        platform: plat || undefined,
        totalAmount: totalNum,
        currency,
        soldAt,
        notes: notes || undefined,
        priceDistribution: distribution,
        customAmounts: customs,
      })
      setSuccess(true)
      setTimeout(() => {
        onClose()
        setSuccess(false)
        setTitle(''); setPlatform(''); setCustomPlatform(''); setTotal('')
        setCurrency('GBP'); setSoldAt(''); setNotes(''); setSelected([])
        setCustomAmounts({}); setSearch('')
      }, 1200)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record a Sale">
      {success ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-green-400 font-semibold">Sale recorded!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <SaleFormFields
            title={title} setTitle={setTitle}
            platform={platform} setPlatform={setPlatform}
            customPlatform={customPlatform} setCustomPlatform={setCustomPlatform}
            total={total} setTotal={setTotal}
            currency={currency} setCurrency={setCurrency}
            soldAt={soldAt} setSoldAt={handleSoldAtChange} soldAtInvalid={soldAtInvalid}
            notes={notes} setNotes={setNotes}
            pending={pending}
            submitLabel="Record Sale"
            beforeSubmit={<>
              <div>
                <label className={LBL}>Books *</label>
                <input className={`${INP} mb-2`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by title…" />
                <div className="max-h-44 overflow-y-auto border border-stone-700 rounded-lg divide-y divide-stone-800">
                  {visible.length === 0 && <p className="text-stone-500 text-sm px-3 py-2">No books found</p>}
                  {visible.map(e => (
                    <button key={e.id} type="button" onClick={() => toggle(e.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${selected.includes(e.id) ? 'bg-brand-500/10 text-brand-400' : 'text-stone-300 hover:bg-stone-800'}`}
                    >
                      <span className="w-4 h-4 border rounded flex items-center justify-center text-xs shrink-0 border-stone-600">
                        {selected.includes(e.id) ? '✓' : ''}
                      </span>
                      <span className="flex-1 truncate">{formatEditionDisplayTitle(e.edition.book, e.edition)}</span>
                      {e.purchaseGroup && <span className="text-stone-500 text-xs shrink-0">{parseFloat(e.purchaseGroup.totalAmount).toFixed(2)} {e.purchaseGroup.currency}</span>}
                    </button>
                  ))}
                </div>
                {count > 0 && <p className="text-xs text-stone-500 mt-1">{count} book{count !== 1 ? 's' : ''} selected</p>}
              </div>
              {count > 0 && totalNum > 0 && (
                <div>
                  <label className={LBL}>Price split</label>
                  <div className="flex gap-2">
                    {(['EQUAL', 'CUSTOM'] as const).map(d => (
                      <button key={d} type="button" onClick={() => setDistribution(d)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${distribution === d ? 'bg-brand-500/10 border-brand-500/30 text-brand-400' : 'border-stone-700 text-stone-400 hover:border-stone-500'}`}
                      >
                        {d === 'EQUAL' ? 'Equal' : 'Custom per book'}
                      </button>
                    ))}
                  </div>
                  {distribution === 'EQUAL' && <p className="text-xs text-stone-400 mt-1">{perBook} {currency} per book</p>}
                  {distribution === 'CUSTOM' && (
                    <div className="mt-2 flex flex-col gap-2">
                      {selected.map(eid => {
                        const entry = entries.find(e => e.id === eid)
                        if (!entry) return null
                        return (
                          <div key={eid} className="flex items-center gap-2">
                            <span className="flex-1 text-sm text-stone-300 truncate">{formatEditionDisplayTitle(entry.edition.book, entry.edition)}</span>
                            <input type="number" step="0.01" min="0" className="w-24 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-stone-100"
                              value={customAmounts[eid] ?? ''} onChange={e => setCustomAmounts(prev => ({ ...prev, [eid]: e.target.value }))} placeholder="0.00" />
                            <span className="text-xs text-stone-500">{currency}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <p className="text-xs text-stone-500 mt-2">
                ℹ️ Anonymous sale data may contribute to community market statistics.
              </p>
            </>}
          />
        </form>
      )}
    </Modal>
  )
}

function EditSaleModal({
  open,
  onClose,
  saleGroup,
  rates = {},
  userCurrency,
}: {
  open: boolean
  onClose: () => void
  saleGroup: ApiSaleGroup | null
  rates?: Record<string, number>
  userCurrency?: string | null
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('')
  const [customPlatform, setCustomPlatform] = useState('')
  const [total, setTotal] = useState('')
  const [currency, setCurrency] = useState('GBP')
  const [soldAt, setSoldAt] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [soldAtInvalid, setSoldAtInvalid] = useState(false)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})

  const isCustom = saleGroup?.priceDistribution === 'CUSTOM'

  const handleSoldAtChange = (v: string) => { setSoldAt(v); if (soldAtInvalid) { setSoldAtInvalid(false); setError(null) } }

  // Populate fields when the target sale group changes
  useEffect(() => {
    if (!open || !saleGroup) return
    setTitle(saleGroup.title ?? '')
    const knownPlatform = SALE_PLATFORMS.find(p => p.value === saleGroup.platform)
    if (knownPlatform) { setPlatform(saleGroup.platform); setCustomPlatform('') }
    else if (saleGroup.platform) { setPlatform('other'); setCustomPlatform(saleGroup.platform) }
    else { setPlatform(''); setCustomPlatform('') }
    setTotal(String(saleGroup.totalAmount))
    setCurrency(saleGroup.currency)
    setSoldAt(saleGroup.soldAt ? saleGroup.soldAt.slice(0, 10) : '')
    setNotes(saleGroup.notes ?? '')
    setError(null)
    setSoldAtInvalid(false)
    setSuccess(false)
    // Pre-fill custom amounts from existing allocations
    const amounts: Record<string, string> = {}
    saleGroup.entries.forEach(e => { amounts[e.id] = String(e.allocatedAmount) })
    setCustomAmounts(amounts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleGroup?.id, open])

  const count = saleGroup?.entries.length ?? 0
  const originalTotal = saleGroup?.totalAmount ?? 0

  // For CUSTOM mode: total is sum of custom amounts
  const customSum = isCustom
    ? Object.values(customAmounts).reduce((a, v) => a + (parseDecimalInput(v) || 0), 0)
    : null
  const totalNum = isCustom ? (customSum ?? 0) : parseDecimalInput(total)
  const totalChanged = totalNum > 0 && Math.abs(totalNum - originalTotal) > 0.001
  const newPerBook = count > 0 ? (totalNum / count).toFixed(2) : '0.00'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!saleGroup) return
    setError(null)
    if (totalNum <= 0) { setError('Total must be greater than 0'); return }
    if (!isValidCalendarDate(soldAt)) { setSoldAtInvalid(true); setError('Enter a valid sale date'); return }
    if (isCustom) {
      const missing = saleGroup.entries.some(e => !customAmounts[e.id] || parseDecimalInput(customAmounts[e.id]) <= 0)
      if (missing) { setError('Enter a valid amount for each book'); return }
    }
    const plat = platform === 'other' ? customPlatform : platform
    setPending(true)
    try {
      const payload: import('@/lib/api').UpdateSaleGroupData = {
        title: title || undefined,
        platform: plat || undefined,
        currency,
        soldAt,
        notes: notes || undefined,
      }
      if (isCustom) {
        // Send customAmounts keyed by entry id; backend computes total
        payload.customAmounts = Object.fromEntries(
          saleGroup.entries.map(e => [e.id, parseDecimalInput(customAmounts[e.id] ?? '0')])
        )
      } else {
        payload.totalAmount = totalNum
      }
      await updateSaleGroup(saleGroup.id, payload)
      queryClient.invalidateQueries({ queryKey: ['sale-groups'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['spending-stats-v2'] })
      queryClient.invalidateQueries({ queryKey: ['stats-sales'] })
      queryClient.invalidateQueries({ queryKey: ['stats-collection'] })
      queryClient.invalidateQueries({ queryKey: ['stats-pl'] })
      setSuccess(true)
      setTimeout(() => { onClose(); setSuccess(false) }, 1000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Sale">
      {success ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-green-400 font-semibold">Sale updated!</p>
        </div>
      ) : (
        <>
          {/* Books in this sale */}
          {saleGroup && saleGroup.entries.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">Books in this sale</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {saleGroup.entries.map(entry => {
                  const ube = entry.userBookEntry as any
                  const bookTitle = ube?.edition ? (formatEditionDisplayTitle(ube.edition.book, ube.edition) || '—') : '—'
                  const sgCur = saleGroup.currency
                  const sgDate = saleGroup.soldAt?.slice(0, 10) ?? ''
                  const rate = userCurrency && sgCur !== userCurrency ? rates[`${sgCur}:${userCurrency}:${sgDate}`] : null

                  if (isCustom) {
                    const inputVal = customAmounts[entry.id] ?? ''
                    const inputNum = parseDecimalInput(inputVal)
                    const cost = entry.purchaseCostInSaleCurrency
                    const pl = cost != null && inputNum > 0 ? inputNum - cost : null
                    return (
                      <div key={entry.id} className="flex items-center gap-2">
                        <span className="text-stone-300 truncate flex-1 text-sm">{bookTitle}</span>
                        <div className="shrink-0 flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" step="0.01" min="0.01"
                              value={inputVal}
                              onChange={ev => setCustomAmounts(prev => ({ ...prev, [entry.id]: ev.target.value }))}
                              className="w-24 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-brand-400 focus:outline-none focus:border-brand-400"
                            />
                            <span className="text-stone-500 text-xs">{sgCur}</span>
                          </div>
                          {pl != null && (
                            <span className={`text-[10px] font-medium ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                              {rate ? ` (≈ ${(pl * rate).toFixed(2)} ${userCurrency})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  }

                  const sold = entry.allocatedAmount
                  const cost = entry.purchaseCostInSaleCurrency
                  const pl = cost != null ? sold - cost : null
                  const soldConverted = rate ? `≈ ${(sold * rate).toFixed(2)} ${userCurrency}` : null
                  const plConverted = pl != null && rate ? `${pl >= 0 ? '+' : ''}${(pl * rate).toFixed(2)} ${userCurrency}` : null
                  return (
                    <div key={entry.id} className="flex items-center justify-between text-sm">
                      <span className="text-stone-300 truncate flex-1">{bookTitle}</span>
                      <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                        <div className="flex items-center gap-2">
                          <span className="text-brand-400 text-xs">{sold.toFixed(2)} {sgCur}</span>
                          {soldConverted && <span className="text-stone-500 text-[10px]">{soldConverted}</span>}
                        </div>
                        {pl != null && (
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                            </span>
                            {plConverted && <span className="text-stone-500 text-[10px]">{plConverted}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {isCustom && (
                <div className="mt-2 flex justify-between items-center text-xs text-stone-400 border-t border-stone-800 pt-2">
                  <span>Total</span>
                  <span className="text-brand-400 font-medium">{(customSum ?? 0).toFixed(2)} {saleGroup.currency}</span>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <SaleFormFields
              title={title} setTitle={setTitle}
              platform={platform} setPlatform={setPlatform}
              customPlatform={customPlatform} setCustomPlatform={setCustomPlatform}
              total={total} setTotal={isCustom ? undefined : setTotal}
              currency={currency} setCurrency={setCurrency}
              soldAt={soldAt} setSoldAt={handleSoldAtChange} soldAtInvalid={soldAtInvalid}
              notes={notes} setNotes={setNotes}
              hideTotalField={isCustom}
              pending={pending}
              submitLabel="Save Changes"
              beforeSubmit={<>
                {!isCustom && totalChanged && count > 0 && (
                  <p className="text-xs text-stone-400">
                    Allocated amounts will be redistributed equally ({newPerBook} {currency} per book)
                  </p>
                )}
                {error && <p className="text-red-400 text-sm">{error}</p>}
              </>}
            />
          </form>
        </>
      )}
    </Modal>
  )
}

export default function SoldPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const getBrandColors = useBrandColors()
  const userCurrency = user?.preferredCurrency ?? null

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'books' | 'gifted' | 'records'>('books')
  const recordsActivated = useRef(false)
  const giftedActivated = useRef(false)

  function activateTab(tab: 'books' | 'gifted' | 'records') {
    if (tab === 'records') recordsActivated.current = true
    if (tab === 'gifted') giftedActivated.current = true
    setActiveTab(tab)
  }

  // ── Books tab state ──────────────────────────────────────────────────────────
  const [booksPage, setBooksPage] = useState(1)
  const BOOKS_PAGE_SIZE = 24
  const [bookFilter, setBookFilter] = useState('')
  const [bookFilterInput, setBookFilterInput] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [tagFilter, setTagFilter] = useState('ALL')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setBookFilter(bookFilterInput)
      setBooksPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [bookFilterInput])

  // Reset page when filters change
  useEffect(() => { setBooksPage(1) }, [companyFilter, tagFilter])

  const booksQuery = useQuery({
    queryKey: ['sold-books', booksPage, bookFilter, companyFilter, tagFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        isWishlist: 'false',
        ownershipStatus: 'SOLD',
        page: String(booksPage),
        pageSize: String(BOOKS_PAGE_SIZE),
      })
      if (bookFilter) params.set('search', bookFilter)
      if (companyFilter !== 'ALL') params.set('companyName', companyFilter)
      if (tagFilter !== 'ALL') params.set('tag', tagFilter)
      return authFetch<{ data: CollectionEntry[]; total: number; totalPages: number }>(`/collection?${params}`)
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const soldBooks = booksQuery.data?.data ?? []
  const booksTotalPages = booksQuery.data?.totalPages ?? 1
  const booksTotal = booksQuery.data?.total ?? 0

  // ── Gifted Away tab state ────────────────────────────────────────────────────
  const [giftedPage, setGiftedPage] = useState(1)
  const [giftedFilter, setGiftedFilter] = useState('')
  const [giftedFilterInput, setGiftedFilterInput] = useState('')

  useEffect(() => {
    const t = setTimeout(() => { setGiftedFilter(giftedFilterInput); setGiftedPage(1) }, 300)
    return () => clearTimeout(t)
  }, [giftedFilterInput])

  const giftedQuery = useQuery({
    queryKey: ['gifted-books', giftedPage, giftedFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        isWishlist: 'false',
        ownershipStatus: 'GIFTED_AWAY',
        page: String(giftedPage),
        pageSize: String(BOOKS_PAGE_SIZE),
      })
      if (giftedFilter) params.set('search', giftedFilter)
      return authFetch<{ data: CollectionEntry[]; total: number; totalPages: number }>(`/collection?${params}`)
    },
    enabled: giftedActivated.current || activeTab === 'gifted',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const giftedBooks = giftedQuery.data?.data ?? []
  const giftedTotalPages = giftedQuery.data?.totalPages ?? 1
  const giftedTotal = giftedQuery.data?.total ?? 0

  // ── Company + tag filter options (fetched once for filter UI) ──────────────
  const { data: companiesData = [] } = useQuery({
    queryKey: ['sold-companies'],
    queryFn: () => authFetch<{ data: CollectionEntry[] }>('/collection?isWishlist=false&ownershipStatus=SOLD&pageSize=500').then(r => {
      const names = new Set<string>()
      r.data.forEach(e => { if (e.edition.bookBoxCompany?.name) names.add(e.edition.bookBoxCompany.name) })
      return Array.from(names).sort()
    }),
    staleTime: 5 * 60_000,
  })

  const { data: allUserTags = [] } = useQuery({
    queryKey: ['collection-tags'],
    queryFn: () => authFetch<string[]>('/collection/tags'),
    staleTime: 5 * 60_000,
  })

  // ── Records tab state ────────────────────────────────────────────────────────
  const [recordsPage, setRecordsPage] = useState(1)
  const RECORDS_PAGE_SIZE = 20
  const [recordsSearchInput, setRecordsSearchInput] = useState('')
  const [recordsSearch, setRecordsSearch] = useState('')
  const addSaleModal = useModalState()
  const [editingSale, setEditingSale] = useState<ApiSaleGroup | null>(null)
  const [rates, setRates] = useState<Record<string, number>>({})

  // Debounce records search
  useEffect(() => {
    const t = setTimeout(() => {
      setRecordsSearch(recordsSearchInput)
      setRecordsPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [recordsSearchInput])

  const recordsQuery = useQuery({
    queryKey: ['sale-groups-page', recordsPage, recordsSearch],
    queryFn: () => getSaleGroupsPaginated(recordsPage, RECORDS_PAGE_SIZE, recordsSearch || undefined),
    enabled: recordsActivated.current || activeTab === 'records',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const saleGroups = recordsQuery.data?.data ?? []
  const recordsTotalPages = recordsQuery.data?.totalPages ?? 1
  const recordsTotal = recordsQuery.data?.total ?? 0

  const deleteSaleMut = useMutation({
    mutationFn: (id: string) => deleteSaleGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-groups-page'] })
      queryClient.invalidateQueries({ queryKey: ['sale-groups'] })
      queryClient.invalidateQueries({ queryKey: ['stats-sales'] })
      queryClient.invalidateQueries({ queryKey: ['stats-collection'] })
      queryClient.invalidateQueries({ queryKey: ['stats-pl'] })
    },
  })

  // ── Unsold entries for RecordSaleModal book selector ────────────────────────
  const { data: unsoldEntries = [] } = useQuery({
    queryKey: ['unsold-entries-slim'],
    queryFn: () => authFetch<{ data: CollectionEntry[] }>('/collection?isWishlist=false&slim=true&pageSize=500').then(r =>
      r.data.filter(e => e.ownershipStatus !== 'SOLD')
    ),
    staleTime: 2 * 60_000,
    enabled: addSaleModal.isOpen,
  })

  // ── Currency rates for visible sale groups ────────────────────────────────
  useEffect(() => {
    if (!userCurrency || saleGroups.length === 0) return
    const tuples: { from: string; to: string; date: string }[] = []
    saleGroups.forEach((sg: ApiSaleGroup) => {
      if (sg.currency !== userCurrency) {
        tuples.push({ from: sg.currency, to: userCurrency, date: sg.soldAt?.slice(0, 10) ?? '' })
      }
    })
    const unique = tuples.filter((t, i) =>
      tuples.findIndex(u => u.from === t.from && u.to === t.to && u.date === t.date) === i
    )
    if (unique.length === 0) return
    Promise.all(
      unique.map(({ from, to, date }) =>
        authFetch<{ rate: number }>(`/currency/rate?from=${from}&to=${to}${date ? `&date=${date}` : ''}`)
          .then(r => ({ key: `${from}:${to}:${date}`, rate: r.rate }))
          .catch(() => null)
      )
    ).then(results => {
      const newRates: Record<string, number> = {}
      results.forEach(r => { if (r) newRates[r.key] = r.rate })
      setRates(prev => ({ ...prev, ...newRates }))
    })
  }, [saleGroups, userCurrency])

  // ── Currency conversion helper ────────────────────────────────────────────
  function converted(amount: number, fromCurrency: string | null, date?: string): string | null {
    if (!fromCurrency || !userCurrency || fromCurrency === userCurrency) return null
    const dateKey = date?.slice(0, 10) ?? ''
    const rate = rates[`${fromCurrency}:${userCurrency}:${dateKey}`]
    if (!rate) return null
    return `≈ ${(amount * rate).toFixed(2)} ${userCurrency}`
  }

  // ── Pagination helper ─────────────────────────────────────────────────────
  function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
    if (totalPages <= 1) return null
    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="p-1.5 rounded-lg border border-stone-700 text-stone-400 hover:text-brand-400 hover:border-brand-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm text-stone-400">Page <span className="text-stone-200 font-medium">{page}</span> of <span className="text-stone-200 font-medium">{totalPages}</span></span>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="p-1.5 rounded-lg border border-stone-700 text-stone-400 hover:text-brand-400 hover:border-brand-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">Sold Books</h1>
        </div>
        <button
          onClick={() => addSaleModal.open()}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-400 text-stone-950 text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus size={14} /> Record Sale
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-stone-800">
        {([
          { id: 'books' as const, label: 'Sold Books', count: booksTotal },
          { id: 'gifted' as const, label: 'Gifted Away', count: giftedTotal },
          { id: 'records' as const, label: 'Sale Records', count: recordsTotal },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => activateTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-brand-400 text-brand-400'
                : 'border-transparent text-stone-500 hover:text-stone-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-brand-400/20 text-brand-400' : 'bg-stone-800 text-stone-500'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Sold Books tab ── */}
      {activeTab === 'books' && (
        <section>
          {booksQuery.isLoading ? (
            <div className="flex items-center justify-center py-20 text-stone-400 animate-pulse">Loading…</div>
          ) : booksTotal === 0 && !bookFilter && companyFilter === 'ALL' && tagFilter === 'ALL' ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-500">
              <ShoppingBag size={48} className="mb-4 opacity-30" />
              <p className="font-serif text-lg">No sold books yet</p>
              <p className="text-sm mt-1">Books you record as sold will appear here</p>
            </div>
          ) : (
            <>
              {/* Filters + View Toggle */}
              <div className="flex gap-2 flex-wrap items-center mb-6">
                <input
                  type="text"
                  value={bookFilterInput}
                  onChange={e => setBookFilterInput(e.target.value)}
                  placeholder="Search by title…"
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-1.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-brand-400 transition-colors min-w-[160px]"
                />
                {companiesData.length > 0 && (
                  <select
                    value={companyFilter}
                    onChange={e => setCompanyFilter(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-brand-400 transition-colors cursor-pointer ${companyFilter !== 'ALL' ? 'text-brand-400 border-brand-500/30 bg-brand-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
                  >
                    <option value="ALL">Box: Any</option>
                    {companiesData.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {allUserTags.length > 0 && (
                  <select
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-brand-400 transition-colors cursor-pointer ${tagFilter !== 'ALL' ? 'text-brand-400 border-brand-500/30 bg-brand-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
                  >
                    <option value="ALL">Tag: Any</option>
                    {allUserTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
                <div className="ml-auto flex items-center gap-1 bg-stone-800 rounded-lg p-1">
                  <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-stone-700 text-brand-400' : 'text-stone-500 hover:text-stone-300'}`} title="Grid view"><LayoutGrid size={15} /></button>
                  <button onClick={() => setViewMode('list')} className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-stone-700 text-brand-400' : 'text-stone-500 hover:text-stone-300'}`} title="List view"><List size={15} /></button>
                </div>
              </div>

              {soldBooks.length === 0 ? (
                <p className="text-stone-500 text-sm py-8 text-center">No books match these filters.</p>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {soldBooks.map(entry => (
                    <div key={entry.id} className="relative h-full">
                      <EditionCard
                        href={`/editions/${entry.edition.slug}?entry=${entry.id}`}
                        coverImage={entry.edition.additionalImages[0] ?? entry.edition.communityPhotoCover ?? null}
                        title={entry.edition.book.title}
                        variantLabel={entry.edition.variantLabel}
                        authors={(entry.edition.book.authors as any[]).map(a => a.author ?? a)}
                        companyName={entry.edition.bookBoxCompany?.name}
                        companySlug={entry.edition.bookBoxCompany?.slug}
                        companyBrandColors={getBrandColors(entry.edition.bookBoxCompany?.slug) ?? entry.edition.bookBoxCompany?.brandColors}
                        seriesName={entry.edition.book.seriesName}
                        volumeNumbers={entry.edition.book.volumeNumbers}
                        footer={
                          <div className="mt-1 flex flex-col gap-1">
                            <div className="flex flex-wrap gap-1 items-center">
                              <Badge variant="default">SOLD</Badge>
                              {entry.salePrice && entry.saleCurrency && (
                                <span className="text-[10px] text-brand-400">{parseFloat(entry.salePrice).toFixed(2)} {entry.saleCurrency}</span>
                              )}
                            </div>
                            {entry.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {entry.tags.map(tag => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/25">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-stone-800/60 border border-stone-800 rounded-xl overflow-hidden">
                  {soldBooks.map(entry => {
                    const cover = cloudinaryUrl(entry.edition.additionalImages[0] ?? entry.edition.communityPhotoCover ?? null, 'w_80,h_120,c_fill,q_auto,f_auto')
                    const sigIcon = entry.signatureType === 'signed' ? '✍️' : entry.signatureType === 'signed_bookplate' ? '🏷️' : entry.signatureType === 'autopen' ? '✒️' : entry.signatureType === 'digitally_signed' ? '🖨️' : entry.signatureType === 'stamped' ? '🕹️' : null
                    const displayTitle = formatEditionDisplayTitle(entry.edition.book, entry.edition)
                    return (
                      <a key={entry.id} href={`/editions/${entry.edition.slug}?entry=${entry.id}`} className="group flex items-center gap-3 px-3 py-2.5 bg-stone-900 hover:bg-stone-800/80 transition-colors first:rounded-t-xl last:rounded-b-xl">
                        <div className="w-10 h-[60px] flex-shrink-0 rounded overflow-hidden">
                          {cover ? <img src={cover} alt={displayTitle} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-stone-600" style={brandGradientStyle(getBrandColors(entry.edition.bookBoxCompany?.slug) ?? entry.edition.bookBoxCompany?.brandColors)}><BookOpen size={14} /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-100 group-hover:text-brand-400 transition-colors truncate">{displayTitle}</p>
                          <p className="text-xs text-stone-400 truncate">{(entry.edition.book.authors as any[]).map(a => (a.author ?? a).name).join(', ')}</p>
                          {(entry.edition.book.seriesName || entry.edition.bookBoxCompany) && (
                            <p className="text-[10px] text-stone-500 truncate">
                              {entry.edition.book.seriesName && <span>{entry.edition.book.seriesName}{entry.edition.book.volumeNumbers?.length ? ` #${formatVolumeNumbers(entry.edition.book.volumeNumbers)}` : ''}</span>}
                              {entry.edition.book.seriesName && entry.edition.bookBoxCompany && <span className="mx-1">·</span>}
                              {entry.edition.bookBoxCompany && <span>{entry.edition.bookBoxCompany.name}</span>}
                            </p>
                          )}
                          {entry.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {entry.tags.map(tag => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/25">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            {sigIcon && <span className="text-xs">{sigIcon}</span>}
                            <Badge variant="default">SOLD</Badge>
                          </div>
                          {entry.salePrice && entry.saleCurrency && (
                            <p className="text-xs text-brand-400 font-medium">{parseFloat(entry.salePrice).toFixed(2)} {entry.saleCurrency}</p>
                          )}
                          {entry.saleDate && <p className="text-[10px] text-stone-600">{new Date(entry.saleDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>}
                        </div>
                      </a>
                    )
                  })}
                </div>
              )}
              <Pagination page={booksPage} totalPages={booksTotalPages} onPage={setBooksPage} />
            </>
          )}
        </section>
      )}

      {/* ── Gifted Away tab ── */}
      {activeTab === 'gifted' && (
        <section>
          {giftedQuery.isLoading ? (
            <div className="flex items-center justify-center py-20 text-stone-400 animate-pulse">Loading…</div>
          ) : giftedTotal === 0 && !giftedFilter ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-500">
              <BookOpen size={48} className="mb-4 opacity-30" />
              <p className="font-serif text-lg">No gifted away books yet</p>
              <p className="text-sm mt-1">Books you mark as gifted away will appear here</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap items-center mb-6">
                <input
                  type="text"
                  value={giftedFilterInput}
                  onChange={e => setGiftedFilterInput(e.target.value)}
                  placeholder="Search by title…"
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-1.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-brand-400 transition-colors min-w-[160px]"
                />
              </div>
              {giftedBooks.length === 0 ? (
                <p className="text-stone-500 text-sm py-8 text-center">No books match these filters.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {giftedBooks.map(entry => (
                    <div key={entry.id}>
                      <EditionCard
                        href={`/editions/${entry.edition.slug}?entry=${entry.id}`}
                        coverImage={entry.edition.additionalImages[0] ?? entry.edition.communityPhotoCover ?? null}
                        title={entry.edition.book.title}
                        variantLabel={entry.edition.variantLabel}
                        authors={(entry.edition.book.authors as any[]).map(a => a.author ?? a)}
                        companyName={entry.edition.bookBoxCompany?.name}
                        companySlug={entry.edition.bookBoxCompany?.slug}
                        companyBrandColors={getBrandColors(entry.edition.bookBoxCompany?.slug) ?? entry.edition.bookBoxCompany?.brandColors}
                        seriesName={entry.edition.book.seriesName}
                        volumeNumbers={entry.edition.book.volumeNumbers}
                        footer={
                          <div className="mt-1">
                            <Badge variant="default">GIFTED</Badge>
                          </div>
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
              <Pagination page={giftedPage} totalPages={giftedTotalPages} onPage={setGiftedPage} />
            </>
          )}
        </section>
      )}

      {/* ── Sale Records tab ── */}
      {activeTab === 'records' && (
        <section>
          {recordsQuery.isLoading ? (
            <div className="flex items-center justify-center py-20 text-stone-400 animate-pulse">Loading…</div>
          ) : recordsTotal === 0 && !recordsSearch ? (
            <div className="flex flex-col items-center justify-center py-12 text-stone-500">
              <ShoppingBag size={36} className="mb-3 opacity-30" />
              <p className="text-sm">No recorded sales yet</p>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="mb-5">
                <input
                  type="text"
                  value={recordsSearchInput}
                  onChange={e => setRecordsSearchInput(e.target.value)}
                  placeholder="Search by sale title or book title…"
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-1.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-brand-400 transition-colors w-full max-w-sm"
                />
              </div>
              {recordsTotal === 0 ? (
                <p className="text-stone-500 text-sm py-8 text-center">No sales match your search.</p>
              ) : (
                <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {saleGroups.map(sg => (
                  <div key={sg.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-4 hover:border-stone-700 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-stone-200 font-medium">
                          {sg.title ?? new Date(sg.soldAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                        {sg.platform && (
                          <span className="text-xs text-stone-400 bg-stone-800 px-2 py-0.5 rounded-full mt-1 inline-block">{sg.platform}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingSale(sg)} className="ml-1 p-1 text-stone-500 hover:text-brand-400 transition-colors" title="Edit sale"><Pencil size={14} /></button>
                        <button onClick={() => deleteSaleMut.mutate(sg.id)} className="p-1 text-stone-500 hover:text-red-400 transition-colors" title="Delete sale"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <div>
                        <p className="text-xs text-stone-500">Sold for</p>
                        <p className="text-lg font-bold text-brand-400">{sg.totalAmount} {sg.currency}</p>
                        {(() => { const c = converted(sg.totalAmount, sg.currency, sg.soldAt); return c ? <p className="text-xs text-stone-500">{c}</p> : null })()}
                      </div>
                      {sg.profitLoss != null && (
                        <div>
                          <p className="text-xs text-stone-500">P&amp;L</p>
                          <p className={`text-sm font-semibold ${sg.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {sg.profitLoss >= 0 ? '+' : ''}{sg.profitLoss.toFixed(2)} {sg.currency}
                          </p>
                          {(() => { const c = converted(sg.profitLoss, sg.currency, sg.soldAt); return c ? <p className={`text-xs ${sg.profitLoss >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>{sg.profitLoss >= 0 ? '+' : ''}{c}</p> : null })()}
                        </div>
                      )}
                    </div>
                    {sg.soldAt && <p className="text-xs text-stone-500 mt-2">{new Date(sg.soldAt).toLocaleDateString()}</p>}
                    {/* Book titles */}
                    {sg.entries && sg.entries.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-stone-800 space-y-1">
                        {sg.entries.map(e => {
                          const ube = e.userBookEntry as any
                          const title = ube?.edition ? (formatEditionDisplayTitle(ube.edition.book, ube.edition) || '—') : '—'
                          return (
                            <div key={e.id} className="flex items-center justify-between gap-2">
                              <span className="text-xs text-stone-400 truncate">{title}</span>
                              {sg.entries.length > 1 && (
                                <span className="text-xs text-brand-400 shrink-0">{Number(e.allocatedAmount).toFixed(2)} {sg.currency}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Pagination page={recordsPage} totalPages={recordsTotalPages} onPage={setRecordsPage} />
                </>
              )}
            </>
          )}
        </section>
      )}

      <RecordSaleModal
        open={addSaleModal.isOpen}
        onClose={() => addSaleModal.close()}
        entries={unsoldEntries}
      />
      <EditSaleModal
        open={editingSale !== null}
        onClose={() => setEditingSale(null)}
        saleGroup={editingSale}
        rates={rates}
        userCurrency={userCurrency}
      />
    </div>
  )
}

