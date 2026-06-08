'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Link from 'next/link'
import { CURRENCIES } from '@/components/sale/SaleFormFields'

const INPUT = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LABEL = 'block text-xs text-stone-400 mb-1'
const BTN_SM = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type PriceChange = {
  id: string; effectiveMonth: number; effectiveYear: number
  newBasePrice: string; currency: string; notes: string | null; createdAt: string
}

type SubscriptionInfo = {
  id: string; name: string; currency?: string | null; parentSubscriptionId?: string | null
  parent?: { slug: string; name: string } | null
}

export default function SubscriptionPricesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const { data: subscription } = useQuery<SubscriptionInfo>({
    queryKey: ['admin', 'subscription', slug],
    queryFn: () => authFetch<SubscriptionInfo>(`/subscriptions/${slug}`),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/subscriptions" className="text-stone-400 hover:text-amber-400 text-sm transition-colors">
          ← Subscriptions
        </Link>
        <span className="text-stone-600">/</span>
        <span className="text-stone-300 text-sm">{subscription?.name ?? slug}</span>
      </div>

      {subscription?.parentSubscriptionId && subscription.parent && (
        <div className="bg-stone-800/60 border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-400">
          Variant of{' '}
          <Link href={`/admin/subscriptions/${subscription.parent.slug}/prices`} className="text-amber-400 hover:underline">
            {subscription.parent.name}
          </Link>
          {' '}— price changes apply to this variant only.
        </div>
      )}

      <PriceChangesPanel slug={slug} subscriptionCurrency={subscription?.currency} />
    </div>
  )
}

function PriceChangesPanel({ slug, subscriptionCurrency }: { slug: string; subscriptionCurrency?: string | null }) {
  const queryClient = useQueryClient()
  const qKey = ['admin', 'subscriptions', slug, 'price-changes-admin']

  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState(subscriptionCurrency ?? 'EUR')
  const [notes, setNotes] = useState('')
  const [showForm, setShowForm] = useState(false)
  // Sentinel edit state
  const [editSentinelId, setEditSentinelId] = useState<string | null>(null)
  const [sentinelPrice, setSentinelPrice] = useState('')
  const [sentinelNotes, setSentinelNotes] = useState('')

  const { data: changes, isLoading } = useQuery<PriceChange[]>({
    queryKey: qKey,
    queryFn: () => authFetch<PriceChange[]>(`/subscriptions/${slug}/price-changes/admin`),
  })

  const addMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${slug}/price-changes`, {
      method: 'POST',
      body: JSON.stringify({
        effectiveMonth: parseInt(month),
        effectiveYear: parseInt(year),
        newBasePrice: parseFloat(price),
        currency,
        notes: notes || undefined,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey })
      setShowForm(false); setPrice(''); setNotes('')
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, newBasePrice, notes }: { id: string; newBasePrice: number; notes?: string }) =>
      authFetch(`/subscriptions/${slug}/price-changes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ newBasePrice, notes: notes || undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey })
      setEditSentinelId(null)
    },
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/subscriptions/${slug}/price-changes/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qKey }),
    onError: (e: Error) => alert(`Error: ${e.message}`),
  })

  const startEditSentinel = (pc: PriceChange) => {
    setEditSentinelId(pc.id)
    setSentinelPrice(parseFloat(pc.newBasePrice).toFixed(2))
    setSentinelNotes(pc.notes ?? '')
  }

  return (
    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-stone-100 font-semibold text-sm">💰 Price Change History</h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className={`${BTN_SM} ${showForm ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-stone-700 hover:bg-stone-600 text-stone-300'}`}
        >
          {showForm ? 'Cancel' : '+ Add Price Change'}
        </button>
      </div>

      {showForm && (
        <div className="bg-stone-800 rounded-xl p-3 space-y-3 border border-stone-700">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>Month *</label>
              <select value={month} onChange={e => setMonth(e.target.value)} className={INPUT}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>{i+1} — {MONTH_NAMES[i]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Year *</label>
              <input type="number" value={year} onChange={e => setYear(e.target.value)}
                min={2000} max={2100} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>New base price *</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                min={0} step={0.01} placeholder="e.g. 34.99" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Currency *</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Annual price increase" className={INPUT} />
          </div>
          <button
            disabled={addMutation.isPending || !price || !currency}
            onClick={() => addMutation.mutate()}
            className="bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-sm"
          >
            {addMutation.isPending ? 'Saving…' : 'Save Price Change'}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-stone-500 text-sm">Loading…</p>
      ) : !changes?.length ? (
        <p className="text-stone-600 text-sm italic">No price changes recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {changes.map(pc => {
            const isSentinel = pc.effectiveYear === 1900
            const isEditing = editSentinelId === pc.id
            return (
              <div key={pc.id} className={`rounded-lg px-3 py-2 text-sm ${isSentinel ? 'bg-stone-800/50 border border-amber-900/40' : 'bg-stone-800'}`}>
                {isEditing ? (
                  <div className="space-y-2">
                    <p className="text-amber-400/80 text-xs font-medium">⚓ Editing initial base price ({pc.currency})</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={LABEL}>Price *</label>
                        <input type="number" value={sentinelPrice} onChange={e => setSentinelPrice(e.target.value)}
                          min={0} step={0.01} className={INPUT} />
                      </div>
                      <div>
                        <label className={LABEL}>Notes</label>
                        <input value={sentinelNotes} onChange={e => setSentinelNotes(e.target.value)} className={INPUT} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={updateMutation.isPending || !sentinelPrice}
                        onClick={() => updateMutation.mutate({ id: pc.id, newBasePrice: parseFloat(sentinelPrice), notes: sentinelNotes || undefined })}
                        className="bg-amber-400 text-stone-950 font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-300 disabled:opacity-50 text-xs"
                      >
                        {updateMutation.isPending ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditSentinelId(null)} className="text-xs text-stone-400 hover:text-stone-200">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-stone-100 font-medium">
                        {isSentinel
                          ? <span className="text-amber-400/80">⚓ Base price (sentinel)</span>
                          : <>{MONTH_NAMES[pc.effectiveMonth - 1]} {pc.effectiveYear}</>
                        }
                        {' '}— {parseFloat(pc.newBasePrice).toFixed(2)} {pc.currency}
                      </span>
                      {isSentinel && <p className="text-stone-500 text-xs">Initial known price. Edit to correct it.</p>}
                      {pc.notes && <p className="text-stone-500 text-xs">{pc.notes}</p>}
                    </div>
                    <div className="flex gap-3 ml-3 shrink-0">
                      {isSentinel && (
                        <button
                          onClick={() => startEditSentinel(pc)}
                          className="text-amber-500 hover:text-amber-400 text-xs transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {!isSentinel && (
                        <button
                          onClick={() => { if (confirm('Delete this price change?')) deleteMutation.mutate(pc.id) }}
                          disabled={deleteMutation.isPending}
                          className="text-red-500 hover:text-red-400 text-xs transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
