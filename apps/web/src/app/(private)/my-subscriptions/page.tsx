'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { useBrandColors } from '@/lib/useBrandColors'
import { SubListThumbnail } from '@/components/subscriptions/SubListThumbnail'
import { SubCoverImage } from '@/components/subscriptions/SubCoverImage'
import { CancelSubscriptionModal } from '@/components/subscriptions/CancelSubscriptionModal'
import { CheckCircle2, XCircle, Ban, Trash2, LayoutGrid, List } from 'lucide-react'

const PREFS_KEY = 'my_subscriptions_prefs'

function loadPrefs(): { viewMode: 'list' | 'grid'; tab: 'active' | 'cancelled' } {
  if (typeof window === 'undefined') return { viewMode: 'list', tab: 'active' }
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    return { viewMode: p.viewMode ?? 'list', tab: 'active' }
  } catch {
    return { viewMode: 'list', tab: 'active' }
  }
}

function savePrefs(prefs: { viewMode: 'list' | 'grid' }) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* noop */
  }
}

interface MySubscriptionEntry {
  id: string
  active: boolean
  startDate: string | null
  cancellationDate: string | null
  cancellationReason: string | null
  renewalDay: number | null
  costCurrency: string | null
  basePrice: string | null
  shippingCost: string | null
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
    company: { name: string; slug: string; brandColors?: string[] | null }
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
  const [{ viewMode, tab }, setPrefs] = useState(() => loadPrefs())

  const setView = (v: 'list' | 'grid') => {
    setPrefs(p => {
      const next = { ...p, viewMode: v }
      savePrefs(next)
      return next
    })
  }

  const setTab = (t: 'active' | 'cancelled') => {
    setPrefs(p => ({ ...p, tab: t }))
  }

  const { data: activeEntries = [], isLoading: loadingActive } = useQuery<MySubscriptionEntry[]>({
    queryKey: ['my-subscriptions', 'active'],
    queryFn: () => authFetch('/subscriptions/my/subscriptions?active=true'),
  })

  const [cancelledEnabled, setCancelledEnabled] = useState(false)
  const { data: cancelledEntries = [], isLoading: loadingCancelled } = useQuery<MySubscriptionEntry[]>({
    queryKey: ['my-subscriptions', 'cancelled'],
    queryFn: () => authFetch('/subscriptions/my/subscriptions?active=false'),
    enabled: cancelledEnabled,
  })

  const handleCancelledTab = () => {
    setCancelledEnabled(true)
    setTab('cancelled')
  }

  const cancelledCount = cancelledEntries.length

