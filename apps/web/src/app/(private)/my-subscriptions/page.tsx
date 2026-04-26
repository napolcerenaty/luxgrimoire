'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { CheckCircle2, XCircle, Ban, Trash2 } from 'lucide-react'

interface MySubscriptionEntry {
  id: string
  active: boolean
  startDate: string | null
  renewalDay: number | null
  costCurrency: string | null
  basePrice: string | null
  shippingCost: string | null
  taxesAndFees: string | null
  nextRenewalDate: string | null
  nextRenewalAmount: string | null
  nextRenewalCurrency: string | null
  subscription: {
    slug: string
    name: string
    coverImage: string | null
    logoUrl: string | null
    currency: string
    price: string | null
    isDiscontinued: boolean
    company: { name: string; slug: string }
  }
}

function formatMoney(amount: string | number | null, currency: string | null) {
  if (amount === null || amount === undefined || !currency) return null
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return null
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n)
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function MySubscriptionsPage() {
  const { data: entries = [], isLoading } = useQuery<MySubscriptionEntry[]>({
    queryKey: ['my-subscriptions'],
    queryFn: () => authFetch('/subscriptions/my/subscriptions'),
  })

  const active = entries.filter(e => e.active)
  const inactive = entries.filter(e => !e.active)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="text-stone-500 animate-pulse">Loading subscriptions…</span>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-serif text-stone-100">My Subscriptions</h1>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <p className="mb-3">You haven't joined any subscriptions yet.</p>
          <Link href="/subscriptions" className="text-amber-400 underline text-sm">
            Browse subscriptions →
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">
                Active ({active.length})
              </h2>
              <div className="space-y-3">
                {active.map(e => <SubscriptionCard key={e.id} entry={e} />)}
              </div>
            </section>
          )}
          {inactive.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">
                Cancelled / Inactive ({inactive.length})
              </h2>
              <div className="space-y-3 opacity-70">
                {inactive.map(e => <SubscriptionCard key={e.id} entry={e} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function SubscriptionCard({ entry }: { entry: MySubscriptionEntry }) {
  const sub = entry.subscription
  const qc = useQueryClient()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(false)
  const [removeSpending, setRemoveSpending] = useState(false)

  const cancelMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry/cancel`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); setShowCancelConfirm(false) },
  })

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({ removeBooks, removeSpending }),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); setShowRemoveConfirm(false) },
  })

  const imageSource = sub.logoUrl ?? sub.coverImage
  const logoThumb = imageSource ? cloudinaryUrl(imageSource, 'w_120,h_120,c_pad,q_auto,f_auto') : null
  const blurBg = imageSource ? cloudinaryUrl(imageSource, 'w_200,h_200,c_fill,q_auto,f_auto') : null

  const renewalLabel = formatDate(entry.nextRenewalDate)
  const renewalAmount = formatMoney(entry.nextRenewalAmount, entry.nextRenewalCurrency)

  return (
    <>
      <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors flex">
        {/* Main clickable area */}
        <Link href={`/subscriptions/${sub.slug}`} className="flex flex-1 min-w-0 group">
          {/* Logo — stretches full height of the row */}
          <div className="relative shrink-0 w-24 self-stretch bg-stone-800">
            {blurBg && (
              <img
                src={blurBg}
                alt=""
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-50"
                aria-hidden
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center p-2">
              {logoThumb ? (
                <img src={logoThumb} alt={sub.name} className="w-full h-full object-contain drop-shadow-md" />
              ) : (
                <span className="text-3xl font-serif text-stone-400">{sub.name[0]}</span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 py-3 px-4 flex flex-col justify-center">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-stone-500 truncate">{sub.company.name}</p>
                <h3 className="font-semibold text-stone-100 leading-tight group-hover:text-amber-400 transition-colors truncate">
                  {sub.name}
                </h3>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {entry.active ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                    <CheckCircle2 size={12} /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-stone-500">
                    <XCircle size={12} /> Cancelled
                  </span>
                )}
                {sub.isDiscontinued && (
                  <span className="text-xs text-amber-600 border border-amber-700/40 rounded px-1.5 py-0.5">
                    Discontinued
                  </span>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {entry.active && renewalLabel && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">Next renewal</p>
                  <p className="text-sm font-medium text-stone-200">{renewalLabel}</p>
                </div>
              )}
              {entry.active && renewalAmount && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">Amount</p>
                  <p className="text-sm font-medium text-amber-400">{renewalAmount}</p>
                </div>
              )}
              {!entry.active && entry.startDate && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">Since</p>
                  <p className="text-sm font-medium text-stone-300">{formatDate(entry.startDate)}</p>
                </div>
              )}
            </div>
          </div>
        </Link>

        {/* Right actions panel — mirroring logo panel, rare destructive actions */}
        <div className="shrink-0 border-l border-stone-800 flex flex-col items-center justify-center gap-2 px-2 bg-stone-900/60 self-stretch">
          {entry.active && (
            <button
              type="button"
              title="Cancel subscription"
              onClick={() => setShowCancelConfirm(true)}
              className="p-1.5 rounded text-stone-500 hover:text-amber-400 hover:bg-stone-800 transition-colors"
            >
              <Ban size={15} />
            </button>
          )}
          <button
            type="button"
            title="Remove from my subscriptions"
            onClick={() => setShowRemoveConfirm(true)}
            className="p-1.5 rounded text-stone-600 hover:text-red-400 hover:bg-stone-800 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Cancel confirm dialog */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCancelConfirm(false)}>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <p className="text-stone-100 font-semibold">Cancel subscription?</p>
            <p className="text-sm text-stone-400">
              Your subscription to <span className="text-stone-200">{sub.name}</span> will be marked as cancelled.
              Your collection and spending history will remain.
            </p>
            {cancelMutation.error && (
              <p className="text-xs text-red-400">{(cancelMutation.error as Error).message}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowCancelConfirm(false)}
                className="px-3 py-1.5 rounded text-sm text-stone-300 hover:text-stone-100 transition-colors">
                Keep it
              </button>
              <button type="button" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}
                className="bg-amber-600 text-white font-semibold px-4 py-1.5 rounded text-sm hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirm dialog */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowRemoveConfirm(false)}>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <p className="text-stone-100 font-semibold">Remove subscription?</p>
            <p className="text-sm text-stone-400">
              This will permanently remove <span className="text-stone-200">{sub.name}</span> from your subscriptions.
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input type="checkbox" checked={removeBooks} onChange={e => setRemoveBooks(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500" />
                Also remove books from my collection
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input type="checkbox" checked={removeSpending} onChange={e => setRemoveSpending(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500" />
                Also remove spending records
              </label>
            </div>
            {removeMutation.error && (
              <p className="text-xs text-red-400">{(removeMutation.error as Error).message}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowRemoveConfirm(false)}
                className="px-3 py-1.5 rounded text-sm text-stone-300 hover:text-stone-100 transition-colors">
                Keep it
              </button>
              <button type="button" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}
                className="bg-red-700 text-white font-semibold px-4 py-1.5 rounded text-sm hover:bg-red-600 disabled:opacity-50 transition-colors">
                {removeMutation.isPending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
