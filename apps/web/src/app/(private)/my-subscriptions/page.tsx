'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Link from 'next/link'
import Image from 'next/image'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle } from '@/lib/brandGradient'
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

type OrphanedHistorySub = {
  slug: string
  name: string
  coverImage: string | null
  logoUrl: string | null
  currency: string
  isDiscontinued: boolean
  company: { name: string; slug: string; brandColors?: string[] | null }
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

  // Orphaned history records (removeCurrentOnly was used)
  const { data: orphanedHistory = [] } = useQuery<Array<{ subscription: OrphanedHistorySub; records: MembershipHistoryRecord[] }>>({
    queryKey: ['my-subscriptions', 'orphaned-history'],
    queryFn: () => authFetch('/subscriptions/my/orphaned-history'),
    enabled: cancelledEnabled,
  })

  const handleCancelledTab = () => {
    setCancelledEnabled(true)
    setTab('cancelled')
  }

  // History records from active entries (re-joined subs) — grouped by subscription
  const historyByEntry: Array<{ entry: MySubscriptionEntry; records: MembershipHistoryRecord[] }> = []
  for (const e of activeEntries) {
    const history = e.membershipHistory ?? []
    if (history.length === 0) continue
    const sorted = [...history].sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))
    historyByEntry.push({ entry: e, records: sorted })
  }
  historyByEntry.sort((a, b) => {
    const da = a.records[0]?.endDate ?? ''
    const db = b.records[0]?.endDate ?? ''
    return db.localeCompare(da)
  })

  const cancelledCount = cancelledEntries.length + historyByEntry.length + orphanedHistory.length

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
        ) : cancelledEntries.length === 0 && historyByEntry.length === 0 && orphanedHistory.length === 0 ? (
          <div className="text-center py-16 text-stone-500">No cancelled subscriptions.</div>
        ) : (
          <div className={`opacity-75 ${viewMode === 'list' ? 'space-y-3' : 'grid grid-cols-2 sm:grid-cols-3 gap-4'}`}>
            {cancelledEntries.map(e => viewMode === 'list'
              ? <SubscriptionCard key={e.id} entry={e} />
              : <SubscriptionTile key={e.id} entry={e} />
            )}
            {historyByEntry.map(({ entry: e, records }) => (
              <HistoryPeriodRow key={e.id} entry={e} records={records} viewMode={viewMode} />
            ))}
            {orphanedHistory.map(({ subscription, records }) => (
              <OrphanedHistoryRow key={subscription.slug} subscription={subscription} records={records} viewMode={viewMode} />
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
  const getBrandColors = useBrandColors()
  const brandColors = getBrandColors(sub.company.slug) ?? sub.company.brandColors
  const qc = useQueryClient()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(true)
  const [removeSpending, setRemoveSpending] = useState(true)
  const [removeAllPeriods, setRemoveAllPeriods] = useState(false)
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([])
  const [removeCurrentPeriod, setRemoveCurrentPeriod] = useState(false)

  const history = entry.membershipHistory ?? []
  const hasHistory = history.length > 0

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({
        removeBooks,
        removeSpending,
        ...(removeAllPeriods ? { removeAllPeriods: true }
          : removeCurrentPeriod && selectedHistoryIds.length === 0 ? { removeCurrentOnly: true }
          : selectedHistoryIds.length > 0 ? { historyIds: selectedHistoryIds }
          : {}),
      }),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] }); setShowRemoveConfirm(false) },
  })

  const coverUrl = cloudinaryUrl(sub.coverImage ?? sub.logoUrl, 'w_600,q_auto,f_auto')
  const renewalLabel = formatDate(entry.nextRenewalDate)
  const renewalAmount = formatMoney(entry.nextRenewalAmount, entry.nextRenewalCurrency)

  return (
    <div className="group bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors flex flex-col">
      {/* Cover — clickable */}
      <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="block relative">
        <SubCoverImage coverUrl={coverUrl} name={sub.name} brandColors={brandColors} aspectClass="aspect-[4/3]" />
        {/* Status badge */}
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

      {/* Info + actions */}
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
      {showCancelConfirm && (
        <CancelSubscriptionModal
          subscriptionSlug={sub.slug}
          onCancelled={() => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] }); setShowCancelConfirm(false) }}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}

      {/* Remove confirm */}
      {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
        <EntryRemoveDialog
          entry={entry} subName={sub.name}
          removeBooks={removeBooks} setRemoveBooks={setRemoveBooks}
          removeSpending={removeSpending} setRemoveSpending={setRemoveSpending}
          selectedHistoryIds={selectedHistoryIds} setSelectedHistoryIds={setSelectedHistoryIds}
          removeCurrentPeriod={removeCurrentPeriod} setRemoveCurrentPeriod={setRemoveCurrentPeriod}
          removeAllPeriods={removeAllPeriods} setRemoveAllPeriods={setRemoveAllPeriods}
          isPending={removeMutation.isPending} error={removeMutation.error?.message}
          onConfirm={() => removeMutation.mutate()} onClose={() => setShowRemoveConfirm(false)}
        />,
        document.body
      )}
    </div>
  )
}

