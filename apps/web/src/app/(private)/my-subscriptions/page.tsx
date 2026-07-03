'use client'

import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiSkipStatus, ApiSubscriptionMonth, ApiFeeTemplate, PaginatedResponse } from '@luxgrimoire/shared-types'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { useBrandColors } from '@/lib/useBrandColors'
import { CancelSubscriptionModal } from '@/components/subscriptions/CancelSubscriptionModal'
import { SubCoverImage } from '@/components/subscriptions/SubCoverImage'
import { SubListThumbnail } from '@/components/subscriptions/SubListThumbnail'
import { Ban, CheckCircle2, ChevronDown, ChevronUp, LayoutGrid, List, Trash2, XCircle } from 'lucide-react'

const PREFS_KEY = 'my_subscriptions_prefs'
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  isForwarding: boolean
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
  nextBoxMonth: { year: number; month: number } | null
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

type EntryFeeTemplate = {
  customAmount: string | null
  customCurrency: string | null
  feeTemplate: {
    id: string
    name: string
    defaultAmount: string | null
    defaultCurrency: string
    isActive: boolean
  }
}

interface MyEntryDetail {
  shippingCost: string | null
  basePrice: string | null
  costCurrency: string | null
  active: boolean
  isForwarding: boolean
  scheduledPrepayOptionId: string | null
  renewalDay: number | null
  nextRenewalDate: string | null
  nextRenewalAmount: string | null
  nextRenewalCurrency: string | null
  cancellationDate: string | null
  cancellationReason: string | null
  feeTemplates: EntryFeeTemplate[]
}

type PrepayOption = {
  id: string
  months: number
  price: number | string
  currency: string
  label: string | null
  validFrom?: string | null
  validUntil?: string | null
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

function formatMonthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month]} ${year}`
}

function getYearMonthFromIso(iso: string | null) {
  if (!iso) return null
  const match = iso.match(/^(\d{4})-(\d{2})/)
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) }
  }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 }
}

function matchesSubscriptionSearch(entry: MySubscriptionEntry, query: string) {
  return entry.subscription.name.toLowerCase().includes(query)
}

function getCostTotal(detail: MyEntryDetail, fallbackCurrency: string) {
  const currency = detail.costCurrency ?? fallbackCurrency
  const base = detail.basePrice ? parseFloat(detail.basePrice) : null
  const shipping = detail.shippingCost ? parseFloat(detail.shippingCost) : null
  if (base === null || shipping === null || Number.isNaN(base) || Number.isNaN(shipping)) return null

  let total = base + shipping
  for (const link of detail.feeTemplates.filter(item => item.feeTemplate.isActive)) {
    const amount = link.customAmount ?? link.feeTemplate.defaultAmount
    const feeCurrency = link.customCurrency ?? link.feeTemplate.defaultCurrency
    if (amount == null || feeCurrency !== currency) return null
    const parsed = parseFloat(amount)
    if (Number.isNaN(parsed)) return null
    total += parsed
  }

  return { amount: total, currency }
}

function OverviewLoadingBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`h-3 rounded bg-stone-700/60 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