  if (loadingActive) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="text-stone-500 animate-pulse">Loading subscriptions…</span>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-serif text-stone-100">My Subscriptions</h1>
        <div className="flex rounded-lg border border-stone-700 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 hover:text-stone-300 bg-stone-900'}`}
            aria-label="List view"
          >
            <List size={15} />
          </button>
          <button
            type="button"
            onClick={() => setView('grid')}
            className={`px-2.5 py-1.5 border-l border-stone-700 transition-colors ${viewMode === 'grid' ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 hover:text-stone-300 bg-stone-900'}`}
            aria-label="Grid view"
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-stone-800">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'active'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-300'
          }`}
        >
          Active
          {activeEntries.length > 0 && (
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab === 'active' ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-800 text-stone-500'}`}>
              {activeEntries.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleCancelledTab}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'cancelled'
              ? 'border-stone-400 text-stone-300'
              : 'border-transparent text-stone-500 hover:text-stone-300'
          }`}
        >
          Cancelled
          {cancelledEnabled && cancelledCount > 0 && (
            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tab === 'cancelled' ? 'bg-stone-700 text-stone-400' : 'bg-stone-800 text-stone-500'}`}>
              {cancelledCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'active' && (
        activeEntries.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <p className="mb-3">You haven't joined any subscriptions yet.</p>
            <Link href="/subscriptions" className="text-amber-400 underline text-sm">
              Browse subscriptions →
            </Link>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-3">
            {activeEntries.map(entry => <SubscriptionCard key={entry.id} entry={entry} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {activeEntries.map(entry => <SubscriptionTile key={entry.id} entry={entry} />)}
          </div>
        )
      )}

      {tab === 'cancelled' && (
        loadingCancelled ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-stone-500 animate-pulse">Loading history…</span>
          </div>
        ) : cancelledEntries.length === 0 ? (
          <div className="text-center py-16 text-stone-500">No cancelled subscriptions.</div>
        ) : (
          <div className={`opacity-75 ${viewMode === 'list' ? 'space-y-3' : 'grid grid-cols-2 sm:grid-cols-3 gap-4'}`}>
            {cancelledEntries.map(entry => (
              viewMode === 'list'
                ? <SubscriptionCard key={entry.id} entry={entry} />
                : <SubscriptionTile key={entry.id} entry={entry} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

function SubscriptionTile({ entry }: { entry: MySubscriptionEntry }) {
  const sub = entry.subscription
  const getBrandColors = useBrandColors()
  const brandColors = getBrandColors(sub.company.slug) ?? sub.company.brandColors
  const qc = useQueryClient()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(true)
  const [removeSpending, setRemoveSpending] = useState(true)

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({
        removeBooks,
        removeSpending,
        ...(entry.active ? {} : { historyId: entry.id }),
      }),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-subscriptions'] })
      void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] })
      setShowRemoveConfirm(false)
    },
  })

  const coverUrl = cloudinaryUrl(sub.coverImage ?? sub.logoUrl, 'w_600,q_auto,f_auto')
  const renewalLabel = formatDate(entry.nextRenewalDate)
  const renewalAmount = formatMoney(entry.nextRenewalAmount, entry.nextRenewalCurrency)

  return (
    <div className="group bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors flex flex-col">
      <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="block relative">
        <SubCoverImage coverUrl={coverUrl} name={sub.name} brandColors={brandColors} aspectClass="aspect-[4/3]" />
        <div className="absolute top-2 right-2 z-10">
          {entry.active ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-stone-950/80 px-1.5 py-0.5 rounded">
              <CheckCircle2 size={10} /> Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-medium text-stone-400 bg-stone-950/80 px-1.5 py-0.5 rounded">
              <XCircle size={10} /> Cancelled
            </span>
          )}
        </div>
      </Link>

      <div className="p-3 flex flex-col gap-1 flex-1">
        <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="block">
          <p className="text-[10px] text-stone-500 truncate">{sub.company.name}</p>
          <p className="text-sm font-semibold text-stone-100 group-hover:text-amber-400 transition-colors leading-tight truncate">{sub.name}</p>
        </Link>
        {entry.active && renewalLabel && (
          <p className="text-[10px] text-stone-400">{renewalLabel}{renewalAmount ? ` · ${renewalAmount}` : ''}</p>
        )}
        {!entry.active && (
          <div className="flex gap-3">
            {entry.startDate && <p className="text-[10px] text-stone-500">Since {formatDate(entry.startDate)}</p>}
            {entry.cancellationDate && <p className="text-[10px] text-stone-500">Cancelled {formatDate(entry.cancellationDate)}</p>}
            {entry.cancellationReason && <p className="text-[10px] text-stone-500 italic">{entry.cancellationReason}</p>}
          </div>
        )}
        <div className="flex gap-1 mt-auto pt-2 justify-end">
          {entry.active && (
            <button
              type="button"
              title="Cancel subscription"
              onClick={() => setShowCancelConfirm(true)}
              className="p-1.5 rounded text-stone-500 hover:text-amber-400 hover:bg-stone-800 transition-colors"
            >
              <Ban size={14} />
            </button>
          )}
          <button
            type="button"
            title="Remove from my subscriptions"
            onClick={() => setShowRemoveConfirm(true)}
            className="p-1.5 rounded text-stone-600 hover:text-red-400 hover:bg-stone-800 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {showCancelConfirm && (
        <CancelSubscriptionModal
          subscriptionSlug={sub.slug}
          onCancelled={() => {
            void qc.invalidateQueries({ queryKey: ['my-subscriptions'] })
            void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] })
            setShowCancelConfirm(false)
          }}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}

      {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
        <EntryRemoveDialog
          entry={entry}
          subName={sub.name}
          removeBooks={removeBooks}
          setRemoveBooks={setRemoveBooks}
          removeSpending={removeSpending}
          setRemoveSpending={setRemoveSpending}
          isPending={removeMutation.isPending}
          error={removeMutation.error?.message}
          onConfirm={() => removeMutation.mutate()}
          onClose={() => setShowRemoveConfirm(false)}
        />,
        document.body,
      )}
    </div>
  )
}