// ── History period row (past cancelled period for re-joined subscriptions) ────

function HistoryPeriodRow({ entry, records, viewMode = 'list' }: { entry: MySubscriptionEntry; records: MembershipHistoryRecord[]; viewMode?: 'list' | 'grid' }) {
  const sub = entry.subscription
  const qc = useQueryClient()
  const removeMutation = useMutation({
    mutationFn: ({ historyId, historyIds, removeAllPeriods, removeBooks, removeSpending }: HistoryRemoveArgs) =>
      authFetch(`/subscriptions/${sub.slug}/my-entry`, {
        method: 'DELETE',
        body: JSON.stringify({
          ...(removeBooks !== undefined ? { removeBooks } : {}),
          ...(removeSpending !== undefined ? { removeSpending } : {}),
          ...(!removeAllPeriods && historyIds && historyIds.length > 0 ? { historyIds } : {}),
          ...(!removeAllPeriods && !historyIds?.length && historyId ? { historyId } : {}),
          ...(removeAllPeriods ? { removeAllPeriods: true } : {}),
        }),
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }) },
  })
  return (
    <HistoryCard
      sub={sub}
      records={records}
      viewMode={viewMode}
      showBooksSpending={true}
      onRemove={args => removeMutation.mutate(args)}
      isPending={removeMutation.isPending}
      error={removeMutation.error?.message}
    />
  )
}

