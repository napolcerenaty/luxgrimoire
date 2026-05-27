'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMySubscriptionEntry, getFeeTemplates, updateMyEntryCosts, cancelMySubscriptionEntry, getCountryFeeHints } from '@/lib/api'
import type { CountryFeeHint } from '@/lib/api'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import type { ApiSubscriptionSeries, ApiFeeTemplate, ApiSubscriptionMonth } from '@luxgrimoire/shared-types'
import JoinSubscriptionModal from './JoinSubscriptionModal'
import { CancelSubscriptionModal } from './CancelSubscriptionModal'
import { parseDecimalInput } from '@/lib/parseDecimalInput'
import SkipStatusPanel from '@/components/SkipStatusPanel'
import { useModalState } from '@/hooks/useModalState'

import { formatInterval } from '@/lib/formatInterval'

interface Props {
  subscriptionSlug: string
  name: string
  price: string | null
  originalBasePrice?: string | null
  currency: string
  intervalMonths: number
  shipsInternationally: boolean
  country: string | null
  renewalDay?: number | null
  months: ApiSubscriptionMonth[]
  prepayOptions?: { id: string; months: number; price: number | string; currency: string; label: string | null; validFrom?: string | null; validUntil?: string | null }[]
}

type FeeTemplateLink = {
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

type MyEntry = {
  shippingCost: string | null
  basePrice: string | null
  costCurrency: string | null
  active: boolean
  prepaidMonths: number
  renewalDay: number | null
  nextRenewalDate: string | null
  nextRenewalAmount: string | null
  nextRenewalCurrency: string | null
  nextRenewalPriceChanged: boolean
  nextRenewalNewPrice: string | null
  cancellationDate: string | null
  cancellationReason: string | null
  scheduledPrepayOptionId: string | null
  feeTemplates: FeeTemplateLink[]
} | null

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function nextRenewalFromDay(renewalDay: number, skippedMonths: { year: number; month: number }[] = []): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  let candidate = new Date(year, month, renewalDay)
  if (candidate <= today) {
    candidate = new Date(year, month + 1, renewalDay)
  }
  // Advance past skipped months
  while (skippedMonths.some((s) => s.year === candidate.getFullYear() && s.month === candidate.getMonth() + 1)) {
    candidate = new Date(candidate.getFullYear(), candidate.getMonth() + 1, renewalDay)
  }
  return candidate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatFeeCategory(cat: string): string {
  const labels: Record<string, string> = {
    VAT: 'VAT', CUSTOMS: 'Customs duty', SHIPPING: 'Extra shipping',
    PROCESSING: 'Processing fee', FORWARDING: 'Forwarding fee', OTHER: 'Other fee',
  }
  return labels[cat] ?? cat
}

export default function SubscriptionInfoPanel({
  subscriptionSlug,
  name,
  price,
  originalBasePrice,
  currency,
  intervalMonths,
  shipsInternationally,
  country,
  renewalDay,
  months,
  prepayOptions,
}: Props) {
  const { user } = useAuth()
  const userCurrency = user?.preferredCurrency
  const [myEntry, setMyEntry] = useState<MyEntry>(undefined as unknown as MyEntry)
  const [loading, setLoading] = useState(false)
  const [convertedRate, setConvertedRate] = useState<number | null>(null)
  // rates to convert each fee template currency → entryCurrency
  const [feeRates, setFeeRates] = useState<Record<string, number>>({})
  const [seriesList, setSeriesList] = useState<ApiSubscriptionSeries[]>([])
  const { isOpen: showJoinModal, open: openJoinModal, close: closeJoinModal } = useModalState()
  const { isOpen: showEditCosts, open: openEditCosts, close: closeEditCosts } = useModalState()
  const { isOpen: showCancelModal, open: openCancelModal, close: closeCancelModal } = useModalState()
  const [countryFeeHints, setCountryFeeHints] = useState<CountryFeeHint[]>([])
  const [allPriceChanges, setAllPriceChanges] = useState<Array<{ effectiveYear: number; effectiveMonth: number; newBasePrice: string; currency: string }>>([])

  useEffect(() => {
    authFetch<Array<{ effectiveYear: number; effectiveMonth: number; newBasePrice: string; currency: string }>>(`/subscriptions/${subscriptionSlug}/price-changes`)
      .then(data => {
        if (!Array.isArray(data)) return
        setAllPriceChanges(data)
      })
      .catch(() => {})
  }, [subscriptionSlug])

  const now = new Date()
  const curKey = now.getFullYear() * 100 + (now.getMonth() + 1)
  const futurePriceChanges = allPriceChanges.filter(pc => pc.effectiveYear * 100 + pc.effectiveMonth > curKey)

  // Compute effective current price for user's preferred currency (if official records exist)
  const preferredCurrencyPrice: string | null = (() => {
    if (!userCurrency) return null
    const matching = allPriceChanges.filter(pc => pc.currency === userCurrency)
    if (matching.length === 0) return null
    const nowYear = now.getFullYear(); const nowMonth = now.getMonth() + 1
    const applicable = [...matching]
      .filter(pc => pc.effectiveYear < nowYear || (pc.effectiveYear === nowYear && pc.effectiveMonth <= nowMonth))
      .sort((a, b) => b.effectiveYear !== a.effectiveYear ? b.effectiveYear - a.effectiveYear : b.effectiveMonth - a.effectiveMonth)
    return applicable.length > 0 ? applicable[0].newBasePrice : null
  })()

  const { data: skipStatus } = useQuery({
    queryKey: ['skip-status', subscriptionSlug],
    queryFn: () => authFetch<{ skippedMonths: { year: number; month: number }[] }>(`/skip-policy/${subscriptionSlug}/status`),
    enabled: !!user,
    retry: false,
  })

  useEffect(() => {
    if (user) {
      setLoading(true)
      getMySubscriptionEntry(subscriptionSlug)
        .then(setMyEntry)
        .catch(() => setMyEntry(null))
        .finally(() => setLoading(false))
    } else {
      setMyEntry(null)
    }
  }, [subscriptionSlug, user])

  // Fetch series when user is a subscriber
  useEffect(() => {
    if (!user) return
    authFetch<ApiSubscriptionSeries[]>(`/subscription-series?subscriptionSlug=${subscriptionSlug}`)
      .then(setSeriesList)
      .catch(() => setSeriesList([]))
  }, [subscriptionSlug, user])

  // Fetch conversion rates for fee template currencies that differ from entryCurrency
  useEffect(() => {
    if (!myEntry?.feeTemplates?.length) return
    const ec = myEntry.costCurrency ?? currency
    const uniqueCurs = [...new Set(
      myEntry.feeTemplates
        .filter(f => f.feeTemplate.isActive)
        .map(f => f.customCurrency ?? f.feeTemplate.defaultCurrency)
        .filter((c): c is string => !!c && c !== ec)
    )]
    if (!uniqueCurs.length) return
    Promise.all(
      uniqueCurs.map(c =>
        authFetch<{ rate: number }>(`/currency/rate?from=${c}&to=${ec}`)
          .then(data => [c, data.rate] as [string, number])
          .catch(() => [c, null] as [string, null])
      )
    ).then(results => {
      const rates: Record<string, number> = {}
      results.forEach(([c, r]) => { if (r !== null) rates[c] = r })
      setFeeRates(rates)
    })
  }, [myEntry?.feeTemplates, myEntry?.costCurrency, currency])

  const isSubscriber = myEntry !== null && myEntry !== undefined && myEntry.active
  const entryCurrency = myEntry?.costCurrency ?? currency
  // Only show conversion when user's preferred currency differs from their entry's cost currency
  const showConversion = !!userCurrency && userCurrency !== entryCurrency

  useEffect(() => {
    if (!showConversion || !price) {
      setConvertedRate(null)
      return
    }
    authFetch<{ rate: number }>(`/currency/rate?from=${entryCurrency}&to=${userCurrency}`)
      .then((data) => setConvertedRate(data.rate))
      .catch(() => setConvertedRate(null))
  }, [showConversion, entryCurrency, userCurrency, price])

  useEffect(() => {
    if (!user || !user?.shippingCountry) return
    getCountryFeeHints(subscriptionSlug, user.shippingCountry)
      .then(setCountryFeeHints)
      .catch(() => {})
  }, [user, subscriptionSlug, user?.shippingCountry])
  const priceNum = isSubscriber && myEntry?.basePrice ? parseFloat(myEntry.basePrice) : (price ? parseFloat(price) : null)
  const shipping = isSubscriber && myEntry?.shippingCost ? parseFloat(myEntry.shippingCost) : null
  const feeTotal = isSubscriber
    ? (myEntry?.feeTemplates ?? [])
        .filter(f => f.feeTemplate.isActive)
        .reduce((sum, link) => {
          const amt = link.customAmount ?? link.feeTemplate.defaultAmount
          if (amt == null) return sum
          const feeCur = link.customCurrency ?? link.feeTemplate.defaultCurrency
          const amtNum = parseFloat(amt)
          if (feeCur === entryCurrency) return sum + amtNum
          const rate = feeRates[feeCur ?? '']
          return rate ? sum + amtNum * rate : sum
        }, 0)
    : 0
  const total = priceNum !== null && shipping !== null ? priceNum + shipping + feeTotal : null

  function refreshEntry() {
    setLoading(true)
    getMySubscriptionEntry(subscriptionSlug)
      .then(setMyEntry)
      .catch(() => setMyEntry(null))
      .finally(() => setLoading(false))
  }

  /** Returns "≈ X.XX CUR" if conversion rate is known, else null */
  function converted(amount: number): string | null {
    if (!convertedRate || !userCurrency) return null
    return `≈ ${(amount * convertedRate).toFixed(2)} ${userCurrency}`
  }

  // Active series (for badge display — series whose date range covers current/next month)
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const nowForSeries = new Date()
  const seriesCurKey = nowForSeries.getFullYear() * 12 + nowForSeries.getMonth() + 1
  const activeSeries = seriesList.filter(s => {
    const start = s.startYear * 12 + s.startMonth
    const end = s.endYear * 12 + s.endMonth
    return s.isActive && seriesCurKey >= start && seriesCurKey <= end
  })

  // Subscriber cost panel JSX (reused in 2-col layout)
  const costPanel = price ? (
    <div className="rounded-xl border border-stone-700/60 bg-stone-900/60 p-4 space-y-2">
      {loading ? (
        <div className="text-stone-500 text-sm">Loading price info…</div>
      ) : isSubscriber ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-stone-500 uppercase tracking-wider">Your subscription cost</p>
            <button
              type="button"
              onClick={() => openEditCosts()}
              className="text-xs text-amber-500 hover:text-amber-400 transition-colors"
            >
              ✏️ Edit costs
            </button>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-stone-400">Box</span>
              <span className="text-right">
                <span className="text-stone-100 font-medium">{priceNum?.toFixed(2)} {entryCurrency}</span>
                {priceNum !== null && converted(priceNum) && (
                  <span className="block text-xs text-stone-500">{converted(priceNum)}</span>
                )}
              </span>
            </div>
            {shipping !== null && (
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-stone-400">Shipping</span>
                <span className="text-right">
                  <span className="text-stone-100">{shipping.toFixed(2)} {entryCurrency}</span>
                  {converted(shipping) && (
                    <span className="block text-xs text-stone-500">{converted(shipping)}</span>
                  )}
                </span>
              </div>
            )}
            {(myEntry?.feeTemplates ?? []).filter(f => f.feeTemplate.isActive).map((link, i) => {
              const amt = link.customAmount ?? link.feeTemplate.defaultAmount
              const feeCur = link.customCurrency ?? link.feeTemplate.defaultCurrency
              const amtNum = amt != null ? parseFloat(amt) : null
              // amount in entryCurrency (for display when feeCur differs)
              const amtInEntry = amtNum != null && feeCur !== entryCurrency && feeRates[feeCur ?? '']
                ? amtNum * feeRates[feeCur!]
                : null
              // amount in userCurrency
              const feeToUserRate = feeCur === entryCurrency
                ? convertedRate
                : (amtInEntry != null ? convertedRate : null)
              return (
                <div key={i} className="flex justify-between items-baseline gap-2">
                  <span className="text-stone-500 text-xs">{link.feeTemplate.name}</span>
                  <span className="text-right text-xs text-stone-400">
                    {amtNum != null
                      ? <>
                          {amtNum.toFixed(2)} {feeCur}
                          {amtInEntry != null && (
                            <span className="block text-stone-500">≈ {amtInEntry.toFixed(2)} {entryCurrency}</span>
                          )}
                          {feeToUserRate && userCurrency && userCurrency !== feeCur && (
                            <span className="block text-stone-500">
                              ≈ {((amtInEntry ?? amtNum) * feeToUserRate).toFixed(2)} {userCurrency}
                            </span>
                          )}
                        </>
                      : <span className="italic text-stone-600">variable</span>
                    }
                  </span>
                </div>
              )
            })}
            {total !== null && (
              <div className="flex justify-between items-baseline gap-2 pt-2 border-t border-stone-700/60">
                <span className="text-stone-300 font-medium">Total / month</span>
                <span className="text-right">
                  <span className="text-stone-100 font-semibold">{total.toFixed(2)} {entryCurrency}</span>
                  {converted(total) && (
                    <span className="block text-xs text-stone-400 font-medium">{converted(total)}</span>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="pt-3 border-t border-stone-700/60 space-y-1.5">
            {myEntry?.nextRenewalDate ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-stone-500">🔄</span>
                <span className="text-stone-400">Renews on</span>
                <span className="text-stone-100 font-medium">
                  {new Date(myEntry.nextRenewalDate).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
            ) : myEntry?.renewalDay ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-stone-500">🔄</span>
                <span className="text-stone-400">Renews on</span>
                <span className="text-stone-100 font-medium">{nextRenewalFromDay(myEntry.renewalDay, skipStatus?.skippedMonths)}</span>
              </div>
            ) : null}
            {myEntry?.nextRenewalPriceChanged && myEntry.nextRenewalNewPrice && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-amber-400">⚠️</span>
                <span className="text-amber-300 font-medium">
                  Price changes to {myEntry.nextRenewalNewPrice} {myEntry.nextRenewalCurrency ?? entryCurrency} from next renewal
                </span>
              </div>
            )}
          </div>
          {(prepayOptions?.length ?? 0) > 0 && (
            <div className="pt-3 border-t border-stone-700/60">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Billing Mode</p>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-stone-400">
                  {myEntry?.scheduledPrepayOptionId
                    ? `Prepaid: ${prepayOptions?.find(o => o.id === myEntry.scheduledPrepayOptionId)?.label ?? prepayOptions?.find(o => o.id === myEntry.scheduledPrepayOptionId)?.months + ' months'}`
                    : 'Standard (monthly)'}
                </p>
                <select
                  className="bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                  value={myEntry?.scheduledPrepayOptionId ?? ''}
                  onChange={async e => {
                    const val = e.target.value || null
                    try {
                      await authFetch(`/subscriptions/${subscriptionSlug}/my-entry/billing-mode`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scheduledPrepayOptionId: val }),
                      })
                      refreshEntry()
                    } catch {}
                  }}
                >
                  <option value="">Standard (monthly)</option>
                  {prepayOptions?.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label ?? `${o.months} months`} — {o.price} {o.currency}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </>
      ) : user ? (
        <>
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Base price</p>
          {preferredCurrencyPrice ? (
            <>
              <p className="text-2xl font-serif font-semibold text-stone-100">
                {parseFloat(preferredCurrencyPrice).toFixed(2)} <span className="text-base font-normal text-stone-400">{userCurrency}/mo</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-serif font-semibold text-stone-100">
                {parseFloat(price).toFixed(2)} <span className="text-base font-normal text-stone-400">{currency}/mo</span>
              </p>
              {convertedRate && userCurrency && (
                <p className="text-sm text-stone-500 mt-0.5">
                  ≈ {(parseFloat(price) * convertedRate).toFixed(2)} {userCurrency}/mo
                </p>
              )}
            </>
          )}
          <p className="text-xs text-stone-500 mt-1">+ shipping & applicable taxes</p>
          {futurePriceChanges
            .filter(pc => preferredCurrencyPrice ? pc.currency === userCurrency : true)
            .map(pc => (
              <p key={`${pc.effectiveYear}-${pc.effectiveMonth}-${pc.currency}`} className="text-xs text-amber-500/80 mt-1">
                From {MONTHS_SHORT[pc.effectiveMonth - 1]} {pc.effectiveYear}: {parseFloat(pc.newBasePrice).toFixed(2)} {pc.currency}/mo
                {!preferredCurrencyPrice && convertedRate && userCurrency && pc.currency === currency && (
                  <> ≈ {(parseFloat(pc.newBasePrice) * convertedRate).toFixed(2)} {userCurrency}/mo</>
                )}
              </p>
            ))}
        </>
      ) : (
        <>
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Starting from</p>
          <p className="text-2xl font-serif font-semibold text-stone-100">
            {parseFloat(price).toFixed(2)} <span className="text-base font-normal text-stone-400">{currency}/mo</span>
          </p>
          <p className="text-xs text-stone-500 mt-1">+ shipping & applicable taxes</p>
          {futurePriceChanges.map(pc => (
            <p key={`${pc.effectiveYear}-${pc.effectiveMonth}`} className="text-xs text-amber-500/80 mt-1">
              From {MONTHS_SHORT[pc.effectiveMonth - 1]} {pc.effectiveYear}: {parseFloat(pc.newBasePrice).toFixed(2)} {pc.currency}/mo
            </p>
          ))}
        </>
      )}
      {user && !isSubscriber && countryFeeHints.length > 0 && (
        <div className="pt-3 border-t border-stone-700/60">
          <p className="text-xs text-stone-500 mb-1.5">
            🌍 Subscribers from {user?.shippingCountry} report:
          </p>
          <div className="space-y-1">
            {countryFeeHints.map(hint => (
              <div key={hint.category} className="flex items-center justify-between text-xs">
                <span className="text-stone-500">
                  {hint.category === '__shipping__' ? 'Shipping' : formatFeeCategory(hint.category)}
                </span>
                <span className="text-stone-600">
                  {hint.count}/{hint.totalSubscribers}
                  {hint.avgAmount != null && hint.currency && (
                    <> · avg {hint.avgAmount.toFixed(2)} {hint.currency}</>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="space-y-4">
      {/* Metadata row */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-sm text-stone-400">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <span className="flex items-center gap-1.5">
              <span className="text-stone-500">📦</span>
              <span>{formatInterval(intervalMonths)}</span>
            </span>
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
        {isSubscriber && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => openCancelModal()}
              className="text-xs text-red-500/70 hover:text-red-400 transition-colors border border-red-900/40 hover:border-red-900/70 rounded-lg px-3 py-1"
            >
              Cancel subscription
            </button>
          </div>
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

      {/* Cancellation notice */}
      {myEntry !== null && myEntry !== undefined && !myEntry.active && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4 space-y-1">
          <p className="text-sm font-medium text-red-400">
            You cancelled this subscription
            {myEntry.cancellationDate && (
              <> on {new Date(myEntry.cancellationDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
            )}
          </p>
          {myEntry.cancellationReason && (
            <p className="text-xs text-stone-500">Reason: {myEntry.cancellationReason}</p>
          )}
          <p className="text-xs text-stone-600 mt-1">You can add this subscription to your list again by clicking the button below.</p>
        </div>
      )}

      {/* Active subscriber: 2-column layout — costs on left, skip policy on right */}
      {isSubscriber ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div>{costPanel}</div>
          <div>
            <SkipStatusPanel
              subscriptionSlug={subscriptionSlug}
              months={months}
              onSkipSuccess={refreshEntry}
            />
          </div>
        </div>
      ) : (
        /* Non-subscriber: compact single column, max-w-sm */
        <div className="max-w-sm space-y-4">
          {costPanel}
          {user && !isSubscriber && myEntry !== undefined && (
            <button
              type="button"
              onClick={() => openJoinModal()}
              className="w-full py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors"
            >
              + Add to my subscriptions
            </button>
          )}
        </div>
      )}

      {showJoinModal && (
        <JoinSubscriptionModal
          subscriptionSlug={subscriptionSlug}
          subscriptionCurrency={currency}
          subscriptionRenewalDay={renewalDay ?? null}
          subscriptionPrice={price}
          subscriptionOriginalBasePrice={originalBasePrice ?? null}
          userDefaultTaxRate={user?.defaultTaxRate ?? null}
          userDefaultCurrency={user?.preferredCurrency ?? null}
          prepayOptions={prepayOptions}
          onJoined={() => {
            closeJoinModal()
            refreshEntry()
          }}
          onClose={() => closeJoinModal()}
        />
      )}

      {showEditCosts && myEntry && (
        <EditEntryCostsModal
          subscriptionSlug={subscriptionSlug}
          entry={myEntry}
          subscriptionCurrency={currency}
          onSaved={() => { closeEditCosts(); refreshEntry() }}
          onClose={() => closeEditCosts()}
        />
      )}

      {showCancelModal && (
        <CancelSubscriptionModal
          subscriptionSlug={subscriptionSlug}
          onCancelled={() => { closeCancelModal(); refreshEntry() }}
          onClose={() => closeCancelModal()}
        />
      )}

    </div>
  )
}

// ─── Edit Entry Costs Modal ────────────────────────────────────────────────────

function EditEntryCostsModal({
  subscriptionSlug,
  entry,
  subscriptionCurrency,
  onSaved,
  onClose,
}: {
  subscriptionSlug: string
  entry: NonNullable<MyEntry>
  subscriptionCurrency: string
  onSaved: () => void
  onClose: () => void
}) {
  const [basePrice, setBasePrice] = useState(entry.basePrice ?? '')
  const [shippingCost, setShippingCost] = useState(entry.shippingCost ?? '')
  const [costCurrency, setCostCurrency]= useState(entry.costCurrency ?? subscriptionCurrency)
  const savedCurrency = entry.costCurrency ?? subscriptionCurrency
  const currencyChanged = costCurrency.trim().toUpperCase() !== savedCurrency.toUpperCase()
  const [feeLinks, setFeeLinks] = useState<Array<{ templateId: string; name: string; customAmount: string; customCurrency: string }>>(
    entry.feeTemplates.map(f => ({
      templateId: f.feeTemplate.id,
      name: f.feeTemplate.name,
      customAmount: f.customAmount ?? f.feeTemplate.defaultAmount ?? '',
      customCurrency: f.customCurrency ?? f.feeTemplate.defaultCurrency,
    }))
  )
  const [allTemplates, setAllTemplates] = useState<ApiFeeTemplate[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getFeeTemplates(true).then(setAllTemplates).catch(() => {})
  }, [])

  function toggleTemplate(t: ApiFeeTemplate) {
    if (feeLinks.find(f => f.templateId === t.id)) {
      setFeeLinks(prev => prev.filter(f => f.templateId !== t.id))
    } else {
      setFeeLinks(prev => [...prev, {
        templateId: t.id,
        name: t.name,
        customAmount: t.defaultAmount != null ? String(t.defaultAmount) : '',
        customCurrency: t.defaultCurrency ?? subscriptionCurrency,
      }])
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateMyEntryCosts(subscriptionSlug, {
        basePrice: basePrice || undefined,
        shippingCost: shippingCost || undefined,
        costCurrency: costCurrency || undefined,
        linkedFeeTemplates: feeLinks.map(f => ({
          templateId: f.templateId,
          customAmount: f.customAmount ? parseDecimalInput(f.customAmount) : null,
          customCurrency: f.customCurrency || null,
        })),
      })
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-stone-800">
          <h2 className="text-base font-semibold text-stone-100">Edit subscription costs</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-stone-500">Changes apply to all books added from the next renewal onwards.</p>

          {/* Currency */}
          <div>
            <label className="block text-xs text-stone-400 mb-1">Cost currency</label>
            <input
              type="text"
              value={costCurrency}
              onChange={e => setCostCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              className="w-24 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm uppercase"
            />
          </div>

          {/* Base price */}
          <div>
            <label className="block text-xs text-stone-400 mb-1">Base price ({costCurrency})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={basePrice}
              onChange={e => setBasePrice(e.target.value)}
              placeholder="e.g. 34.99"
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm"
            />
            {currencyChanged && (
              <p className="mt-1 text-xs text-amber-400">
                ⚠ Currency changed from {savedCurrency} — check that the price above is correct in {costCurrency}.
              </p>
            )}
          </div>

          {/* Shipping */}
          <div>
            <label className="block text-xs text-stone-400 mb-1">Shipping ({costCurrency})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={shippingCost}
              onChange={e => setShippingCost(e.target.value)}
              placeholder="e.g. 8.00"
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm"
            />
          </div>

          {/* Fee templates */}
          <div>
            <p className="text-xs text-stone-400 mb-2">Fees</p>

            {/* Linked fees */}
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
                            type="number"
                            step="0.01"
                            min="0"
                            value={link.customAmount}
                            onChange={e => setFeeLinks(prev => prev.map(f => f.templateId === link.templateId ? { ...f, customAmount: e.target.value } : f))}
                            placeholder={defaultAmt || 'amount'}
                            className="w-28 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100"
                          />
                          <input
                            type="text"
                            value={link.customCurrency}
                            onChange={e => setFeeLinks(prev => prev.map(f => f.templateId === link.templateId ? { ...f, customCurrency: e.target.value.toUpperCase() } : f))}
                            placeholder={defaultCur}
                            maxLength={3}
                            className="w-14 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100 uppercase"
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

            {allTemplates.length === 0 && (
              <p className="text-xs text-stone-600 italic">No fee templates defined in settings.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-stone-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-stone-700 text-stone-400 text-sm hover:border-stone-500 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel Subscription Modal → shared component (CancelSubscriptionModal.tsx)
