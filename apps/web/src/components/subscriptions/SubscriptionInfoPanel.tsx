'use client'

import { useEffect, useState } from 'react'
import { getMySubscriptionEntry } from '@/lib/api'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiSubscriptionSeries } from '@luxgrimoire/shared-types'
import JoinSubscriptionModal from './JoinSubscriptionModal'

interface SkipPolicy {
  type: string
  maxSkips: number | null
  maxConsecutive: number | null
  windowMonths: number | null
  skipDeadlineDaysBefore: number
  notes: string | null
}

interface Props {
  subscriptionSlug: string
  price: string | null
  currency: string
  type: string | null
  shipsInternationally: boolean
  country: string | null
  skipPolicy?: SkipPolicy | null
}

type MyEntry = {
  shippingCost: string | null
  taxesAndFees: string | null
  active: boolean
  prepaidMonths: number
  renewalDay: number | null
  nextRenewalDate: string | null
} | null

function formatSkipPolicy(policy: SkipPolicy): string {
  if (policy.type === 'NONE') return 'Skipping not allowed'
  if (policy.type === 'UNLIMITED') return 'Unlimited skips allowed'
  if (policy.type === 'UNLIMITED_MAX_CONSECUTIVE') {
    return `Unlimited skips (max ${policy.maxConsecutive} consecutive)`
  }
  if (policy.type === 'CALENDAR_YEAR') {
    return `${policy.maxSkips ?? '?'} skip${(policy.maxSkips ?? 0) !== 1 ? 's' : ''} per calendar year`
  }
  if (policy.type === 'FROM_FIRST_SKIP') {
    return `${policy.maxSkips ?? '?'} skips within ${policy.windowMonths ?? '?'} months of first skip`
  }
  if (policy.type === 'FROM_SUB_START') {
    return `${policy.maxSkips ?? '?'} skips within ${policy.windowMonths ?? '?'} months of subscription start`
  }
  return policy.type
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    biannual: 'Bi-annual',
    annual: 'Annual',
  }
  return map[type.toLowerCase()] ?? type
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function getNextMonth(): { year: number; month: number; label: string } {
  const now = new Date()
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (now.getMonth() === 11) {
    return { year: now.getFullYear() + 1, month: 1, label: `Jan ${now.getFullYear() + 1}` }
  }
  const month = now.getMonth() + 2
  return { year: now.getFullYear(), month, label: `${MONTHS[month - 1]} ${now.getFullYear()}` }
}

/** Find the series that contains a specific month (year/month), if any */
function findSeriesForMonth(
  seriesList: ApiSubscriptionSeries[],
  year: number,
  month: number,
): ApiSubscriptionSeries | null {
  return seriesList.find(s =>
    s.isActive &&
    (s.months ?? []).some(m => m.year === year && m.month === month),
  ) ?? null
}