function InlineCostsEditor({
  subscriptionSlug,
  detail,
  fallbackCurrency,
  onCancel,
  onSaved,
}: {
  subscriptionSlug: string
  detail: MyEntryDetail
  fallbackCurrency: string
  onCancel: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [basePrice, setBasePrice] = useState(detail.basePrice ?? '')
  const [shippingCost, setShippingCost] = useState(detail.shippingCost ?? '')
  const [costCurrency, setCostCurrency] = useState(detail.costCurrency ?? fallbackCurrency)
  const [isForwarding, setIsForwarding] = useState(detail.isForwarding)
  const [scheduledPrepayOptionId, setScheduledPrepayOptionId] = useState<string | null>(detail.scheduledPrepayOptionId ?? null)
  const [prepayOptions, setPrepayOptions] = useState<PrepayOption[]>([])
  const [feeLinks, setFeeLinks] = useState(
    detail.feeTemplates.map(f => ({
      templateId: f.feeTemplate.id,
      name: f.feeTemplate.name,
      customAmount: f.customAmount ?? f.feeTemplate.defaultAmount ?? '',
      customCurrency: f.customCurrency ?? f.feeTemplate.defaultCurrency,
    })),
  )
  const [allTemplates, setAllTemplates] = useState<ApiFeeTemplate[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    import('@/lib/api').then(({ getFeeTemplates }) => {
      getFeeTemplates(true).then(setAllTemplates).catch(() => {})
    })
    // Fetch prepay options for this subscription
    import('@/lib/authFetch').then(({ authFetch }) => {
      authFetch<PrepayOption[]>(`/subscriptions/${subscriptionSlug}/prepay-options`)
        .then(opts => setPrepayOptions(opts ?? []))
        .catch(() => {})
    })
  }, [subscriptionSlug])

  function toggleTemplate(t: ApiFeeTemplate) {
    if (feeLinks.find(f => f.templateId === t.id)) {
      setFeeLinks(prev => prev.filter(f => f.templateId !== t.id))
    } else {
      setFeeLinks(prev => [...prev, {
        templateId: t.id,
        name: t.name,
        customAmount: t.defaultAmount != null ? String(t.defaultAmount) : '',
        customCurrency: t.defaultCurrency ?? fallbackCurrency,
      }])
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const { updateMyEntryCosts } = await import('@/lib/api')
      const { authFetch: af } = await import('@/lib/authFetch')
      await updateMyEntryCosts(subscriptionSlug, {
        basePrice: basePrice || undefined,
        shippingCost: shippingCost || undefined,
        costCurrency: costCurrency || undefined,
        isForwarding,
        linkedFeeTemplates: feeLinks.map(f => ({
          templateId: f.templateId,
          customAmount: f.customAmount ? parseDecimalInput(f.customAmount) : null,
          customCurrency: f.customCurrency || null,
        })),
      })
      if (prepayOptions.length > 0) {
        await af(`/subscriptions/${subscriptionSlug}/my-entry/billing-mode`, {
          method: 'PATCH',
          body: JSON.stringify({ scheduledPrepayOptionId }),
        })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sub-entry-detail', subscriptionSlug] }),
        queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] }),
      ])
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-100 text-sm focus:outline-none focus:border-amber-400 transition-colors'

  return (
    <div className="rounded-xl border border-stone-700/60 bg-stone-900/80 p-3 space-y-3">
      {/* Price · Shipping · Currency — one row */}
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="block text-[10px] text-stone-500 mb-1 uppercase tracking-wider">Price</label>
          <input type="number" step="0.01" min="0" value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-[10px] text-stone-500 mb-1 uppercase tracking-wider">Shipping</label>
          <input type="number" step="0.01" min="0" value={shippingCost} onChange={e => setShippingCost(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
        <div className="shrink-0">
          <label className="block text-[10px] text-stone-500 mb-1 uppercase tracking-wider">CCY</label>
          <input type="text" value={costCurrency} onChange={e => setCostCurrency(e.target.value.toUpperCase())} maxLength={3} className="w-14 bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-stone-100 text-sm uppercase text-center focus:outline-none focus:border-amber-400 transition-colors" />
        </div>
      </div>

      {/* Forwarding + Billing mode */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isForwarding}
            onChange={e => setIsForwarding(e.target.checked)}
            className="rounded border-stone-600 bg-stone-800 text-amber-500"
          />
          <span className="text-sm text-stone-300">📦 Forwarding</span>
        </label>
        {prepayOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-500">Billing mode</label>
            <select
              value={scheduledPrepayOptionId ?? ''}
              onChange={e => setScheduledPrepayOptionId(e.target.value || null)}
              className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-400 transition-colors"
            >
              <option value="">Monthly</option>
              {prepayOptions.filter(o => {
                const now = new Date()
                if (o.validFrom && new Date(o.validFrom) > now) return false
                if (o.validUntil && new Date(o.validUntil) <= now) return false
                return true
              }).map(o => (
                <option key={o.id} value={o.id}>
                  {o.label ?? `${o.months} months`} — {o.price} {o.currency}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Linked fees */}
      <div>
        <p className="text-xs text-stone-400 mb-2">Fees</p>
        {feeLinks.length > 0 && (
          <div className="space-y-2 mb-3">
            {feeLinks.map(link => {
              const tpl = allTemplates.find(t => t.id === link.templateId)
              const defaultAmt = tpl?.defaultAmount != null ? String(tpl.defaultAmount) : ''
              const defaultCur = tpl?.defaultCurrency ?? costCurrency
              return (
                <div key={link.templateId} className="bg-stone-800/60 rounded-lg px-3 py-2 flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm text-stone-200">{link.name}</span>
                      <button
                        type="button"
                        onClick={() => setFeeLinks(prev => prev.filter(f => f.templateId !== link.templateId))}
                        className="text-stone-600 hover:text-red-400 text-xs transition-colors flex-shrink-0"
                      >✕ Remove</button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number" step="0.01" min="0"
                        value={link.customAmount}
                        onChange={e => setFeeLinks(prev => prev.map(f => f.templateId === link.templateId ? { ...f, customAmount: e.target.value } : f))}
                        placeholder={defaultAmt || 'amount'}
                        className="w-28 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100 focus:outline-none focus:border-amber-400"
                      />
                      <input
                        type="text"
                        value={link.customCurrency}
                        onChange={e => setFeeLinks(prev => prev.map(f => f.templateId === link.templateId ? { ...f, customCurrency: e.target.value.toUpperCase() } : f))}
                        placeholder={defaultCur}
                        maxLength={3}
                        className="w-14 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100 uppercase focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Available (unlinked) templates */}
        {allTemplates.filter(t => !feeLinks.find(f => f.templateId === t.id)).length > 0 && (
          <div>
            <p className="text-xs text-stone-600 mb-1.5">Add from your templates:</p>
            <div className="flex flex-wrap gap-2">
              {allTemplates
                .filter(t => !feeLinks.find(f => f.templateId === t.id))
                .map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTemplate(t)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full border border-stone-700 text-stone-400 text-xs hover:border-amber-600 hover:text-amber-400 transition-colors"
                  >
                    <span>+</span>
                    <span>{t.name}</span>
                    {t.defaultAmount != null && (
                      <span className="text-stone-600">({t.defaultAmount} {t.defaultCurrency})</span>
                    )}
                  </button>
                ))
              }
            </div>
          </div>
        )}

        {allTemplates.length === 0 && feeLinks.length === 0 && (
          <p className="text-xs text-stone-600 italic">No fee templates defined in settings.</p>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-400 border border-stone-700 transition-colors hover:border-stone-500 hover:text-stone-200 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save costs'}
        </button>
      </div>
    </div>
  )
}

function SubscriptionOverviewPanel({
  entry,
  isExpanded,
}: {
  entry: MySubscriptionEntry
  isExpanded: boolean
}) {
  const queryClient = useQueryClient()
  const [editingCosts, setEditingCosts] = useState(false)
  const boxMonth = entry.nextBoxMonth
  const subscriptionSlug = entry.subscription.slug

  const detailQuery = useQuery<MyEntryDetail | null>({
    queryKey: ['sub-entry-detail', subscriptionSlug],
    queryFn: () => authFetch<MyEntryDetail | null>(`/subscriptions/${subscriptionSlug}/my-entry`),
    enabled: isExpanded,
  })

  const skipQuery = useQuery<ApiSkipStatus>({
    queryKey: ['skip-status', subscriptionSlug],
    queryFn: () => authFetch<ApiSkipStatus>(`/skip-policy/${subscriptionSlug}/status`),
    enabled: isExpanded,
    retry: false,
  })

  const nextBoxQuery = useQuery<PaginatedResponse<ApiSubscriptionMonth>>({
    queryKey: ['sub-next-box', subscriptionSlug, boxMonth?.year ?? null, boxMonth?.month ?? null],
    queryFn: () => {
      const bm = boxMonth!
      // untilYear/Month uses strictly-less-than, so advance by 1 month to include the target month
      const untilYear = bm.month < 12 ? bm.year : bm.year + 1
      const untilMonth = bm.month < 12 ? bm.month + 1 : 1
      return authFetch<PaginatedResponse<ApiSubscriptionMonth>>(
        `/subscriptions/${subscriptionSlug}/months?fromYear=${bm.year}&fromMonth=${bm.month}&untilYear=${untilYear}&untilMonth=${untilMonth}&all=true`,
      )
    },
    enabled: isExpanded && !!boxMonth,
  })

  const skipMutation = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      authFetch(`/skip-policy/${subscriptionSlug}/skip/${year}/${month}`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['skip-status', subscriptionSlug] }),
        queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] }),
      ])
    },
  })

  const unskipMutation = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      authFetch(`/skip-policy/${subscriptionSlug}/skip/${year}/${month}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['skip-status', subscriptionSlug] }),
        queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] }),
      ])
    },
  })

  const detail = detailQuery.data
  const detailCurrency = detail?.costCurrency ?? entry.costCurrency ?? entry.subscription.currency
  const total = detail ? getCostTotal(detail, entry.subscription.currency) : null
  const nextBoxMonth = nextBoxQuery.data?.data?.[0]
  const previewBook = nextBoxMonth?.books?.[0]?.book
  const previewAuthors = previewBook?.authors.map(author => author.name).join(', ')
  const skipStatus = skipQuery.data
  const skipLimit = `${skipStatus?.skipsInWindow ?? 0} / ${skipStatus?.maxSkips ?? '∞'} skips used`

  return (
    <div className="border-t border-stone-700/50 bg-stone-800/30 px-4 py-4">
      <div className="grid gap-4 md:grid-cols-3">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Costs</h4>
            {!editingCosts && detail && (
              <button
                type="button"
                onClick={() => setEditingCosts(true)}
                className="rounded-lg border border-stone-700 px-2.5 py-1 text-[11px] font-medium text-stone-300 transition-colors hover:border-stone-600 hover:text-stone-100"
              >
                Edit costs
              </button>
            )}
          </div>

          {editingCosts && detail ? (
            <InlineCostsEditor
              subscriptionSlug={subscriptionSlug}
              detail={detail}
              fallbackCurrency={entry.subscription.currency}
              onCancel={() => setEditingCosts(false)}
              onSaved={() => setEditingCosts(false)}
            />
          ) : detailQuery.isLoading && !detail ? (
            <OverviewLoadingBlock lines={5} />
          ) : detailQuery.error ? (
            <p className="text-sm text-red-400">Could not load costs.</p>
          ) : detail ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-400">Base price</span>
                <span className="text-stone-100">{formatMoney(detail.basePrice, detailCurrency) ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-400">Shipping</span>
                <span className="text-stone-100">{formatMoney(detail.shippingCost, detailCurrency) ?? '—'}</span>
              </div>
              {(detail.feeTemplates.filter(link => link.feeTemplate.isActive)).map(link => {
                const amount = link.customAmount ?? link.feeTemplate.defaultAmount
                const currency = link.customCurrency ?? link.feeTemplate.defaultCurrency
                return (
                  <div key={link.feeTemplate.id} className="flex items-center justify-between gap-2">
                    <span className="text-stone-400">{link.feeTemplate.name}</span>
                    <span className="text-stone-100">{formatMoney(amount, currency) ?? 'Variable'}</span>
                  </div>
                )
              })}
              {detail.feeTemplates.filter(link => link.feeTemplate.isActive).length === 0 && (
                <p className="text-sm text-stone-500">No extra fees configured.</p>
              )}
              {total && (
                <div className="flex items-center justify-between gap-2 border-t border-stone-700/60 pt-2">
                  <span className="font-medium text-stone-300">Tracked total</span>
                  <span className="font-semibold text-amber-300">{formatMoney(total.amount, total.currency)}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-stone-500">No cost details yet.</p>
          )}
        </section>

        <section className="space-y-3">
          <h4 className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Skips</h4>

          {skipQuery.isLoading && !skipStatus ? (
            <OverviewLoadingBlock lines={5} />
          ) : skipQuery.error ? (
            <p className="text-sm text-red-400">Could not load skip status.</p>
          ) : skipStatus?.policyType === 'NONE' ? (
            <p className="text-sm text-stone-500">This subscription doesn't offer skipping.</p>
          ) : skipStatus ? (
            <div className="space-y-3">
              <span className="inline-flex rounded-full border border-stone-700 bg-stone-900/70 px-2.5 py-1 text-xs font-medium text-stone-200">
                {skipLimit}
              </span>

              {!skipStatus.canSkip && skipStatus.isPastDeadline && (
                <p className="text-xs text-amber-400">Skip deadline has already passed for the next eligible box.</p>
              )}

              {skipStatus.warnings.length > 0 && (
                <div className="space-y-1">
                  {skipStatus.warnings.map(warning => (
                    <p key={warning} className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                      {warning}
                    </p>
                  ))}
                </div>
              )}

              {skipStatus.canSkip && skipStatus.targetMonth && (
                <div className="rounded-lg border border-stone-700/60 bg-stone-900/60 p-3">
                  <p className="text-xs text-stone-500">Next eligible month</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-stone-100">
                      {formatMonthLabel(skipStatus.targetMonth.year, skipStatus.targetMonth.month)}
                    </span>
                    <button
                      type="button"
                      onClick={() => skipMutation.mutate(skipStatus.targetMonth!)}
                      disabled={skipMutation.isPending}
                      className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
                    >
                      {skipMutation.isPending ? 'Skipping…' : 'Skip'}
                    </button>
                  </div>
                </div>
              )}

              {skipMutation.error && (
                <p className="text-xs text-red-400">{(skipMutation.error as Error).message}</p>
              )}

              {skipStatus.skippedMonths.length > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-stone-500">{skipStatus.skippedMonths.length} skipped month{skipStatus.skippedMonths.length !== 1 ? 's' : ''}</p>
                  <Link href={`/my-subscriptions/skipped-months?sub=${subscriptionSlug}`} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">View all →</Link>
                </div>
              )}

              {skipStatus.allowUnskip && skipStatus.skippedMonths.length > 0 && (() => {
                const nextBox = entry.nextBoxMonth
                const unskippable = skipStatus.skippedMonths
                  .filter(m => !nextBox || m.year > nextBox.year || (m.year === nextBox.year && m.month >= nextBox.month))
                  .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
                return unskippable.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-stone-500">Unskip upcoming</p>
                    <div className="flex flex-wrap gap-2">
                      {unskippable.map(month => (
                        <button
                          key={`${month.year}-${month.month}`}
                          type="button"
                          onClick={() => unskipMutation.mutate(month)}
                          disabled={unskipMutation.isPending}
                          className="rounded-lg border border-stone-700 px-2.5 py-1 text-xs text-stone-300 transition-colors hover:border-stone-600 hover:text-stone-100 disabled:opacity-50"
                        >
                          Unskip {formatMonthLabel(month.year, month.month)}
                        </button>
                      ))}
                    </div>
                    {unskipMutation.error && (
                      <p className="text-xs text-red-400">{(unskipMutation.error as Error).message}</p>
                    )}
                  </div>
                ) : null
              })()}
            </div>
          ) : (
            <p className="text-sm text-stone-500">No skip details yet.</p>
          )}
        </section>

        <section className="space-y-3">
          <h4 className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Next Box</h4>

          {boxMonth && nextBoxQuery.isLoading ? (
            <OverviewLoadingBlock lines={4} />
          ) : !entry.nextRenewalDate ? (
            <p className="text-sm text-stone-500">No upcoming renewal scheduled yet.</p>
          ) : nextBoxQuery.error ? (
            <p className="text-sm text-red-400">Could not load the next box preview.</p>
          ) : (
            <div className="space-y-2">
              <div>
                <p className="text-xs text-stone-500">Renews on</p>
                <p className="text-sm font-medium text-stone-100">{formatDate(entry.nextRenewalDate)}</p>
              </div>

              {boxMonth && (
                <p className="text-xs text-stone-500">Box month: {formatMonthLabel(boxMonth.year, boxMonth.month)}</p>
              )}

              {previewBook ? (
                <div className="rounded-lg border border-stone-700/60 bg-stone-900/60 p-3">
                  <p className="text-sm font-medium text-stone-100">{previewBook.title}</p>
                  {previewAuthors && <p className="mt-1 text-xs text-stone-400">{previewAuthors}</p>}
                  {nextBoxMonth && nextBoxMonth.books.length > 1 && (
                    <p className="mt-2 text-[11px] text-stone-500">+{nextBoxMonth.books.length - 1} more book{nextBoxMonth.books.length > 2 ? 's' : ''}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-stone-500">Preview for this box has not been added yet.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default function MySubscriptionsPage() {
  const [{ viewMode, tab }, setPrefs] = useState(() => loadPrefs())
  const [showForwardingOnly, setShowForwardingOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

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
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredActiveEntries = useMemo(() => {
    const source = showForwardingOnly
      ? activeEntries.filter(entry => entry.isForwarding)
      : activeEntries

    if (!normalizedSearch) return source
    return source.filter(entry => matchesSubscriptionSearch(entry, normalizedSearch))
  }, [activeEntries, normalizedSearch, showForwardingOnly])

  const filteredCancelledEntries = useMemo(() => {
    if (!normalizedSearch) return cancelledEntries
    return cancelledEntries.filter(entry => matchesSubscriptionSearch(entry, normalizedSearch))
  }, [cancelledEntries, normalizedSearch])

  if (loadingActive) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="animate-pulse text-stone-500">Loading subscriptions…</span>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header: title + view toggle */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-serif text-stone-100">My Subscriptions</h1>
        <div className="flex overflow-hidden rounded-lg border border-stone-700 shrink-0">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-900 text-stone-500 hover:text-stone-300'}`}
            aria-label="List view"
          >
            <List size={15} />
          </button>
          <button
            type="button"
            onClick={() => setView('grid')}
            className={`border-l border-stone-700 px-2.5 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-900 text-stone-500 hover:text-stone-300'}`}
            aria-label="Grid view"
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {/* Search + forwarding filter */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder="Search subscriptions…"
          className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
        />
        {tab === 'active' && (
          <button
            type="button"
            onClick={() => setShowForwardingOnly(prev => !prev)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              showForwardingOnly
                ? 'border-blue-700/60 bg-blue-500/10 text-blue-300'
                : 'border-stone-700 bg-stone-900 text-stone-400 hover:text-stone-200'
            }`}
          >
            📦
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-stone-800">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'active'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-stone-500 hover:text-stone-300'
          }`}
        >
          Active
          {activeEntries.length > 0 && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tab === 'active' ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-800 text-stone-500'}`}>
              {activeEntries.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleCancelledTab}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'cancelled'
              ? 'border-stone-400 text-stone-300'
              : 'border-transparent text-stone-500 hover:text-stone-300'
          }`}
        >
          Cancelled
          {cancelledEnabled && cancelledCount > 0 && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tab === 'cancelled' ? 'bg-stone-700 text-stone-400' : 'bg-stone-800 text-stone-500'}`}>
              {cancelledCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'active' && (
        filteredActiveEntries.length === 0 ? (
          <div className="py-16 text-center text-stone-500">
            {normalizedSearch ? (
              <p>No subscriptions match “{searchTerm.trim()}”.</p>
            ) : showForwardingOnly ? (
              <p>No forwarding subscriptions found.</p>
            ) : (
              <>
                <p className="mb-3">You haven't joined any subscriptions yet.</p>
                <Link href="/subscriptions" className="text-sm text-amber-400 underline">
                  Browse subscriptions →
                </Link>
              </>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-3">
            {filteredActiveEntries.map(entry => <SubscriptionCard key={entry.id} entry={entry} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {filteredActiveEntries.map(entry => <SubscriptionTile key={entry.id} entry={entry} />)}
          </div>
        )
      )}

      {tab === 'cancelled' && (
        loadingCancelled ? (
          <div className="flex items-center justify-center py-16">
            <span className="animate-pulse text-stone-500">Loading history…</span>
          </div>
        ) : filteredCancelledEntries.length === 0 ? (
          <div className="py-16 text-center text-stone-500">
            {normalizedSearch ? 'No cancelled subscriptions match your search.' : 'No cancelled subscriptions.'}
          </div>
        ) : (() => {
          const groups = filteredCancelledEntries.reduce<Record<string, { sub: MySubscriptionEntry['subscription']; entries: MySubscriptionEntry[] }>>((acc, entry) => {
            const slug = entry.subscription.slug
            if (!acc[slug]) acc[slug] = { sub: entry.subscription, entries: [] }
            acc[slug].entries.push(entry)
            return acc
          }, {})
          const groupList = Object.values(groups)

          if (viewMode === 'grid') {
            const allEntries = groupList.flatMap(({ entries }) =>
              [...entries].sort((a, b) => {
                const aDate = a.cancellationDate ?? a.startDate ?? ''
                const bDate = b.cancellationDate ?? b.startDate ?? ''
                return bDate.localeCompare(aDate)
              }),
            )
            return (
              <div className="grid grid-cols-1 gap-4 opacity-75 sm:grid-cols-2 md:grid-cols-3">
                {allEntries.map(entry => <SubscriptionTile key={entry.id} entry={entry} />)}
              </div>
            )
          }

          return (
            <div className="space-y-4 opacity-75">
              {groupList.map(({ sub, entries }) => (
                <CancelledSubscriptionGroup key={sub.slug} sub={sub} entries={entries} viewMode={viewMode} />
              ))}
            </div>
          )
        })()
      )}
    </div>
  )
}

function CancelledSubscriptionGroup({
  sub,
  entries,
  viewMode,
}: {
  sub: MySubscriptionEntry['subscription']
  entries: MySubscriptionEntry[]
  viewMode: 'list' | 'grid'
}) {
  const getBrandColors = useBrandColors()
  const brandColors = getBrandColors(sub.company.slug) ?? sub.company.brandColors
  const sortedEntries = [...entries].sort((a, b) => {
    const aDate = a.cancellationDate ?? a.startDate ?? ''
    const bDate = b.cancellationDate ?? b.startDate ?? ''
    return bDate.localeCompare(aDate)
  })

  if (viewMode === 'grid') {
    return (
      <div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {sortedEntries.map(entry => <SubscriptionTile key={entry.id} entry={entry} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-800 bg-stone-900">
      <div className="flex items-center gap-3 border-b border-stone-800/60 px-4 py-3">
        <Link href={`/subscriptions/${sub.slug}`} className="group flex min-w-0 flex-1 items-center gap-3">
          <SubListThumbnail imageSource={sub.logoUrl ?? sub.coverImage} brandColors={brandColors} name={sub.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-stone-500">{sub.company.name}</p>
            <p className="truncate font-semibold text-stone-200 transition-colors group-hover:text-amber-400">{sub.name}</p>
          </div>
        </Link>
        {sub.isDiscontinued && (
          <span className="shrink-0 rounded border border-amber-700/40 px-1.5 py-0.5 text-xs text-amber-600">Discontinued</span>
        )}
        <span className="shrink-0 rounded-full bg-stone-800 px-2 py-0.5 text-xs text-stone-500">
          {sortedEntries.length} period{sortedEntries.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="divide-y divide-stone-800/50">
        {sortedEntries.map(entry => (
          <CancelledPeriodRow key={entry.id} entry={entry} subSlug={sub.slug} />
        ))}
      </div>
    </div>
  )
}

function CancelledPeriodRow({ entry, subSlug }: { entry: MySubscriptionEntry; subSlug: string }) {
  const qc = useQueryClient()
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(true)
  const [removeSoldBooks, setRemoveSoldBooks] = useState(true)
  const [removeSpending, setRemoveSpending] = useState(true)

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${subSlug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({ removeBooks, removeSoldBooks, removeSpending, historyId: entry.id }),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-subscriptions'] })
      void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] })
      setShowRemoveConfirm(false)
    },
  })

  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-stone-800/20">
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
          {entry.startDate && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Since</p>
              <p className="text-sm text-stone-300">{formatDate(entry.startDate)}</p>
            </div>
          )}
          {entry.cancellationDate && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Cancelled</p>
              <p className="text-sm text-stone-400">{formatDate(entry.cancellationDate)}</p>
            </div>
          )}
          {entry.cancellationReason && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Reason</p>
              <p className="text-sm italic text-stone-500">{entry.cancellationReason}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          title="Remove this period"
          onClick={() => setShowRemoveConfirm(true)}
          className="shrink-0 rounded p-1.5 text-stone-600 transition-colors hover:bg-stone-800 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {showRemoveConfirm && typeof document !== 'undefined' && createPortal(
        <EntryRemoveDialog
          entry={entry}
          subName={entry.subscription.name}
          removeBooks={removeBooks}
          setRemoveBooks={setRemoveBooks}
          removeSoldBooks={removeSoldBooks}
          setRemoveSoldBooks={setRemoveSoldBooks}
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

function SubscriptionTile({ entry }: { entry: MySubscriptionEntry }) {
  const sub = entry.subscription
  const getBrandColors = useBrandColors()
  const brandColors = getBrandColors(sub.company.slug) ?? sub.company.brandColors
  const qc = useQueryClient()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeBooks, setRemoveBooks] = useState(true)
  const [removeSoldBooks, setRemoveSoldBooks] = useState(true)
  const [removeSpending, setRemoveSpending] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({
        removeBooks,
        removeSoldBooks,
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
  const renewalAmount = formatMoney(
    entry.nextRenewalAmount ?? entry.subscription.price,
    entry.nextRenewalCurrency ?? entry.subscription.currency,
  )

  const modals = (
    <>
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
          removeSoldBooks={removeSoldBooks}
          setRemoveSoldBooks={setRemoveSoldBooks}
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

  // Expanded: span full row, show list-like layout
  if (isExpanded && entry.active) {
    return (
      <div className="col-span-full overflow-hidden rounded-xl border border-stone-700 bg-stone-900">
        <div className="flex">
          {/* Only photo navigates */}
          <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="relative w-24 shrink-0 sm:w-32">
            <SubCoverImage coverUrl={coverUrl} name={sub.name} brandColors={brandColors} aspectClass="aspect-[4/3]" />
          </Link>

          {/* Clickable text area collapses overview */}
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-stone-500">{sub.company.name}</p>
                <h3 className="truncate font-semibold leading-tight text-stone-100">{sub.name}</h3>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <CheckCircle2 size={12} /> Active
                </span>
                {entry.isForwarding && (
                  <span className="rounded border border-blue-700/40 px-1.5 py-0.5 text-[10px] text-blue-400">
                    📦 Forwarding
                  </span>
                )}
                {sub.isDiscontinued && (
                  <span className="rounded border border-amber-700/40 px-1.5 py-0.5 text-xs text-amber-600">Discontinued</span>
                )}
              </div>
            </div>
            {renewalLabel && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-wider text-stone-500">Next renewal</p>
                <p className="text-sm font-medium text-stone-200">
                  {renewalLabel}
                  {renewalAmount && <span className="ml-2 text-amber-400">{renewalAmount}</span>}
                </p>
              </div>
            )}
          </button>

          {/* Right actions sidebar */}
          <div className="flex shrink-0 flex-col items-center justify-between self-stretch border-l border-stone-800 bg-stone-900/60 px-2 py-2">
            <span />
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                title="Cancel subscription"
                onClick={() => setShowCancelConfirm(true)}
                className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-amber-400"
              >
                <Ban size={15} />
              </button>
              <button
                type="button"
                title="Remove from my subscriptions"
                onClick={() => setShowRemoveConfirm(true)}
                className="rounded p-1.5 text-stone-600 transition-colors hover:bg-stone-800 hover:text-red-400"
              >
                <Trash2 size={15} />
              </button>
              <button
                type="button"
                title="Collapse overview"
                onClick={() => setIsExpanded(false)}
                className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-100"
              >
                <ChevronUp size={15} />
              </button>
            </div>
          </div>
        </div>

        <SubscriptionOverviewPanel entry={entry} isExpanded={true} />
        {modals}
      </div>
    )
  }

  // Collapsed grid tile
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-stone-800 bg-stone-900 transition-colors hover:border-stone-700">
      {/* Only photo is a link */}
      <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="relative block">
        <SubCoverImage coverUrl={coverUrl} name={sub.name} brandColors={brandColors} aspectClass="aspect-[4/3]" />
        <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1">
          {entry.active ? (
            <span className="flex items-center gap-1 rounded bg-stone-950/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 size={10} /> Active
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded bg-stone-950/80 px-1.5 py-0.5 text-[10px] font-medium text-stone-400">
              <XCircle size={10} /> Cancelled
            </span>
          )}
          {entry.isForwarding && (
            <span className="rounded border border-blue-700/40 bg-stone-950/80 px-1.5 py-0.5 text-[10px] text-blue-400">
              📦 Forwarding
            </span>
          )}
        </div>
      </Link>

      {/* Info area — click to expand */}
      <div
        role={entry.active ? 'button' : undefined}
        tabIndex={entry.active ? 0 : undefined}
        onClick={() => entry.active && setIsExpanded(true)}
        onKeyDown={e => entry.active && (e.key === 'Enter' || e.key === ' ') && setIsExpanded(true)}
        className={`flex flex-1 flex-col gap-1 p-3 ${entry.active ? 'cursor-pointer' : ''}`}
      >
        <p className="truncate text-[10px] text-stone-500">{sub.company.name}</p>
        <p className="truncate text-sm font-semibold leading-tight text-stone-100">{sub.name}</p>
        {entry.active && renewalLabel && (
          <p className="text-[10px] text-stone-400">{renewalLabel}{renewalAmount ? ` · ${renewalAmount}` : ''}</p>
        )}
        {!entry.active && (
          <div className="flex gap-3">
            {entry.startDate && <p className="text-[10px] text-stone-500">Since {formatDate(entry.startDate)}</p>}
            {entry.cancellationDate && <p className="text-[10px] text-stone-500">Cancelled {formatDate(entry.cancellationDate)}</p>}
            {entry.cancellationReason && <p className="text-[10px] italic text-stone-500">{entry.cancellationReason}</p>}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            {entry.active && (
              <button
                type="button"
                title="Cancel subscription"
                onClick={() => setShowCancelConfirm(true)}
                className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-amber-400"
              >
                <Ban size={14} />
              </button>
            )}
            <button
              type="button"
              title="Remove from my subscriptions"
              onClick={() => setShowRemoveConfirm(true)}
              className="rounded p-1.5 text-stone-600 transition-colors hover:bg-stone-800 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {entry.active && <ChevronDown size={14} className="text-stone-500 shrink-0" />}
        </div>
      </div>

      {modals}
    </div>
  )
}

function EntryRemoveDialog({
  entry,
  subName,
  removeBooks,
  setRemoveBooks,
  removeSoldBooks,
  setRemoveSoldBooks,
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
  removeSoldBooks: boolean
  setRemoveSoldBooks: (v: boolean) => void
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-stone-700 bg-stone-900 p-6" onClick={e => e.stopPropagation()}>
        <p className="font-semibold text-stone-100">Remove subscription?</p>
        <p className="text-sm text-stone-400">
          This will permanently remove <span className="text-stone-200">{subName}</span> from your subscriptions.
        </p>
        {entry.active ? (
          <p className="rounded-lg bg-stone-800 px-3 py-2 text-xs text-stone-500">
            This removes your current subscription period. Any past periods are shown in the Cancelled tab and can be removed from there.
          </p>
        ) : (
          <p className="rounded-lg bg-stone-800 px-3 py-2 text-xs text-stone-500">
            Period: <span className="text-stone-300">{periodLabel}</span>
          </p>
        )}
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={removeBooks}
              onChange={e => setRemoveBooks(e.target.checked)}
              className="rounded border-stone-600 bg-stone-800 text-amber-500"
            />
            Also remove books from my collection
          </label>
          {removeBooks && (
            <label className="flex cursor-pointer items-center gap-2 pl-5 text-sm text-stone-400">
              <input
                type="checkbox"
                checked={removeSoldBooks}
                onChange={e => setRemoveSoldBooks(e.target.checked)}
                className="rounded border-stone-600 bg-stone-800 text-amber-500"
              />
              Delete sold books and sale records
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-300">
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
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-stone-300 transition-colors hover:text-stone-100"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || !canSubmit}
            className="rounded bg-red-700 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
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
  const [removeSoldBooks, setRemoveSoldBooks] = useState(true)
  const [removeSpending, setRemoveSpending] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  const removeMutation = useMutation({
    mutationFn: () => authFetch(`/subscriptions/${sub.slug}/my-entry`, {
      method: 'DELETE',
      body: JSON.stringify({ removeBooks, removeSoldBooks, removeSpending }),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-subscriptions'] })
      void qc.invalidateQueries({ queryKey: ['spending-stats-v2'] })
      setShowRemoveConfirm(false)
    },
  })

  const renewalLabel = formatDate(entry.nextRenewalDate)
  const renewalAmount = formatMoney(
    entry.nextRenewalAmount ?? entry.subscription.price,
    entry.nextRenewalCurrency ?? entry.subscription.currency,
  )

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-stone-800 bg-stone-900 transition-colors hover:border-stone-700">
        <div className="flex">
          {/* Only thumbnail navigates to details */}
          <Link href={`/subscriptions/${sub.slug}?from=my-subscriptions`} className="shrink-0">
            <SubListThumbnail imageSource={sub.logoUrl ?? sub.coverImage} brandColors={brandColors} name={sub.name} />
          </Link>

          {/* Text area — click to toggle overview */}
          <button
            type="button"
            onClick={entry.active ? () => setIsExpanded(prev => !prev) : undefined}
            className={`flex min-w-0 flex-1 flex-col justify-center px-4 py-3 text-left ${entry.active ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-stone-500">{sub.company.name}</p>
                <h3 className="truncate font-semibold leading-tight text-stone-100">
                  {sub.name}
                </h3>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {entry.active ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                    <CheckCircle2 size={12} /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-stone-500">
                    <XCircle size={12} /> Cancelled
                  </span>
                )}
                {entry.isForwarding && (
                  <span className="rounded border border-blue-700/40 px-1.5 py-0.5 text-[10px] text-blue-400">
                    📦 Forwarding
                  </span>
                )}
                {sub.isDiscontinued && (
                  <span className="rounded border border-amber-700/40 px-1.5 py-0.5 text-xs text-amber-600">
                    Discontinued
                  </span>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {entry.active && renewalLabel && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">Next renewal</p>
                  <p className="text-sm font-medium text-stone-200">
                    {renewalLabel}
                    {renewalAmount && <span className="ml-2 text-amber-400">{renewalAmount}</span>}
                  </p>
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
                  {entry.cancellationReason && <p className="mt-0.5 text-[10px] italic text-stone-500">{entry.cancellationReason}</p>}
                </div>
              )}
            </div>
          </button>

          {/* Right sidebar: action buttons + chevron at bottom */}
          <div className="flex shrink-0 flex-col items-center justify-end self-stretch border-l border-stone-800 bg-stone-900/60 px-2 py-2">
            <div className="flex flex-col items-center gap-1">
              {entry.active && (
                <button
                  type="button"
                  title="Cancel subscription"
                  onClick={() => setShowCancelConfirm(true)}
                  className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-amber-400"
                >
                  <Ban size={15} />
                </button>
              )}
              <button
                type="button"
                title="Remove from my subscriptions"
                onClick={() => setShowRemoveConfirm(true)}
                className="rounded p-1.5 text-stone-600 transition-colors hover:bg-stone-800 hover:text-red-400"
              >
                <Trash2 size={15} />
              </button>
              {entry.active && (
                <button
                  type="button"
                  title={isExpanded ? 'Collapse overview' : 'Expand overview'}
                  aria-expanded={isExpanded}
                  onClick={() => setIsExpanded(prev => !prev)}
                  className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-100"
                >
                  {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {entry.active && isExpanded && <SubscriptionOverviewPanel entry={entry} isExpanded={isExpanded} />}
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
          removeSoldBooks={removeSoldBooks}
          setRemoveSoldBooks={setRemoveSoldBooks}
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