function OrphanedHistoryRow({ subscription: sub, records, viewMode = 'list' }: { subscription: OrphanedHistorySub; records: MembershipHistoryRecord[]; viewMode?: 'list' | 'grid' }) {
  const qc = useQueryClient()
  const removeMutation = useMutation({
    mutationFn: async ({ historyId, historyIds, removeAllPeriods }: HistoryRemoveArgs) => {
      const idsToRemove = removeAllPeriods ? records.map(r => r.id) : historyIds?.length ? historyIds : historyId ? [historyId] : []
      await Promise.all(idsToRemove.map(id => authFetch(`/subscriptions/my/orphaned-history/${id}`, { method: 'DELETE' })))
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions', 'orphaned-history'] }) },
  })
  return (
    <HistoryCard
      sub={sub}
      records={records}
      viewMode={viewMode}
      showBooksSpending={false}
      onRemove={args => removeMutation.mutate(args)}
      isPending={removeMutation.isPending}
      error={removeMutation.error?.message}
    />
  )
}

// ── Shared history card (past periods of re-joined or orphaned subs) ──────────

type HistoryCardSub = {
  slug: string
  name: string
  coverImage: string | null
  logoUrl: string | null
  company: { name: string; slug: string; brandColors?: string[] | null }
}

type HistoryRemoveArgs = {
  historyId?: string
  historyIds?: string[]
  removeAllPeriods?: boolean
  removeBooks?: boolean
  removeSpending?: boolean
}

function HistoryCard({
  sub,
  records,
  viewMode = 'list',
  showBooksSpending = false,
  onRemove,
  isPending,
  error,
}: {
  sub: HistoryCardSub
  records: MembershipHistoryRecord[]
  viewMode?: 'list' | 'grid'
  showBooksSpending?: boolean
  onRemove: (args: HistoryRemoveArgs) => void
  isPending: boolean
  error?: string | null
}) {
  const getBrandColors = useBrandColors()
  const brandColors = getBrandColors(sub.company.slug) ?? sub.company.brandColors
  const imageSource = sub.logoUrl ?? sub.coverImage
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(true)
  const [removeSpending, setRemoveSpending] = useState(true)
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>(records.length === 1 ? [records[0].id] : [])
  const [removeAllPeriods, setRemoveAllPeriods] = useState(false)

  const handleRemove = () => {
    onRemove({
      ...(removeAllPeriods ? { removeAllPeriods: true } : selectedHistoryIds.length > 0 ? { historyIds: selectedHistoryIds } : {}),
      ...(showBooksSpending ? { removeBooks, removeSpending } : {}),
    })
  }

  // Auto-close dialog on successful removal
  const wasPendingRef = useRef(false)
  useEffect(() => {
    if (wasPendingRef.current && !isPending && !error) {
      setShowRemoveConfirm(false)
    }
    wasPendingRef.current = isPending
  }, [isPending, error])

  if (viewMode === 'grid') {
    const thumb = imageSource ? cloudinaryUrl(imageSource, 'w_400,h_300,c_pad,b_auto,q_auto,f_auto') : null
    return (
      <div className="group bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors flex flex-col">
        <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="block relative aspect-[4/3] w-full">
          {thumb ? (
            <Image src={thumb} alt={sub.name} fill className="object-contain group-hover:scale-105 transition-transform duration-300" unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={brandGradientStyle(brandColors)}>
              <span className="text-white/80 font-serif text-lg font-semibold text-center px-3 leading-tight drop-shadow">{sub.name}</span>
            </div>
          )}
          <div className="absolute top-2 right-2">
            <span className="flex items-center gap-1 text-[10px] font-medium text-stone-400 bg-stone-950/80 px-1.5 py-0.5 rounded">
              <XCircle size={10} /> Past
            </span>
          </div>
        </Link>
        <div className="p-3 flex flex-col gap-1 flex-1">
          <p className="text-[10px] text-stone-500 truncate">{sub.company.name}</p>
          <p className="text-sm font-semibold text-stone-100 group-hover:text-amber-400 transition-colors leading-tight truncate">{sub.name}</p>
          <div className="flex flex-col gap-0.5 mt-0.5 flex-1">
            {records.map(r => (
              <p key={r.id} className="text-[10px] text-stone-500">
                {formatDate(r.startDate) ?? '?'} – {formatDate(r.endDate) ?? '?'}
                {r.cancellationReason ? <span className="italic"> · {r.cancellationReason}</span> : null}
              </p>
            ))}
          </div>
          <div className="flex justify-end pt-2 mt-auto">
            <button type="button" title="Remove period(s)" onClick={() => setShowRemoveConfirm(true)}
              className="p-1.5 rounded text-stone-600 hover:text-red-400 hover:bg-stone-800 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
          <HistoryRemoveDialog subName={sub.name} records={records}
            showBooksSpending={showBooksSpending}
            removeBooks={removeBooks} setRemoveBooks={setRemoveBooks}
            removeSpending={removeSpending} setRemoveSpending={setRemoveSpending}
            selectedHistoryIds={selectedHistoryIds} setSelectedHistoryIds={setSelectedHistoryIds}
            removeAllPeriods={removeAllPeriods} setRemoveAllPeriods={setRemoveAllPeriods}
            isPending={isPending} error={error}
            onConfirm={handleRemove} onClose={() => setShowRemoveConfirm(false)} />,
          document.body
        )}
      </div>
    )
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors flex">
      <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="flex flex-1 min-w-0 group">
        <SubListThumbnail imageSource={sub.logoUrl ?? sub.coverImage} brandColors={brandColors} name={sub.name} />
        <div className="flex-1 min-w-0 py-3 px-4 flex flex-col justify-center">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-stone-500 truncate">{sub.company.name}</p>
              <h3 className="font-semibold text-stone-100 leading-tight group-hover:text-amber-400 transition-colors truncate">{sub.name}</h3>
            </div>
            <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-stone-500">
              <XCircle size={12} /> Past
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {records.map(r => (
              <p key={r.id} className="text-xs text-stone-400">
                {formatDate(r.startDate)} – {formatDate(r.endDate)}
                {r.cancellationReason ? <span className="text-stone-500 italic"> · {r.cancellationReason}</span> : null}
              </p>
            ))}
          </div>
        </div>
      </Link>
      <div className="shrink-0 border-l border-stone-800 flex flex-col items-center justify-center px-2 bg-stone-900/60 self-stretch">
        <button type="button" title="Remove period(s)" onClick={() => setShowRemoveConfirm(true)}
          className="p-1.5 rounded text-stone-600 hover:text-red-400 hover:bg-stone-800 transition-colors">
          <Trash2 size={15} />
        </button>
      </div>
      {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
        <HistoryRemoveDialog subName={sub.name} records={records}
          showBooksSpending={showBooksSpending}
          removeBooks={removeBooks} setRemoveBooks={setRemoveBooks}
          removeSpending={removeSpending} setRemoveSpending={setRemoveSpending}
          selectedHistoryIds={selectedHistoryIds} setSelectedHistoryIds={setSelectedHistoryIds}
          removeAllPeriods={removeAllPeriods} setRemoveAllPeriods={setRemoveAllPeriods}
          isPending={isPending} error={error}
          onConfirm={handleRemove} onClose={() => setShowRemoveConfirm(false)} />,
        document.body
      )}
    </div>
  )
}

