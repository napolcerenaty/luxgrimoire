'use client'

import { useState } from 'react'
import { X, ShoppingBag, Loader2 } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

import { parseDecimalInput } from '@/lib/parseDecimalInput'

interface Props {
  sale: ApiSaleAnnouncement
  preselectedTier?: 'FA' | 'EA' | 'GS'
  onClose: () => void
  onSuccess?: () => void
}

const TIERS = [
  { value: 'FA', label: 'First Access' },
  { value: 'EA', label: 'Early Access' },
  { value: 'GS', label: 'General Sale' },
] as const

export function ConfirmPurchaseModal({ sale, preselectedTier = 'GS', onClose, onSuccess }: Props) {
  const editions = sale.editions ?? []

  const [tier, setTier] = useState<'FA' | 'EA' | 'GS'>(preselectedTier)
  const [selectedEditionIds, setSelectedEditionIds] = useState<string[]>(
    editions.map(e => e.editionId).filter(Boolean) as string[]
  )
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [totalAmount, setTotalAmount] = useState('')
  const [currency, setCurrency] = useState(sale.currency ?? 'USD')
  const [shippingAmount, setShippingAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleEdition = (id: string) => {
    setSelectedEditionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedEditionIds.length === 0) { setError('Select at least one edition'); return }
    if (!totalAmount || parseDecimalInput(totalAmount) <= 0) { setError('Enter a valid total amount'); return }

    setLoading(true)
    setError(null)
    try {
      await authFetch(`/collection/bundles/from-sale/${sale.id}`, {
        method: 'POST',
        body: JSON.stringify({
          tier,
          purchasedAt: new Date(purchasedAt).toISOString(),
          totalAmount: parseDecimalInput(totalAmount),
          currency: currency.toUpperCase(),
          shippingAmount: shippingAmount ? parseDecimalInput(shippingAmount) : undefined,
          editionIds: selectedEditionIds,
          notes: notes || undefined,
        }),
      })
      onSuccess?.()
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to confirm purchase')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full bg-stone-900 shadow-2xl max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-stone-700 sm:rounded-2xl sm:border sm:border-stone-700 sm:max-w-lg sm:mx-4">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-100 transition-colors"
        >
          <X size={18} />
        </button>
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-stone-600" />
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-violet-400" />
            <h2 className="text-lg font-serif font-bold text-stone-100">Confirm Purchase</h2>
          </div>
          <p className="text-sm text-stone-400 -mt-2">{sale.title}</p>

          {/* Tier */}
          <div>
            <label className="text-xs text-stone-500 uppercase tracking-wider block mb-2">Sale Tier</label>
            <div className="flex gap-2">
              {TIERS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTier(t.value)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    tier === t.value
                      ? 'bg-violet-800/60 border-violet-500 text-violet-200'
                      : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editions */}
          {editions.length > 0 && (
            <div>
              <label className="text-xs text-stone-500 uppercase tracking-wider block mb-2">
                Editions purchased
              </label>
              <div className="space-y-1.5">
                {editions.map(({ edition, editionId }) => {
                  if (!edition) return null
                  const checked = selectedEditionIds.includes(editionId)
                  return (
                    <button
                      key={editionId}
                      type="button"
                      onClick={() => toggleEdition(editionId)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${
                        checked
                          ? 'bg-violet-900/30 border-violet-600/50 text-stone-200'
                          : 'bg-stone-800/50 border-stone-700 text-stone-400 hover:text-stone-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${
                        checked ? 'bg-violet-600 border-violet-600' : 'border-stone-600'
                      }`}>
                        {checked && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      <span className="text-xs">{(edition as any).title || formatEditionDisplayTitle(edition.book, edition) || 'Edition'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Date + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1.5">Purchase date</label>
              <input
                type="date"
                value={purchasedAt}
                onChange={e => setPurchasedAt(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1.5">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                maxLength={3}
                placeholder="USD"
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-violet-500 uppercase"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1.5">Total amount</label>
              <input
                type="number"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1.5">Shipping (optional)</label>
              <input
                type="number"
                value={shippingAmount}
                onChange={e => setShippingAmount(e.target.value)}
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-600 text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
            Confirm Purchase → Preorder
          </button>
        </form>
      </div>
    </div>
  )
}