export default function SubscriptionInfoPanel({
  subscriptionSlug,
  price,
  currency,
  type,
  shipsInternationally,
  country,
  skipPolicy,
}: Props) {
  const { user } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [myEntry, setMyEntry] = useState<MyEntry>(undefined as unknown as MyEntry)
  const [loading, setLoading] = useState(false)
  const [skipState, setSkipState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [skipError, setSkipError] = useState<string | null>(null)
  const [convertedRate, setConvertedRate] = useState<number | null>(null)
  const [seriesList, setSeriesList] = useState<ApiSubscriptionSeries[]>([])
  const [showJoinModal, setShowJoinModal] = useState(false)

  const userCurrency = user?.preferredCurrency
  const showConversion = !!userCurrency && userCurrency !== currency

  useEffect(() => {
    const t = localStorage.getItem('luxgrimoire_token')
    setToken(t)
    if (t) {
      setLoading(true)
      getMySubscriptionEntry(subscriptionSlug)
        .then(setMyEntry)
        .catch(() => setMyEntry(null))
        .finally(() => setLoading(false))
    } else {
      setMyEntry(null)
    }
  }, [subscriptionSlug])

  // Fetch series when user is a subscriber
  useEffect(() => {
    if (!token) return
    authFetch<ApiSubscriptionSeries[]>(`/subscription-series?subscriptionSlug=${subscriptionSlug}`)
      .then(setSeriesList)
      .catch(() => setSeriesList([]))
  }, [subscriptionSlug, token])

  useEffect(() => {
    if (!showConversion || !price) return
    authFetch<{ rate: number }>(`/currency/rate?from=${currency}&to=${userCurrency}`)
      .then((data) => setConvertedRate(data.rate))
      .catch(() => setConvertedRate(null))
  }, [showConversion, currency, userCurrency, price])

  const isSubscriber = myEntry !== null && myEntry !== undefined && myEntry.active
  const priceNum = price ? parseFloat(price) : null
  const shipping = isSubscriber && myEntry?.shippingCost ? parseFloat(myEntry.shippingCost) : null
  const taxes = isSubscriber && myEntry?.taxesAndFees ? parseFloat(myEntry.taxesAndFees) : null
  const total = priceNum !== null && shipping !== null ? priceNum + shipping + (taxes ?? 0) : null

  /** Returns "≈ X.XX CUR" if conversion rate is known, else null */
  function converted(amount: number): string | null {
    if (!convertedRate || !userCurrency) return null
    return `≈ ${(amount * convertedRate).toFixed(2)} ${userCurrency}`
  }

  const canSkip = skipPolicy && skipPolicy.type !== 'NONE'
  const nextMonth = getNextMonth()

  // Find if next month is inside a series
  const nextMonthSeries = findSeriesForMonth(seriesList, nextMonth.year, nextMonth.month)
  const isSeriesOnly = nextMonthSeries?.skipMode === 'SERIES_ONLY'

  // Active series (for badge display — series whose date range covers current/next month)
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const now = new Date()
  const curKey = now.getFullYear() * 12 + now.getMonth() + 1
  const activeSeries = seriesList.filter(s => {
    const start = s.startYear * 12 + s.startMonth
    const end = s.endYear * 12 + s.endMonth
    return s.isActive && curKey >= start && curKey <= end
  })

  const handleSkipNextMonth = async () => {
    setSkipState('loading')
    setSkipError(null)
    try {
      if (isSeriesOnly && nextMonthSeries) {
        await authFetch(`/skip-policy/${subscriptionSlug}/series/${nextMonthSeries.slug}/skip`, {
          method: 'POST',
        })
      } else {
        await authFetch(`/skip-policy/${subscriptionSlug}/skip/${nextMonth.year}/${nextMonth.month}`, {
          method: 'POST',
        })
      }
      setSkipState('success')
      // Refresh entry so nextRenewalDate reflects the billing period shift
      getMySubscriptionEntry(subscriptionSlug)
        .then(setMyEntry)
        .catch(() => {})
    } catch (e) {
      setSkipState('error')
      setSkipError((e as Error).message ?? 'Could not skip month')
    }
  }

  return (
    <div className="space-y-4">
      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-400">
        {type && (
          <span className="flex items-center gap-1.5">
            <span className="text-stone-500">📦</span>
            <span>{formatType(type)}</span>
          </span>
        )}
        {country && (
          <span className="flex items-center gap-1.5">
            <span className="text-stone-500">📍</span>
            <span>{country}</span>
          </span>
        )}
        {shipsInternationally && (
          <span className="flex items-center gap-1.5">
            <span className="text-stone-500">✈️</span>
            <span>Ships internationally</span>
          </span>
        )}
      </div>

      {/* Active series badges */}
      {activeSeries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeSeries.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 bg-purple-500/15 border border-purple-500/30 rounded-full px-3 py-1">
              <span className="text-xs text-purple-300 font-medium">📚 {s.name}</span>
              <span className="text-xs text-purple-500">
                {MONTHS_SHORT[s.startMonth - 1]} {s.startYear}–{MONTHS_SHORT[s.endMonth - 1]} {s.endYear}
              </span>
              {s.skipMode === 'SERIES_ONLY' && (
                <span className="text-[10px] text-purple-600/80 ml-0.5">series skip</span>
              )}
              {!s.canCancelDuring && (
                <span className="text-[10px] text-amber-600/70 ml-0.5">no cancel</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Skip policy */}
      {skipPolicy && skipPolicy.type !== 'NONE' && (
        <div className="text-sm text-stone-400">
          <span className="text-stone-500 mr-1.5">⏭️</span>
          {skipPolicy.notes ?? formatSkipPolicy(skipPolicy)}
          {skipPolicy.skipDeadlineDaysBefore > 0 && (
            <span className="ml-1 text-stone-500">
              (deadline: {skipPolicy.skipDeadlineDaysBefore}d before renewal)
            </span>
          )}
        </div>
      )}
      {skipPolicy && skipPolicy.type === 'NONE' && (
        <div className="text-sm text-stone-500">
          <span className="mr-1.5">⏭️</span>
          Skipping not allowed
        </div>
      )}

      {/* Price panel */}
      {price && (
        <div className="rounded-xl border border-stone-700/60 bg-stone-900/60 p-4 space-y-2">
          {loading ? (
            <div className="text-stone-500 text-sm">Loading price info…</div>
          ) : isSubscriber ? (
            /* Subscriber breakdown */
            <>
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Your subscription cost</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-stone-400">Box</span>
                  <span className="text-right">
                    <span className="text-stone-100 font-medium">{priceNum?.toFixed(2)} {currency}</span>
                    {priceNum !== null && converted(priceNum) && (
                      <span className="block text-xs text-stone-500">{converted(priceNum)}</span>
                    )}
                  </span>
                </div>
                {shipping !== null && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-stone-400">Shipping</span>
                    <span className="text-right">
                      <span className="text-stone-100">{shipping.toFixed(2)} {currency}</span>
                      {converted(shipping) && (
                        <span className="block text-xs text-stone-500">{converted(shipping)}</span>
                      )}
                    </span>
                  </div>
                )}
                {taxes !== null && taxes > 0 && (
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-stone-400">Taxes & fees</span>
                    <span className="text-right">
                      <span className="text-stone-100">{taxes.toFixed(2)} {currency}</span>
                      {converted(taxes) && (
                        <span className="block text-xs text-stone-500">{converted(taxes)}</span>
                      )}
                    </span>
                  </div>
                )}
                {total !== null && (
                  <div className="flex justify-between items-baseline gap-2 pt-2 border-t border-stone-700/60">
                    <span className="text-stone-300 font-medium">Total / month</span>
                    <span className="text-right">
                      <span className="text-stone-100 font-semibold">{total.toFixed(2)} {currency}</span>
                      {converted(total) && (
                        <span className="block text-xs text-stone-400 font-medium">{converted(total)}</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Renewal info */}
              <div className="pt-3 border-t border-stone-700/60 space-y-1.5">
                {myEntry?.nextRenewalDate ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-stone-500">🔄</span>
                    <span className="text-stone-400">Next renewal:</span>
                    <span className="text-stone-100 font-medium">
                      {new Date(myEntry.nextRenewalDate).toLocaleDateString(undefined, {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>
                ) : myEntry?.renewalDay ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-stone-500">🔄</span>
                    <span className="text-stone-400">Renews on the</span>
                    <span className="text-stone-100 font-medium">{ordinal(myEntry.renewalDay)}</span>
                    <span className="text-stone-400">of each month</span>
                  </div>
                ) : null}

                {/* Skip button — series-aware */}
                {canSkip && (
                  <div className="pt-1">
                    {skipState === 'success' ? (
                      <p className="text-xs text-emerald-400 font-medium">
                        ✓ {isSeriesOnly && nextMonthSeries ? `"${nextMonthSeries.name}" series skipped` : `${nextMonth.label} skipped`}
                      </p>
                    ) : (
                      <>
                        {isSeriesOnly && nextMonthSeries ? (
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => void handleSkipNextMonth()}
                              disabled={skipState === 'loading'}
                              className="text-xs px-3 py-1.5 rounded-lg border border-purple-500/40 text-purple-300 hover:border-purple-400/70 hover:text-purple-200 disabled:opacity-50 transition-colors"
                            >
                              {skipState === 'loading' ? 'Skipping…' : `⏭ Skip series: "${nextMonthSeries.name}"`}
                            </button>
                            <p className="text-[10px] text-stone-600">
                              Skips all {nextMonthSeries._count?.months ?? nextMonthSeries.months?.length ?? ''} months of this series
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleSkipNextMonth()}
                            disabled={skipState === 'loading'}
                            className="text-xs px-3 py-1.5 rounded-lg border border-stone-600 text-stone-300 hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-50 transition-colors"
                          >
                            {skipState === 'loading' ? 'Skipping…' : `Skip ${nextMonth.label}`}
                            {nextMonthSeries && <span className="ml-1 text-stone-500 text-[10px]">({nextMonthSeries.name})</span>}
                          </button>
                        )}
                        {skipState === 'error' && skipError && (
                          <p className="text-xs text-red-400 mt-1">{skipError}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : token ? (
            /* Logged in, not subscriber */
            <>
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Base price</p>
              <p className="text-2xl font-serif font-semibold text-stone-100">
                {parseFloat(price).toFixed(2)} <span className="text-base font-normal text-stone-400">{currency}/mo</span>
              </p>
              {convertedRate && userCurrency && (
                <p className="text-sm text-stone-500 mt-0.5">
                  ≈ {(parseFloat(price) * convertedRate).toFixed(2)} {userCurrency}/mo
                </p>
              )}
              <p className="text-xs text-stone-500 mt-1">+ shipping & applicable taxes</p>
            </>
          ) : (
            /* Not logged in */
            <>
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Starting from</p>
              <p className="text-2xl font-serif font-semibold text-stone-100">
                {parseFloat(price).toFixed(2)} <span className="text-base font-normal text-stone-400">{currency}/mo</span>
              </p>
              <p className="text-xs text-stone-500 mt-1">+ shipping & applicable taxes</p>
            </>
          )}
        </div>
      )}

      {/* Add to my subscriptions button */}
      {token && !isSubscriber && myEntry !== undefined && (
        <button
          type="button"
          onClick={() => setShowJoinModal(true)}
          className="w-full py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors"
        >
          + Add to my subscriptions
        </button>
      )}
      {!token && (
        <button
          type="button"
          disabled
          className="w-full py-2.5 px-4 rounded-lg border border-stone-600/60 text-stone-400 text-sm font-medium cursor-not-allowed opacity-60"
          title="Log in to subscribe"
        >
          + Add to my subscriptions
        </button>
      )}

      {showJoinModal && (
        <JoinSubscriptionModal
          subscriptionSlug={subscriptionSlug}
          subscriptionCurrency={currency}
          onJoined={() => {
            setShowJoinModal(false)
            setLoading(true)
            getMySubscriptionEntry(subscriptionSlug)
              .then(setMyEntry)
              .catch(() => setMyEntry(null))
              .finally(() => setLoading(false))
          }}
          onClose={() => setShowJoinModal(false)}
        />
      )}
    </div>
  )
}