// ── Unified history remove dialog ─────────────────────────────────────────────

function HistoryRemoveDialog({
  subName, records, showBooksSpending,
  removeBooks, setRemoveBooks, removeSpending, setRemoveSpending,
  selectedHistoryIds, setSelectedHistoryIds, removeAllPeriods, setRemoveAllPeriods,
  isPending, error, onConfirm, onClose,
}: {
  subName: string
  records: MembershipHistoryRecord[]
  showBooksSpending: boolean
  removeBooks: boolean; setRemoveBooks: (v: boolean) => void
  removeSpending: boolean; setRemoveSpending: (v: boolean) => void
  selectedHistoryIds: string[]; setSelectedHistoryIds: (v: string[]) => void
  removeAllPeriods: boolean; setRemoveAllPeriods: (v: boolean) => void
  isPending: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const canSubmit = removeAllPeriods || selectedHistoryIds.length > 0

  const toggleHistoryId = (id: string) => {
    const next = selectedHistoryIds.includes(id)
      ? selectedHistoryIds.filter(x => x !== id)
      : [...selectedHistoryIds, id]
    setSelectedHistoryIds(next)
    if (next.length < records.length) setRemoveAllPeriods(false)
    if (next.length === records.length) setRemoveAllPeriods(true)
  }

  const toggleAll = (checked: boolean) => {
    setRemoveAllPeriods(checked)
    setSelectedHistoryIds(checked ? records.map(r => r.id) : [])
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-sm">
        <div className="p-5 border-b border-stone-800">
          <h2 className="text-stone-100 font-semibold">Remove period</h2>
          <p className="text-xs text-stone-400 mt-1">Remove past period(s) of <span className="text-stone-200">{subName}</span>.</p>
        </div>
        <div className="p-5 space-y-3">
          {records.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs text-stone-400 font-medium">Select period(s) to remove:</p>
              {records.map(r => (
                <label key={r.id} className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                  <input type="checkbox" checked={removeAllPeriods || selectedHistoryIds.includes(r.id)}
                    onChange={() => toggleHistoryId(r.id)}
                    className="accent-amber-500" />
                  {formatDate(r.startDate) ?? '?'} – {formatDate(r.endDate) ?? '?'}
                  {r.cancellationReason ? <span className="text-stone-500 text-xs italic"> · {r.cancellationReason}</span> : null}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-red-400 cursor-pointer border-t border-stone-800 pt-2 mt-1">
                <input type="checkbox" checked={removeAllPeriods}
                  onChange={e => toggleAll(e.target.checked)}
                  className="accent-red-500" />
                Remove all periods
              </label>
            </div>
          )}
          {records.length === 1 && (
            <p className="text-xs text-stone-500">
              Period: {formatDate(records[0].startDate) ?? '?'} – {formatDate(records[0].endDate) ?? '?'} will be permanently removed.
            </p>
          )}
          {showBooksSpending && (
            <>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" checked={removeBooks} onChange={e => setRemoveBooks(e.target.checked)} className="mt-0.5 accent-amber-600" />
                <div>
                  <span className="text-sm text-stone-300 group-hover:text-stone-100 transition-colors">Remove books from my collection</span>
                  <p className="text-xs text-stone-600 mt-0.5">Books acquired in this period will be removed from your library.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" checked={removeSpending} onChange={e => setRemoveSpending(e.target.checked)} className="mt-0.5 accent-amber-600" />
                <div>
                  <span className="text-sm text-stone-300 group-hover:text-stone-100 transition-colors">Remove spending history</span>
                  <p className="text-xs text-stone-600 mt-0.5">Payment transactions linked to this period will be deleted.</p>
                </div>
              </label>
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-stone-800">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-stone-700 text-stone-400 text-sm hover:border-stone-500 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isPending || !canSubmit}
            className="flex-1 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-stone-100 text-sm font-medium transition-colors disabled:opacity-50">
            {isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared remove dialog for subscription entries (used by Card + Tile) ───────

function EntryRemoveDialog({
  entry, subName,
  removeBooks, setRemoveBooks, removeSpending, setRemoveSpending,
  selectedHistoryIds, setSelectedHistoryIds, removeCurrentPeriod, setRemoveCurrentPeriod,
  removeAllPeriods, setRemoveAllPeriods,
  isPending, error, onConfirm, onClose,
}: {
  entry: MySubscriptionEntry
  subName: string
  removeBooks: boolean; setRemoveBooks: (v: boolean) => void
  removeSpending: boolean; setRemoveSpending: (v: boolean) => void
  selectedHistoryIds: string[]; setSelectedHistoryIds: (v: string[]) => void
  removeCurrentPeriod: boolean; setRemoveCurrentPeriod: (v: boolean) => void
  removeAllPeriods: boolean; setRemoveAllPeriods: (v: boolean) => void
  isPending: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const history = entry.membershipHistory ?? []
  const distinctHistory = entry.startDate
    ? history.filter(h => h.endDate != null && h.endDate < entry.startDate!)
    : history
  const hasHistory = distinctHistory.length > 0
  const totalPeriods = (hasHistory ? distinctHistory.length : 0) + 1 // +1 for current/only period
  const canSubmit = !hasHistory || removeAllPeriods || removeCurrentPeriod || selectedHistoryIds.length > 0

  const toggleHistoryId = (id: string) => {
    const next = selectedHistoryIds.includes(id)
      ? selectedHistoryIds.filter(x => x !== id)
      : [...selectedHistoryIds, id]
    setSelectedHistoryIds(next)
    const allSelected = next.length === distinctHistory.length && removeCurrentPeriod
    if (!allSelected) setRemoveAllPeriods(false)
    if (allSelected) setRemoveAllPeriods(true)
  }

  const toggleCurrent = (checked: boolean) => {
    setRemoveCurrentPeriod(checked)
    const allSelected = checked && selectedHistoryIds.length === distinctHistory.length
    if (!allSelected) setRemoveAllPeriods(false)
    if (allSelected) setRemoveAllPeriods(true)
  }

  const toggleAll = (checked: boolean) => {
    setRemoveAllPeriods(checked)
    setRemoveCurrentPeriod(checked)
    setSelectedHistoryIds(checked ? distinctHistory.map(h => h.id) : [])
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <p className="text-stone-100 font-semibold">Remove subscription?</p>
        <p className="text-sm text-stone-400">
          This will permanently remove <span className="text-stone-200">{subName}</span> from your subscriptions.
        </p>
        {hasHistory && (
          <div className="space-y-2">
            <p className="text-xs text-stone-400 font-medium">Select period(s) to remove:</p>
            {/* Current period */}
            <label className="flex items-start gap-2 text-sm cursor-pointer group">
              <input type="checkbox" checked={removeAllPeriods || removeCurrentPeriod}
                onChange={e => toggleCurrent(e.target.checked)}
                className={`mt-0.5 ${entry.active ? 'accent-emerald-500' : 'accent-amber-500'}`} />
              <span>
                {entry.active ? (
                  <span className="text-emerald-300">{formatDate(entry.startDate) ?? '?'} – present</span>
                ) : (
                  <span className="text-amber-300">{formatDate(entry.startDate) ?? '?'} – {formatDate(entry.cancellationDate) ?? 'cancelled'}</span>
                )}
                <span className={`text-xs ml-1 ${entry.active ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {entry.active ? '(current)' : '(cancelled)'}
                </span>
                <span className="block text-[10px] text-stone-600 mt-0.5">History records will be kept</span>
              </span>
            </label>
            {distinctHistory.map(h => (
              <label key={h.id} className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input type="checkbox" checked={removeAllPeriods || selectedHistoryIds.includes(h.id)}
                  onChange={() => toggleHistoryId(h.id)}
                  className="accent-amber-500" />
                {formatDate(h.startDate) ?? '?'} – {formatDate(h.endDate) ?? '?'}
                {h.cancellationReason ? <span className="text-stone-500 text-xs"> · {h.cancellationReason}</span> : null}
              </label>
            ))}
            {totalPeriods > 1 && (
              <label className="flex items-center gap-2 text-sm text-red-400 cursor-pointer border-t border-stone-800 pt-2 mt-1">
                <input type="checkbox" checked={removeAllPeriods}
                  onChange={e => toggleAll(e.target.checked)}
                  className="accent-red-500" />
                Remove everything (current + all history)
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
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-stone-300 hover:text-stone-100 transition-colors">
            Keep it
          </button>
          <button type="button" onClick={onConfirm} disabled={isPending || !canSubmit}
            className="bg-red-700 text-white font-semibold px-4 py-1.5 rounded text-sm hover:bg-red-600 disabled:opacity-50 transition-colors">
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
  const [removeAllPeriods, setRemoveAllPeriods] = useState(false)
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([])
  const [removeCurrentPeriod, setRemoveCurrentPeriod] = useState(false)

  const history = entry.membershipHistory ?? []
  const hasHistory = history.length > 0

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({
        removeBooks,
        removeSpending,
        ...(removeAllPeriods ? { removeAllPeriods: true }
          : removeCurrentPeriod && selectedHistoryIds.length === 0 ? { removeCurrentOnly: true }
          : selectedHistoryIds.length > 0 ? { historyIds: selectedHistoryIds }
          : {}),
      }),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] }); setShowRemoveConfirm(false) },
  })

  const renewalLabel = formatDate(entry.nextRenewalDate)
  const renewalAmount = formatMoney(entry.nextRenewalAmount, entry.nextRenewalCurrency)

  return (
    <>
      <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-stone-700 transition-colors flex">
        {/* Main clickable area */}
        <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="flex flex-1 min-w-0 group">
          {/* Logo — stretches full height of the row */}
          <SubListThumbnail imageSource={sub.logoUrl ?? sub.coverImage} brandColors={brandColors} name={sub.name} />

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
      {showCancelConfirm && (
        <CancelSubscriptionModal
          subscriptionSlug={sub.slug}
          onCancelled={() => { void qc.invalidateQueries({ queryKey: ['my-subscriptions'] }); void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] }); setShowCancelConfirm(false) }}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}

      {/* Remove confirm dialog */}
      {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
        <EntryRemoveDialog
          entry={entry} subName={sub.name}
          removeBooks={removeBooks} setRemoveBooks={setRemoveBooks}
          removeSpending={removeSpending} setRemoveSpending={setRemoveSpending}
          selectedHistoryIds={selectedHistoryIds} setSelectedHistoryIds={setSelectedHistoryIds}
          removeCurrentPeriod={removeCurrentPeriod} setRemoveCurrentPeriod={setRemoveCurrentPeriod}
          removeAllPeriods={removeAllPeriods} setRemoveAllPeriods={setRemoveAllPeriods}
          isPending={removeMutation.isPending} error={removeMutation.error?.message}
          onConfirm={() => removeMutation.mutate()} onClose={() => setShowRemoveConfirm(false)}
        />,
        document.body
      )}
    </>
  )
}