function EntryRemoveDialog({
  entry,
  subName,
  removeBooks,
  setRemoveBooks,
  removeSpending,
  setRemoveSpending,
  isPending,
  error,
  onConfirm,
  onClose,
}: {
  entry: MySubscriptionEntry
  subName: string
  removeBooks: boolean
  setRemoveBooks: (v: boolean) => void
  removeSpending: boolean
  setRemoveSpending: (v: boolean) => void
  isPending: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const canSubmit = true
  const periodLabel = `${formatDate(entry.startDate) ?? '?'} – ${formatDate(entry.cancellationDate) ?? '?'}`

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <p className="text-stone-100 font-semibold">Remove subscription?</p>
        <p className="text-sm text-stone-400">
          This will permanently remove <span className="text-stone-200">{subName}</span> from your subscriptions.
        </p>
        {entry.active ? (
          <p className="text-xs text-stone-500 bg-stone-800 rounded-lg px-3 py-2">
            This removes your current subscription period. Any past periods are shown in the Cancelled tab and can be removed from there.
          </p>
        ) : (
          <p className="text-xs text-stone-500 bg-stone-800 rounded-lg px-3 py-2">
            Period: <span className="text-stone-300">{periodLabel}</span>
          </p>
        )}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
            <input
              type="checkbox"
              checked={removeBooks}
              onChange={e => setRemoveBooks(e.target.checked)}
              className="rounded border-stone-600 bg-stone-800 text-amber-500"
            />
            Also remove books from my collection
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
            <input
              type="checkbox"
              checked={removeSpending}
              onChange={e => setRemoveSpending(e.target.checked)}
              className="rounded border-stone-600 bg-stone-800 text-amber-500"
            />
            Also remove spending records
          </label>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-stone-300 hover:text-stone-100 transition-colors"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || !canSubmit}
            className="bg-red-700 text-white font-semibold px-4 py-1.5 rounded text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SubscriptionCard({ entry }: { entry: MySubscriptionEntry }) {
  const sub = entry.subscription
  const getBrandColors = useBrandColors()
  const brandColors = getBrandColors(sub.company.slug) ?? sub.company.brandColors
  const qc = useQueryClient()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(true)
  const [removeSpending, setRemoveSpending] = useState(true)

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({
        removeBooks,
        removeSpending,
        ...(entry.active ? {} : { historyId: entry.id }),
      }),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-subscriptions'] })
      void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] })
      setShowRemoveConfirm(false)
    },
  })

  const renewalLabel = formatDate(entry.nextRenewalDate)
  const renewalAmount = formatMoney(entry.nextRenewalAmount, entry.nextRenewalCurrency)

  return (
    <>
      <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors flex">
        <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="flex flex-1 min-w-0 group">
          <SubListThumbnail imageSource={sub.logoUrl ?? sub.coverImage} brandColors={brandColors} name={sub.name} />

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
              {!entry.active && entry.cancellationDate && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">Cancelled</p>
                  <p className="text-sm font-medium text-stone-400">{formatDate(entry.cancellationDate)}</p>
                  {entry.cancellationReason && <p className="text-[10px] text-stone-500 italic mt-0.5">{entry.cancellationReason}</p>}
                </div>
              )}
            </div>
          </div>
        </Link>

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

      {showCancelConfirm && (
        <CancelSubscriptionModal
          subscriptionSlug={sub.slug}
          onCancelled={() => {
            void qc.invalidateQueries({ queryKey: ['my-subscriptions'] })
            void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] })
            setShowCancelConfirm(false)
          }}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}

      {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
        <EntryRemoveDialog
          entry={entry}
          subName={sub.name}
          removeBooks={removeBooks}
          setRemoveBooks={setRemoveBooks}
          removeSpending={removeSpending}
          setRemoveSpending={setRemoveSpending}
          isPending={removeMutation.isPending}
          error={removeMutation.error?.message}
          onConfirm={() => removeMutation.mutate()}
          onClose={() => setShowRemoveConfirm(false)}
        />,
        document.body,
      )}
    </>
  )
}
