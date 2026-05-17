'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Link from 'next/link'
import Image from 'next/image'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
import { CheckCircle2, XCircle, Ban, Trash2, LayoutGrid, List } from 'lucide-react'

const PREFS_KEY = 'my_subscriptions_prefs'

function loadPrefs(): { viewMode: 'list' | 'grid'; tab: 'active' | 'cancelled' } {
  if (typeof window === 'undefined') return { viewMode: 'list', tab: 'active' }
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    return { viewMode: p.viewMode ?? 'list', tab: 'active' }
  } catch { return { viewMode: 'list', tab: 'active' } }
}
function savePrefs(prefs: { viewMode: 'list' | 'grid' }) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* noop */ }
}

interface MembershipHistoryRecord {
  id: string
  startDate: string | null
  endDate: string | null
  cancellationReason: string | null
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
  membershipHistory: MembershipHistoryRecord[]
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
    setPrefs(p => { const n = { ...p, viewMode: v }; savePrefs(n); return n })
  }
  const setTab = (t: 'active' | 'cancelled') => {
    setPrefs(p => ({ ...p, tab: t }))
  }

  // Active entries — always fetch
  const { data: activeEntries = [], isLoading: loadingActive } = useQuery<MySubscriptionEntry[]>({
    queryKey: ['my-subscriptions', 'active'],
    queryFn: () => authFetch('/subscriptions/my/subscriptions?active=true'),
  })

  // Cancelled entries — lazy: only fetch when tab first opened
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

  // History records from active entries (re-joined subs)
  const historyFromActive: Array<{ entry: MySubscriptionEntry; record: MembershipHistoryRecord }> = []
  for (const e of activeEntries) {
    for (const h of (e.membershipHistory ?? [])) {
      historyFromActive.push({ entry: e, record: h })
    }
  }
  historyFromActive.sort((a, b) => {
    const da = a.record.endDate ?? ''
    const db = b.record.endDate ?? ''
    return db.localeCompare(da)
  })

  const cancelledCount = cancelledEntries.length + historyFromActive.length

  if (loadingActive) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="text-stone-500 animate-pulse">Loading subscriptions…</span>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-serif text-stone-100">My Subscriptions</h1>
        <div className="flex rounded-lg border border-stone-700 overflow-hidden shrink-0">
          <button type="button" onClick={() => setView('list')}
            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 hover:text-stone-300 bg-stone-900'}`}
            aria-label="List view"><List size={15} /></button>
          <button type="button" onClick={() => setView('grid')}
            className={`px-2.5 py-1.5 border-l border-stone-700 transition-colors ${viewMode === 'grid' ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 hover:text-stone-300 bg-stone-900'}`}
            aria-label="Grid view"><LayoutGrid size={15} /></button>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Active tab */}
      {tab === 'active' && (
        activeEntries.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <p className="mb-3">You haven't joined any subscriptions yet.</p>
            <Link href="/subscriptions" className="text-amber-400 underline text-sm">
              Browse subscriptions →
            </Link>
          </div>
        ) : (
          viewMode === 'list' ? (
            <div className="space-y-3">
              {activeEntries.map(e => <SubscriptionCard key={e.id} entry={e} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {activeEntries.map(e => <SubscriptionTile key={e.id} entry={e} />)}
            </div>
          )
        )
      )}

      {/* Cancelled tab */}
      {tab === 'cancelled' && (
        loadingCancelled ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-stone-500 animate-pulse">Loading history…</span>
          </div>
        ) : cancelledEntries.length === 0 && historyFromActive.length === 0 ? (
          <div className="text-center py-16 text-stone-500">No cancelled subscriptions.</div>
        ) : (
          <div className={`opacity-75 ${viewMode === 'list' ? 'space-y-3' : 'grid grid-cols-2 sm:grid-cols-3 gap-4'}`}>
            {cancelledEntries.map(e => viewMode === 'list'
              ? <SubscriptionCard key={e.id} entry={e} />
              : <SubscriptionTile key={e.id} entry={e} />
            )}
            {historyFromActive.map(({ entry: e, record: h }) => (
              <HistoryPeriodRow key={h.id} entry={e} record={h} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ── Card (tile) view ──────────────────────────────────────────────────────────

function SubscriptionTile({ entry }: { entry: MySubscriptionEntry }) {
  const sub = entry.subscription
  const qc = useQueryClient()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(false)
  const [removeSpending, setRemoveSpending] = useState(false)
  const [removeAllPeriods, setRemoveAllPeriods] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

  const history = entry.membershipHistory ?? []
  const hasHistory = history.length > 0

  const cancelMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry/cancel`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] }); setShowCancelConfirm(false) },
  })
  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({
        removeBooks,
        removeSpending,
        ...(hasHistory && !removeAllPeriods && selectedHistoryId ? { historyId: selectedHistoryId } : {}),
        ...(hasHistory && removeAllPeriods ? { removeAllPeriods: true } : {}),
      }),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] }); setShowRemoveConfirm(false) },
  })

  const imageSource = sub.coverImage ?? sub.logoUrl
  const thumb = imageSource ? cloudinaryUrl(imageSource, 'w_400,h_300,c_pad,b_auto,q_auto,f_auto') : null
  const renewalLabel = formatDate(entry.nextRenewalDate)
  const renewalAmount = formatMoney(entry.nextRenewalAmount, entry.nextRenewalCurrency)

  return (
    <div className="group bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors flex flex-col">
      {/* Cover — clickable */}
      <Link href={`/subscriptions/${sub.slug}`} className="block relative aspect-[4/3] w-full">
        {thumb ? (
          <Image src={thumb} alt={sub.name} fill className="object-contain group-hover:scale-105 transition-transform duration-300" unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={brandGradientStyle(sub.company.brandColors)}>
            <span className="text-white/80 font-serif text-lg font-semibold text-center px-3 leading-tight drop-shadow">{sub.name}</span>
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-2 right-2">
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

      {/* Info + actions */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <Link href={`/subscriptions/${sub.slug}`} className="block">
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
            {!entry.active && entry.cancellationReason && <p className="text-[10px] text-stone-500 italic">{entry.cancellationReason}</p>}
          </div>
        )}
        {/* Action buttons */}
        <div className="flex gap-1 mt-auto pt-2 justify-end">
          {entry.active && (
            <button type="button" title="Cancel subscription" onClick={() => setShowCancelConfirm(true)}
              className="p-1.5 rounded text-stone-500 hover:text-amber-400 hover:bg-stone-800 transition-colors">
              <Ban size={14} />
            </button>
          )}
          <button type="button" title="Remove from my subscriptions" onClick={() => setShowRemoveConfirm(true)}
            className="p-1.5 rounded text-stone-600 hover:text-red-400 hover:bg-stone-800 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Cancel confirm */}
      {showCancelConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCancelConfirm(false)}>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <p className="text-stone-100 font-semibold">Cancel subscription?</p>
            <p className="text-sm text-stone-400">Your subscription to <span className="text-stone-200">{sub.name}</span> will be marked as cancelled.</p>
            {cancelMutation.error && <p className="text-xs text-red-400">{(cancelMutation.error as Error).message}</p>}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowCancelConfirm(false)} className="px-3 py-1.5 rounded text-sm text-stone-300 hover:text-stone-100 transition-colors">Keep it</button>
              <button type="button" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}
                className="bg-amber-600 text-white font-semibold px-4 py-1.5 rounded text-sm hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Remove confirm */}
      {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowRemoveConfirm(false)}>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <p className="text-stone-100 font-semibold">Remove subscription?</p>
            <p className="text-sm text-stone-400">This will permanently remove <span className="text-stone-200">{sub.name}</span> from your subscriptions.</p>
            {hasHistory && (
              <div className="space-y-2">
                <p className="text-xs text-stone-400 font-medium">Select period to remove:</p>
                {history.map(h => (
                  <label key={h.id} className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                    <input type="radio" name={`period-tile-${entry.id}`} checked={!removeAllPeriods && selectedHistoryId === h.id}
                      onChange={() => { setSelectedHistoryId(h.id); setRemoveAllPeriods(false) }}
                      className="text-amber-500" />
                    {h.startDate ?? '?'} – {h.endDate ?? 'present'}{h.cancellationReason ? ` (${h.cancellationReason})` : ''}
                  </label>
                ))}
                {history.length > 1 && (
                  <label className="flex items-center gap-2 text-sm text-red-400 cursor-pointer">
                    <input type="radio" name={`period-tile-${entry.id}`} checked={removeAllPeriods}
                      onChange={() => { setRemoveAllPeriods(true); setSelectedHistoryId(null) }}
                      className="text-red-500" />
                    Remove all periods
                  </label>
                )}
              </div>
            )}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input type="checkbox" checked={removeBooks} onChange={e => setRemoveBooks(e.target.checked)} className="rounded border-stone-600 bg-stone-800 text-amber-500" />
                Also remove books from my collection
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input type="checkbox" checked={removeSpending} onChange={e => setRemoveSpending(e.target.checked)} className="rounded border-stone-600 bg-stone-800 text-amber-500" />
                Also remove spending records
              </label>
            </div>
            {removeMutation.error && <p className="text-xs text-red-400">{(removeMutation.error as Error).message}</p>}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowRemoveConfirm(false)} className="px-3 py-1.5 rounded text-sm text-stone-300 hover:text-stone-100 transition-colors">Keep it</button>
              <button type="button" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}
                className="bg-red-700 text-white font-semibold px-4 py-1.5 rounded text-sm hover:bg-red-600 disabled:opacity-50 transition-colors">
                {removeMutation.isPending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ── History period row (past cancelled period for re-joined subscriptions) ────

function HistoryPeriodRow({ entry, record }: { entry: MySubscriptionEntry; record: MembershipHistoryRecord }) {
  const sub = entry.subscription
  const imageSource = sub.logoUrl ?? sub.coverImage
  const logoThumb = imageSource ? cloudinaryUrl(imageSource, 'w_120,h_120,c_pad,q_auto,f_auto') : null
  const blurBg = imageSource ? cloudinaryUrl(imageSource, 'w_200,h_200,c_fill,q_auto,f_auto') : null

  return (
    <Link href={`/subscriptions/${sub.slug}`}
      className="flex gap-3 bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors items-stretch">
      {/* Logo */}
      <div className="relative w-16 shrink-0">
        {logoThumb ? (
          <>
            {blurBg && <Image src={blurBg} alt="" fill className="object-cover blur-sm scale-110 opacity-40" unoptimized />}
            <div className="relative z-10 flex items-center justify-center h-full p-1.5">
              <Image src={logoThumb} alt={sub.name} width={48} height={48} className="object-contain rounded" unoptimized />
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={brandGradientStyle(sub.company.brandColors)}>
            <span className="text-white/80 text-[10px] font-semibold text-center px-1 leading-tight">{sub.name}</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 py-3 pr-3 flex flex-col justify-center gap-0.5 min-w-0">
        <p className="text-[10px] text-stone-500 truncate">{sub.company.name}</p>
        <p className="text-sm font-semibold text-stone-300 truncate">{sub.name}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          <p className="text-[10px] text-stone-500">
            {record.startDate ?? '?'} – {record.endDate ?? '?'}
          </p>
          {record.cancellationReason && (
            <p className="text-[10px] text-stone-500 italic">{record.cancellationReason}</p>
          )}
        </div>
      </div>
      {/* Badge */}
      <div className="flex items-center pr-3">
        <span className="flex items-center gap-1 text-[10px] font-medium text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded">
          <XCircle size={10} /> Past
        </span>
      </div>
    </Link>
  )
}

// ── List (row) view ───────────────────────────────────────────────────────────

function SubscriptionCard({ entry }: { entry: MySubscriptionEntry }) {
  const sub = entry.subscription
  const qc = useQueryClient()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(false)
  const [removeSpending, setRemoveSpending] = useState(false)
  const [removeAllPeriods, setRemoveAllPeriods] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

  const history = entry.membershipHistory ?? []
  const hasHistory = history.length > 0

  const cancelMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry/cancel`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] }); setShowCancelConfirm(false) },
  })

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({
        removeBooks,
        removeSpending,
        ...(hasHistory && !removeAllPeriods && selectedHistoryId ? { historyId: selectedHistoryId } : {}),
        ...(hasHistory && removeAllPeriods ? { removeAllPeriods: true } : {}),
      }),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] }); setShowRemoveConfirm(false) },
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
          <div className="relative shrink-0 w-24 self-stretch" style={!blurBg ? brandGradientStyle(sub.company.brandColors) : undefined}>
            {blurBg && (
              <Image
                src={blurBg}
                alt=""
                fill
                className="object-cover scale-110 blur-md opacity-50"
                aria-hidden
                unoptimized
              />
            )}
            {!blurBg && <div className="absolute inset-0" style={brandGradientStyle(sub.company.brandColors)} />}
            <div className="absolute inset-0 flex items-center justify-center p-2">
              {logoThumb ? (
                <Image src={logoThumb} alt={sub.name} fill className="object-contain drop-shadow-md" unoptimized />
              ) : (
                <span className="text-3xl font-serif text-stone-300">{sub.name[0]}</span>
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
              {!entry.active && entry.cancellationDate && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">Cancelled</p>
                  <p className="text-sm font-medium text-stone-400">{formatDate(entry.cancellationDate)}</p>
                  {entry.cancellationReason && <p className="text-[10px] text-stone-500 italic mt-0.5">{entry.cancellationReason}</p>}
                </div>
              )}
              {/* Membership history periods */}
              {!entry.active && history.length > 0 && (
                <div className="col-span-2 mt-1">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Membership history</p>
                  <div className="flex flex-col gap-0.5">
                    {history.map(h => (
                      <p key={h.id} className="text-xs text-stone-400">
                        {h.startDate ?? '?'} – {h.endDate ?? 'present'}
                        {h.cancellationReason ? <span className="text-stone-500"> · {h.cancellationReason}</span> : null}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Link>

        {/* Right actions panel */}
        <div className="shrink-0 border-l border-stone-800 flex flex-col items-center justify-center gap-2 px-2 bg-stone-900/60 self-stretch">
          {entry.active && (
            <button type="button" title="Cancel subscription" onClick={() => setShowCancelConfirm(true)}
              className="p-1.5 rounded text-stone-500 hover:text-amber-400 hover:bg-stone-800 transition-colors">
              <Ban size={15} />
            </button>
          )}
          <button type="button" title="Remove from my subscriptions" onClick={() => setShowRemoveConfirm(true)}
            className="p-1.5 rounded text-stone-600 hover:text-red-400 hover:bg-stone-800 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Cancel confirm dialog */}
      {showCancelConfirm && typeof document !== 'undefined' && createPortal(
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
        </div>,
        document.body
      )}

      {/* Remove confirm dialog */}
      {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowRemoveConfirm(false)}>
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <p className="text-stone-100 font-semibold">Remove subscription?</p>
            <p className="text-sm text-stone-400">
              This will permanently remove <span className="text-stone-200">{sub.name}</span> from your subscriptions.
            </p>
            {hasHistory && (
              <div className="space-y-2">
                <p className="text-xs text-stone-400 font-medium">Select period to remove:</p>
                {history.map(h => (
                  <label key={h.id} className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                    <input type="radio" name={`period-card-${entry.id}`} checked={!removeAllPeriods && selectedHistoryId === h.id}
                      onChange={() => { setSelectedHistoryId(h.id); setRemoveAllPeriods(false) }}
                      className="text-amber-500" />
                    {h.startDate ?? '?'} – {h.endDate ?? 'present'}{h.cancellationReason ? ` (${h.cancellationReason})` : ''}
                  </label>
                ))}
                {history.length > 1 && (
                  <label className="flex items-center gap-2 text-sm text-red-400 cursor-pointer">
                    <input type="radio" name={`period-card-${entry.id}`} checked={removeAllPeriods}
                      onChange={() => { setRemoveAllPeriods(true); setSelectedHistoryId(null) }}
                      className="text-red-500" />
                    Remove all periods
                  </label>
                )}
              </div>
            )}
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
        </div>,
        document.body
      )}
    </>
  )
}
