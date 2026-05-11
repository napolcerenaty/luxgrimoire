'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useModalState } from '@/hooks/useModalState'
import { useCreateSaleGroup } from '@/hooks/useCreateSaleGroup'
import { authFetch } from '@/lib/authFetch'
import { EditionCard } from '@/components/books/EditionCard'
import { getSaleGroups, updateSaleGroup, deleteSaleGroup } from '@/lib/api'
import type { ApiSaleGroup } from '@luxgrimoire/shared-types'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Plus, Pencil, Trash2, ShoppingBag } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { SaleFormFields, SALE_PLATFORMS, CURRENCIES } from '@/components/sale/SaleFormFields'

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
  tags: string[]
  purchaseGroup: { id: string; currency: string; purchasedAt: string; totalAmount: string } | null
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
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  const totalNum = parseDecimalInput(total)
  const count = selected.length
  const perBook = count > 0 ? (totalNum / count).toFixed(2) : '0.00'

  const visible = entries.filter(e => e.edition.book.title.toLowerCase().includes(search.toLowerCase()))

  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (selected.length === 0) { setError('Select at least one book'); return }
    if (!total || totalNum <= 0) { setError('Enter a valid total amount'); return }
    if (!soldAt) { setError('Enter the sale date'); return }
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
            soldAt={soldAt} setSoldAt={setSoldAt}
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
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${selected.includes(e.id) ? 'bg-amber-500/10 text-amber-400' : 'text-stone-300 hover:bg-stone-800'}`}
                    >
                      <span className="w-4 h-4 border rounded flex items-center justify-center text-xs shrink-0 border-stone-600">
                        {selected.includes(e.id) ? '✓' : ''}
                      </span>
                      <span className="flex-1 truncate">{e.edition.book.title}</span>
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
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${distribution === d ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'border-stone-700 text-stone-400 hover:border-stone-500'}`}
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
                            <span className="flex-1 text-sm text-stone-300 truncate">{entry.edition.book.title}</span>
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
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})

  const isCustom = saleGroup?.priceDistribution === 'CUSTOM'

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
    if (!soldAt) { setError('Enter the sale date'); return }
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
                  const bookTitle = (entry.userBookEntry as any)?.edition?.book?.title ?? '—'
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
                              className="w-24 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-amber-400 focus:outline-none focus:border-amber-400"
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
                          <span className="text-amber-400 text-xs">{sold.toFixed(2)} {sgCur}</span>
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
                  <span className="text-amber-400 font-medium">{(customSum ?? 0).toFixed(2)} {saleGroup.currency}</span>
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
              soldAt={soldAt} setSoldAt={setSoldAt}
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
  const userCurrency = user?.preferredCurrency ?? null

  const [bookFilter, setBookFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')
  const [tagFilter, setTagFilter] = useState('ALL')
  const addSaleModal = useModalState()
  const [editingSale, setEditingSale] = useState<ApiSaleGroup | null>(null)
  const [rates, setRates] = useState<Record<string, number>>({})

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ['collection', false],
    queryFn: () =>
      authFetch<{ data: CollectionEntry[]; total: number }>('/collection?isWishlist=false').then(r => r.data),
  })

  const { data: saleGroups = [] } = useQuery({
    queryKey: ['sale-groups'],
    queryFn: getSaleGroups,
  })

  const { data: allUserTags = [] } = useQuery({
    queryKey: ['collection-tags'],
    queryFn: () => authFetch<string[]>('/collection/tags'),
  })

  const deleteSaleMut = useMutation({
    mutationFn: (id: string) => deleteSaleGroup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sale-groups'] }),
  })

  const soldEntries = useMemo(() => allEntries.filter(e => e.ownershipStatus === 'SOLD'), [allEntries])

  const companies = useMemo(() => {
    const set = new Set<string>()
    soldEntries.forEach(e => { if (e.edition.bookBoxCompany?.name) set.add(e.edition.bookBoxCompany.name) })
    return Array.from(set).sort()
  }, [soldEntries])

  const filtered = useMemo(() => soldEntries.filter(e => {
    if (bookFilter && !e.edition.book.title.toLowerCase().includes(bookFilter.toLowerCase())) return false
    if (companyFilter !== 'ALL' && e.edition.bookBoxCompany?.name !== companyFilter) return false
    if (tagFilter !== 'ALL' && !e.tags.includes(tagFilter)) return false
    return true
  }), [soldEntries, bookFilter, companyFilter, tagFilter])

  // Fetch currency rates for all sale currencies vs user's preferred currency
  useEffect(() => {
    if (!userCurrency || saleGroups.length === 0) return
    const tuples: { from: string; to: string; date: string }[] = []
    ;(saleGroups as ApiSaleGroup[]).forEach(sg => {
      if (sg.currency !== userCurrency) {
        const date = sg.soldAt?.slice(0, 10) ?? ''
        tuples.push({ from: sg.currency, to: userCurrency, date })
      }
    })
    soldEntries.forEach(e => {
      if (e.saleCurrency && e.saleCurrency !== userCurrency) {
        tuples.push({ from: e.saleCurrency, to: userCurrency, date: '' })
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
  }, [saleGroups, soldEntries, userCurrency])

  function converted(amount: number, fromCurrency: string | null, date?: string): string | null {
    if (!fromCurrency || !userCurrency || fromCurrency === userCurrency) return null
    const dateKey = date?.slice(0, 10) ?? ''
    const rate = rates[`${fromCurrency}:${userCurrency}:${dateKey}`]
    if (!rate) return null
    return `≈ ${(amount * rate).toFixed(2)} ${userCurrency}`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-stone-400 font-serif text-lg animate-pulse">Loading…</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">Sold Books</h1>
          <p className="text-stone-400 text-sm mt-1">{soldEntries.length} book{soldEntries.length !== 1 ? 's' : ''} sold</p>
        </div>
        <button
          onClick={() => addSaleModal.open()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus size={14} /> Record Sale
        </button>
      </div>

      {/* ── Sold Books ── */}
      <section className="mb-12">
        <h2 className="text-lg font-serif font-semibold text-stone-200 mb-4">Sold Books</h2>

        {soldEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500">
            <ShoppingBag size={48} className="mb-4 opacity-30" />
            <p className="font-serif text-lg">No sold books yet</p>
            <p className="text-sm mt-1">Books you record as sold will appear here</p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex gap-2 flex-wrap items-center mb-6">
              <input
                type="text"
                value={bookFilter}
                onChange={e => setBookFilter(e.target.value)}
                placeholder="Search by title…"
                className="bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-1.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors min-w-[160px]"
              />
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
              {allUserTags.length > 0 && (
                <select
                  value={tagFilter}
                  onChange={e => setTagFilter(e.target.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm border bg-stone-900 focus:outline-none focus:border-teal-400 transition-colors cursor-pointer ${tagFilter !== 'ALL' ? 'text-teal-400 border-teal-500/30 bg-teal-500/10' : 'text-stone-400 border-stone-700 hover:border-stone-500'}`}
                >
                  <option value="ALL">Tag: Any</option>
                  {allUserTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="text-stone-500 text-sm py-8 text-center">No books match these filters.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filtered.map(entry => (
                  <div key={entry.id} className="relative">
                    <EditionCard
                      href={`/editions/${entry.edition.slug}?entry=${entry.id}`}
                      coverImage={entry.edition.additionalImages[0] ?? entry.edition.communityPhotoCover ?? null}
                      title={entry.edition.book.title}
                      authors={entry.edition.book.authors}
                      companyName={entry.edition.bookBoxCompany?.name}
                      companySlug={entry.edition.bookBoxCompany?.slug}
                      companyBrandColors={entry.edition.bookBoxCompany?.brandColors}
                      seriesName={entry.edition.book.seriesName}
                      volumeNumber={entry.edition.book.volumeNumber}
                      footer={
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="default">SOLD</Badge>
                          {entry.salePrice && entry.saleCurrency && (
                            <div className="flex flex-col gap-0">
                              <span className="text-[10px] text-amber-400">
                                {parseFloat(entry.salePrice).toFixed(2)} {entry.saleCurrency}
                              </span>
                              {(() => { const c = converted(parseFloat(entry.salePrice), entry.saleCurrency); return c ? <span className="text-[10px] text-stone-500">{c}</span> : null })()}
                            </div>
                          )}
                        </div>
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Recorded Sales ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-serif font-semibold text-stone-200">Recorded Sales</h2>
          <p className="text-sm text-stone-500">{saleGroups.length} sale{saleGroups.length !== 1 ? 's' : ''}</p>
        </div>

        {saleGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-500">
            <ShoppingBag size={36} className="mb-3 opacity-30" />
            <p className="text-sm">No recorded sales yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(saleGroups as ApiSaleGroup[]).map(sg => (
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
                      onClick={() => setEditingSale(sg)}
                      className="ml-1 p-1 text-stone-500 hover:text-amber-400 transition-colors"
                      title="Edit sale"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteSaleMut.mutate(sg.id)}
                      className="p-1 text-stone-500 hover:text-red-400 transition-colors"
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
                    {(() => { const c = converted(sg.totalAmount, sg.currency, sg.soldAt); return c ? <p className="text-xs text-stone-500">{c}</p> : null })()}
                  </div>
                  {sg.profitLoss != null && (
                    <div>
                      <p className="text-xs text-stone-500">P&amp;L</p>
                      <p className={`text-sm font-semibold ${sg.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {sg.profitLoss >= 0 ? '+' : ''}{sg.profitLoss.toFixed(2)} {sg.currency}
                      </p>
                      {(() => { const c = converted(sg.profitLoss, sg.currency, sg.soldAt); return c ? <p className={`text-xs ${sg.profitLoss >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>{sg.profitLoss >= 0 ? '+' : ''}{c.replace('≈ ', '≈ ')}</p> : null })()}
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
      </section>

      <RecordSaleModal
        open={addSaleModal.isOpen}
        onClose={() => addSaleModal.close()}
        entries={allEntries.filter(e => e.ownershipStatus !== 'SOLD')}
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
