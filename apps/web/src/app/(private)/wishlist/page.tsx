'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { EditionCard } from '@/components/books/EditionCard'
import { BookOpen, Trash2, MoveRight, X } from 'lucide-react'
import { parseDecimalInput } from '@/lib/parseDecimalInput'

interface CollectionEntry {
  id: string
  isWishlist: boolean
  condition: string | null
  acquiredAt: string | null
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

const CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF']

const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
const LABEL = 'block text-xs font-medium text-stone-400 mb-1'

export default function WishlistPage() {
  const queryClient = useQueryClient()

  const [moveEntry, setMoveEntry] = useState<CollectionEntry | null>(null)
  const [moveDate, setMoveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [movePrice, setMovePrice] = useState('')
  const [moveCurrency, setMoveCurrency] = useState('EUR')
  const [shippingPrice, setShippingPrice] = useState('')
  const [shippingCurrency, setShippingCurrency] = useState('EUR')
  const [selectedCustomsTemplateId, setSelectedCustomsTemplateId] = useState('')

  const { data: result, isLoading } = useQuery({
    queryKey: ['collection', true],
    queryFn: () => authFetch<PaginatedEntries>('/collection?isWishlist=true&pageSize=100'),
  })

  const { data: feeTemplates = [] } = useQuery({
    queryKey: ['fee-templates'],
    queryFn: () => authFetch<FeeTemplate[]>('/fees/templates?activeOnly=true'),
    enabled: !!moveEntry,
  })

  const entries = result?.data ?? []

  const removeMutation = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/collection/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['collection', true] }),
  })

  const moveMutation = useMutation({
    mutationFn: async ({ id, date, price, currency, shipping, shippingCur, customsTemplate }: {
      id: string; date: string; price: string; currency: string;
      shipping: string; shippingCur: string; customsTemplate: FeeTemplate | null
    }) => {
      const body: Record<string, unknown> = { isWishlist: false }
      if (date) body.acquiredAt = new Date(date).toISOString()
      const parsedPrice = parseDecimalInput(price)
      if (parsedPrice > 0) {
        body.allocatedPrice = String(parsedPrice)
        body.priceCurrency = currency
      }
      await authFetch<void>(`/collection/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      const feeDate = date || new Date().toISOString().slice(0, 10)
      const parsedShipping = parseDecimalInput(shipping)
      if (parsedShipping > 0) {
        await authFetch('/fees', {
          method: 'POST',
          body: JSON.stringify({ name: 'Shipping', amount: parsedShipping, currency: shippingCur, date: feeDate, category: 'FORWARDING', userBookEntryId: id }),
        })
      }
      if (customsTemplate && (customsTemplate.defaultAmount ?? 0) > 0) {
        await authFetch('/fees', {
          method: 'POST',
          body: JSON.stringify({ feeTemplateId: customsTemplate.id, name: customsTemplate.name, amount: customsTemplate.defaultAmount, currency: customsTemplate.defaultCurrency ?? 'EUR', date: feeDate, category: customsTemplate.category ?? 'CUSTOMS', userBookEntryId: id }),
        })
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] })
      void queryClient.invalidateQueries({ queryKey: ['collection-stats'] })
      setMoveEntry(null)
      setMovePrice('')
      setShippingPrice('')
      setSelectedCustomsTemplateId('')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-stone-400 animate-pulse">Loading wishlist…</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-stone-100">Wishlist</h1>
        <p className="text-stone-400 text-sm mt-1">
          {entries.length} {entries.length === 1 ? 'item' : 'items'} on your wishlist
        </p>
      </div>

      {entries.length === 0 ? (
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
              href={`/books/${entry.edition.book.slug}`}
              coverImage={entry.edition.coverImage}
              companyName={entry.edition.bookBoxCompany?.name}
              seriesName={entry.edition.book.seriesName}
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
              <label className={LABEL}>Purchase date</label>
              <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} className={INPUT} />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                <label className={LABEL}>Currency</label>
                <select value={moveCurrency} onChange={e => setMoveCurrency(e.target.value)} className={INPUT}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Shipping cost (optional)</label>
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
                <select value={shippingCurrency} onChange={e => setShippingCurrency(e.target.value)} className={INPUT}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={LABEL}>Customs fee template (optional)</label>
              <select
                value={selectedCustomsTemplateId}
                onChange={e => setSelectedCustomsTemplateId(e.target.value)}
                className={INPUT}
              >
                <option value="">— None —</option>
                {feeTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.category ? ` (${t.category})` : ''}{t.defaultAmount ? ` — ${t.defaultAmount} ${t.defaultCurrency ?? ''}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setMoveEntry(null)}
                className="flex-1 py-2 rounded-xl border border-stone-700 text-stone-400 text-sm hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const customsTemplate = feeTemplates.find(t => t.id === selectedCustomsTemplateId) ?? null
                  moveMutation.mutate({ id: moveEntry.id, date: moveDate, price: movePrice, currency: moveCurrency, shipping: shippingPrice, shippingCur: shippingCurrency, customsTemplate })
                }}
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

