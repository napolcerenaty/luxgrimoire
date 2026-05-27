'use client'

import { useState, useEffect, useCallback } from 'react'
import { authFetch } from '@/lib/authFetch'
import { getFeeTemplates } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { ApiFeeTemplate } from '@luxgrimoire/shared-types'

import { parseDecimalInput } from '@/lib/parseDecimalInput'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Author {
  author: { id: string; name: string }
}

interface BookEdition {
  id: string
  additionalImages: string[]
  title: string | null
  book: {
    title: string
    authors: Author[]
  }
}

interface MonthBook {
  editionId: string | null
  bookId: string | null
  isMainBook: boolean
  edition: BookEdition | null
}

interface SubscriptionMonth {
  id: string
  year: number
  month: number
  theme: string | null
  series: { id: string; name: string; slug: string } | null
  books: MonthBook[]
  isComboMonth?: boolean
}

interface JoinResult {
  entry: {
    id: string
    startDate: string | null
    costCurrency: string | null
    shippingCost: string | null
    renewalDay: number | null
  }
  eligibleMonths: SubscriptionMonth[]
}

interface Props {
  subscriptionSlug: string
  subscriptionCurrency: string
  subscriptionRenewalDay?: number | null
  subscriptionPrice?: string | null
  subscriptionOriginalBasePrice?: string | null
  userDefaultTaxRate?: number | null
  userDefaultCurrency?: string | null
  prepayOptions?: { id: string; months: number; price: number | string; currency: string; label: string | null; validFrom?: string | null; validUntil?: string | null }[]
  onJoined: () => void
  onClose: () => void
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatYearMonth(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function monthLabel(m: SubscriptionMonth) {
  return `${MONTH_NAMES[m.month - 1]} ${m.year}${m.theme ? ` — ${m.theme}` : ''}`
}

// ── Step 1: Subscription details ─────────────────────────────────────────────

interface LinkedFee {
  templateId: string
  customAmount: string
  customCurrency: string  // fee's own currency (editable)
}

interface PriceChange {
  effectiveYear: number
  effectiveMonth: number
  newBasePrice: string
  currency: string
}

interface Step1Props {
  currency: string
  subscriptionSlug: string
  subscriptionRenewalDay?: number | null
  subscriptionPrice?: string | null
  subscriptionOriginalBasePrice?: string | null
  userDefaultTaxRate?: number | null
  userDefaultCurrency?: string | null
  prepayOptions?: { id: string; months: number; price: number | string; currency: string; label: string | null; validFrom?: string | null; validUntil?: string | null }[]
  onNext: (data: {
    startDate: string
    costCurrency: string
    basePrice: string
    shippingCost: string
    linkedFeeTemplates: { templateId: string; customAmount?: number; customCurrency?: string }[]
    resolvedFees: { name: string; amount: string; currency: string }[]
    priceChanges: PriceChange[]
    renewalDay?: number
    selectedPrepayOptionId?: string | null
    alreadyCancelled?: boolean
    cancellationDate?: string
    cancellationReason?: string
  }) => void
}

function Step1({ currency, subscriptionSlug, subscriptionRenewalDay, subscriptionPrice, subscriptionOriginalBasePrice, userDefaultTaxRate, userDefaultCurrency, prepayOptions, onNext }: Step1Props) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // Filter to active prepay options only
  const activePrepayOptions = prepayOptions?.filter(o => {
    const now = new Date()
    if (o.validFrom && new Date(o.validFrom) > now) return false
    if (o.validUntil && new Date(o.validUntil) <= now) return false
    return true
  })

  const [firstOrderDate, setFirstOrderDate] = useState(todayStr)
  const [costCurrency, setCostCurrency] = useState(currency)
  const [basePrice, setBasePrice] = useState(subscriptionPrice ? parseFloat(subscriptionPrice).toFixed(2) : '')
  const [shippingCost, setShippingCost] = useState('')
  const [selectedPrepayOptionId, setSelectedPrepayOptionId] = useState<string | null>(null)

  // Already cancelled fields
  const [alreadyCancelled, setAlreadyCancelled] = useState(false)
  const [cancellationDate, setCancellationDate] = useState('')
  const [cancellationReason, setCancellationReason] = useState('')

  function handleSelectPrepay(optionId: string | null) {
    setSelectedPrepayOptionId(optionId)
    if (optionId === null) {
      setBasePrice(subscriptionPrice ? parseFloat(subscriptionPrice).toFixed(2) : '')
    } else {
      const opt = prepayOptions?.find(o => o.id === optionId)
      if (opt) setBasePrice(parseFloat(String(opt.price)).toFixed(2))
    }
  }

  // Price changes
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([])

  useEffect(() => {
    authFetch<PriceChange[]>(`/subscriptions/${subscriptionSlug}/price-changes`)
      .then(data => setPriceChanges(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [subscriptionSlug])

  // Auto-fill base price when costCurrency changes to one with official price records
  // Also clear prepay selection if it no longer matches the new currency
  useEffect(() => {
    // Clear prepay selection if it doesn't match the new currency
    if (selectedPrepayOptionId !== null) {
      const opt = prepayOptions?.find(o => o.id === selectedPrepayOptionId)
      if (opt && opt.currency !== costCurrency) {
        handleSelectPrepay(null)
      }
    }
    const matching = priceChanges.filter(pc => pc.currency === costCurrency)
    if (matching.length === 0) return
    const now = new Date()
    const nowYear = now.getFullYear(); const nowMonth = now.getMonth() + 1
    const applicable = [...matching]
      .filter(pc => pc.effectiveYear < nowYear || (pc.effectiveYear === nowYear && pc.effectiveMonth <= nowMonth))
      .sort((a, b) => b.effectiveYear !== a.effectiveYear ? b.effectiveYear - a.effectiveYear : b.effectiveMonth - a.effectiveMonth)
    if (applicable.length > 0) setBasePrice(parseFloat(applicable[0].newBasePrice).toFixed(2))
  }, [costCurrency]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once price changes load, set currency to user's default if official price exists for it;
  // otherwise fall back to sub's default currency with its official price
  useEffect(() => {
    if (priceChanges.length === 0) return
    const now = new Date()
    const nowYear = now.getFullYear(); const nowMonth = now.getMonth() + 1
    function latestPrice(cur: string) {
      return priceChanges
        .filter(pc => pc.currency === cur && (pc.effectiveYear < nowYear || (pc.effectiveYear === nowYear && pc.effectiveMonth <= nowMonth)))
        .sort((a, b) => b.effectiveYear !== a.effectiveYear ? b.effectiveYear - a.effectiveYear : b.effectiveMonth - a.effectiveMonth)[0]
    }
    const userCur = userDefaultCurrency?.toUpperCase()
    if (userCur && userCur !== currency) {
      const userPrice = latestPrice(userCur)
      if (userPrice) {
        setCostCurrency(userCur)
        setBasePrice(parseFloat(userPrice.newBasePrice).toFixed(2))
        return
      }
    }
    // Fall back: if sub's default currency has official price records, apply the latest
    const subPrice = latestPrice(currency)
    if (subPrice) {
      setBasePrice(parseFloat(subPrice.newBasePrice).toFixed(2))
    }
  }, [priceChanges]) // eslint-disable-line react-hooks/exhaustive-deps

  // Whether selected currency has official price records
  const hasOfficialPriceForCurrency = priceChanges.some(pc => pc.currency === costCurrency)

  // Fee templates
  const [templates, setTemplates] = useState<ApiFeeTemplate[]>([])
  const [linkedFees, setLinkedFees] = useState<LinkedFee[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)

  useEffect(() => {
    getFeeTemplates(true)
      .then(ts => {
        setTemplates(ts)
        setTemplatesLoaded(true)
      })
      .catch(() => setTemplatesLoaded(true))
  }, [])

  function toggleTemplate(t: ApiFeeTemplate) {
    setLinkedFees(prev => {
      const exists = prev.find(f => f.templateId === t.id)
      if (exists) return prev.filter(f => f.templateId !== t.id)
      return [...prev, {
        templateId: t.id,
        customAmount: t.defaultAmount != null ? String(t.defaultAmount) : '',
        customCurrency: t.defaultCurrency,
      }]
    })
  }

  function updateAmount(templateId: string, val: string) {
    setLinkedFees(prev => prev.map(f => f.templateId === templateId ? { ...f, customAmount: val } : f))
  }

  function updateCurrency(templateId: string, val: string) {
    setLinkedFees(prev => prev.map(f => f.templateId === templateId ? { ...f, customCurrency: val.toUpperCase() } : f))
  }

  // Check if all selected fees share the same currency as costCurrency → can auto-sum
  const effectiveCur = costCurrency || currency
  const allSameCurrency = linkedFees.length > 0 && linkedFees.every(f => f.customCurrency === effectiveCur)
  const feesTotal = allSameCurrency
    ? linkedFees.reduce((sum, f) => sum + parseDecimalInput(f.customAmount), 0)
    : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parts = firstOrderDate.split('-').map(Number)
    const startDate = subscriptionRenewalDay != null
      ? firstOrderDate
      : `${parts[0]}-${String(parts[1]).padStart(2, '0')}`

    onNext({
      startDate,
      costCurrency: costCurrency || currency,
      basePrice,
      shippingCost,
      linkedFeeTemplates: linkedFees.map(f => ({
        templateId: f.templateId,
        customAmount: f.customAmount !== '' ? parseDecimalInput(f.customAmount) : undefined,
        customCurrency: f.customCurrency,
      })),
      resolvedFees: linkedFees.map(f => {
        const t = templates.find(t => t.id === f.templateId)
        return {
          name: t?.name ?? f.templateId,
          amount: f.customAmount !== '' ? String(parseDecimalInput(f.customAmount)) : (t?.defaultAmount != null ? String(t.defaultAmount) : ''),
          currency: f.customCurrency || t?.defaultCurrency || (costCurrency || currency),
        }
      }),
      priceChanges,
      ...(subscriptionRenewalDay == null && { renewalDay: parts[2] ?? new Date(firstOrderDate + 'T00:00:00').getDate() }),
      selectedPrepayOptionId,
      ...(alreadyCancelled && {
        alreadyCancelled: true,
        cancellationDate: cancellationDate || undefined,
        cancellationReason: cancellationReason || undefined,
      }),
    })
  }

  const cur = effectiveCur

  return (
    <form onSubmit={submit} className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      <h3 className="text-lg font-serif text-stone-100 font-semibold">Join Subscription</h3>

      {/* Billing period (only shown if active prepay options exist for the selected currency) */}
      {activePrepayOptions && activePrepayOptions.filter(o => o.currency === costCurrency).length > 0 && (
        <div>
          <label className="block text-xs text-stone-400 uppercase tracking-wider mb-2">Billing period</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-stone-700 hover:border-stone-500 px-3 py-2.5 transition-colors has-[:checked]:border-amber-500 has-[:checked]:bg-amber-500/5">
              <input
                type="radio"
                name="billingPeriod"
                checked={selectedPrepayOptionId === null}
                onChange={() => handleSelectPrepay(null)}
                className="text-amber-600 focus:ring-amber-600/30"
              />
              <div className="flex-1 flex items-center justify-between">
                <span className="text-sm text-stone-200">Monthly</span>
                {subscriptionPrice && (
                  <span className="text-xs text-stone-400">{parseFloat(subscriptionPrice).toFixed(2)} {currency} / month</span>
                )}
              </div>
            </label>
            {activePrepayOptions.filter(o => o.currency === costCurrency).map(opt => (
              <label key={opt.id} className="flex items-center gap-3 cursor-pointer rounded-lg border border-stone-700 hover:border-stone-500 px-3 py-2.5 transition-colors has-[:checked]:border-amber-500 has-[:checked]:bg-amber-500/5">
                <input
                  type="radio"
                  name="billingPeriod"
                  checked={selectedPrepayOptionId === opt.id}
                  onChange={() => handleSelectPrepay(opt.id)}
                  className="text-amber-600 focus:ring-amber-600/30"
                />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm text-stone-200">{opt.label ?? `${opt.months} months`}</span>
                  <span className="text-xs text-stone-400">{parseFloat(String(opt.price)).toFixed(2)} {opt.currency}</span>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-1.5">Sets your scheduled renewal billing mode.</p>
        </div>
      )}
      <div>
        <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">
          {subscriptionRenewalDay != null ? 'First order date' : 'First order date (sets renewal day)'}
        </label>
        <input
          type="date"
          value={firstOrderDate}
          max={todayStr}
          onChange={e => setFirstOrderDate(e.target.value)}
          className="bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
        />
        {subscriptionRenewalDay == null && (
          <p className="text-xs text-stone-500 mt-1">
            Renewal day will be set to{' '}
            <span className="text-stone-300">{new Date(firstOrderDate + 'T00:00:00').getDate()}</span>
          </p>
        )}
        <p className="text-xs text-stone-500 mt-1">This is the date you joined the subscription, not necessarily your first payment — e.g. for Fairyloot use the "Subscription activated" date.</p>
      </div>

      {/* Currency */}
      <div>
        <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">Cost currency</label>
        <select
          value={costCurrency}
          onChange={e => setCostCurrency(e.target.value)}
          className="bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
        >
          {['EUR','GBP','USD','CAD','AUD','CHF','PLN','SEK','NOK','DKK','CZK','HUF','RON','BGN','HRK','RUB','JPY','KRW','CNY','BRL','MXN','INR','ZAR','NZD','SGD','HKD','TRY'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
          {!['EUR','GBP','USD','CAD','AUD','CHF','PLN','SEK','NOK','DKK','CZK','HUF','RON','BGN','HRK','RUB','JPY','KRW','CNY','BRL','MXN','INR','ZAR','NZD','SGD','HKD','TRY'].includes(costCurrency) && costCurrency && (
            <option value={costCurrency}>{costCurrency}</option>
          )}
        </select>
      </div>

      {/* Base price + shipping side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">
            Base price ({cur})
          </label>
          <input
            type="number" min={0} step="0.01"
            value={basePrice}
            onChange={e => setBasePrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
          />
          {priceChanges.length > 0 && (
            <p className={`text-[10px] mt-1 ${hasOfficialPriceForCurrency ? 'text-green-400' : 'text-stone-500'}`}>
              {hasOfficialPriceForCurrency ? '🟢 Official price' : '⚪ Custom price'}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">Shipping ({cur})</label>
          <input
            type="number" min={0} step="0.01"
            value={shippingCost}
            onChange={e => setShippingCost(e.target.value)}
            placeholder="0.00"
            className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
          />
        </div>
      </div>

      {firstOrderDate !== todayStr && <div className="text-xs text-stone-500 leading-relaxed space-y-1.5">
        {(() => {
          // When prepay is selected, show prepay option info instead of monthly price history
          if (selectedPrepayOptionId !== null) {
            const opt = activePrepayOptions?.find(o => o.id === selectedPrepayOptionId)
            if (!opt) return null
            return (
              <p>
                Prepay option: <span className="text-stone-300">{opt.label ?? `${opt.months}-month prepay`}</span> at{' '}
                <span className="text-stone-300">{parseFloat(String(opt.price)).toFixed(2)} {opt.currency}</span> per batch ({opt.months} months).
                Each billing period covers {opt.months} received boxes.
              </p>
            )
          }
          const currencyPriceChanges = priceChanges.filter(pc => pc.currency === costCurrency)
          if (currencyPriceChanges.length === 0 && priceChanges.length > 0) {
            return (
              <p>
                No official price records found for <span className="text-stone-300">{costCurrency}</span>. Past boxes will use your entered price of <span className="text-stone-300">{parseFloat(basePrice || '0').toFixed(2)} {costCurrency}</span> each.
                {costCurrency !== currency && (
                  <> Official records are available in <span className="text-stone-300">{currency}</span>.</>
                )}
              </p>
            )
          }
          if (currencyPriceChanges.length === 0) {
            return (
              <p>
                As we have no historical data of price changes, books will be added to your collection with the current subscription price. If you&apos;ve been a long-time subscriber and can provide historical pricing data, please submit it via the <span className="text-amber-400">Request data</span> form in the site footer.
              </p>
            )
          }
          const sorted = [...currencyPriceChanges].sort(
            (a, b) => a.effectiveYear !== b.effectiveYear ? a.effectiveYear - b.effectiveYear : a.effectiveMonth - b.effectiveMonth
          )
          // Parse start month from firstOrderDate
          const startY = firstOrderDate ? parseInt(firstOrderDate.slice(0, 4)) : null
          const startM = firstOrderDate ? parseInt(firstOrderDate.slice(5, 7)) : null
          // Months between two (year,month) pairs — inclusive start, exclusive end
          const monthsBetween = (y1: number, m1: number, y2: number, m2: number) => Math.max(0, (y2 - y1) * 12 + (m2 - m1))
          // Effective price at start (most recent change before/at start, or original base price fallback)
          const originalFallback = subscriptionOriginalBasePrice ?? subscriptionPrice ?? basePrice
          const effectivePriceAtStart = startY && startM ? (() => {
            const applicable = sorted
              .filter(pc => pc.effectiveYear < startY || (pc.effectiveYear === startY && pc.effectiveMonth <= startM))
            return applicable.length > 0 ? applicable[applicable.length - 1].newBasePrice : originalFallback
          })() : originalFallback
          // Build periods from start date through all future changes
          type Period = { label: string; months: number | null; price: string; cur: string }
          const periods: Period[] = []
          if (startY && startM) {
            const futureChanges = sorted.filter(
              pc => pc.effectiveYear > startY || (pc.effectiveYear === startY && pc.effectiveMonth > startM)
            )
            // Initial period: from start to first future change (or open-ended if none)
            const first = futureChanges[0]
            if (first) {
              const n = monthsBetween(startY, startM, first.effectiveYear, first.effectiveMonth)
              periods.push({ label: `${MONTH_NAMES[startM - 1]} ${startY} – ${MONTH_NAMES[first.effectiveMonth - 2 < 0 ? 11 : first.effectiveMonth - 2]} ${first.effectiveMonth === 1 ? first.effectiveYear - 1 : first.effectiveYear}`, months: n, price: String(effectivePriceAtStart), cur: costCurrency })
            }
            // Each future price change period
            for (let i = 0; i < futureChanges.length; i++) {
              const pc = futureChanges[i]
              const next = futureChanges[i + 1]
              if (next) {
                const n = monthsBetween(pc.effectiveYear, pc.effectiveMonth, next.effectiveYear, next.effectiveMonth)
                periods.push({ label: `${MONTH_NAMES[pc.effectiveMonth - 1]} ${pc.effectiveYear} – ${MONTH_NAMES[next.effectiveMonth - 2 < 0 ? 11 : next.effectiveMonth - 2]} ${next.effectiveMonth === 1 ? next.effectiveYear - 1 : next.effectiveYear}`, months: n, price: pc.newBasePrice, cur: pc.currency })
              } else {
                periods.push({ label: `${MONTH_NAMES[pc.effectiveMonth - 1]} ${pc.effectiveYear}+`, months: null, price: pc.newBasePrice, cur: pc.currency })
              }
            }
          }
          return (
            <>
              <p>
                We know of the following price changes:{' '}
                {sorted.map((pc, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <span className="text-stone-300">{parseFloat(pc.newBasePrice).toFixed(2)} {pc.currency}</span>
                    {' '}from{' '}
                    <span className="text-stone-300">{MONTH_NAMES[pc.effectiveMonth - 1]} {pc.effectiveYear}</span>
                  </span>
                ))}
              </p>
              {periods.length > 0 && (
                <div>
                  <p className="mb-1">Based on your start date, the backfill breaks down as:</p>
                  <div className="space-y-0.5 pl-2 border-l border-stone-700">
                    {periods.map((p, i) => (
                      <p key={i}>
                        <span className="text-stone-400">{p.label}:</span>{' '}
                        <span className="text-stone-300">{parseFloat(p.price).toFixed(2)} {p.cur}</span>
                        {p.months !== null && <span className="text-stone-500"> ({p.months} month{p.months !== 1 ? 's' : ''})</span>}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <p>
                Books will be added to your collection with those prices. If you&apos;ve been a long-time subscriber and can provide more historical pricing data, please submit it via the <span className="text-amber-400">Request data</span> form in the site footer.
              </p>
            </>
          )
        })()}
      </div>}
      <div>
        <label className="block text-xs text-stone-400 uppercase tracking-wider mb-2">
          Taxes &amp; fees
        </label>

        {templatesLoaded && templates.length > 0 ? (
          <div className="space-y-2 mb-3">
            {templates.map(t => {
              const linked = linkedFees.find(f => f.templateId === t.id)
              return (
                <div key={t.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id={`ft-${t.id}`}
                    checked={!!linked}
                    onChange={() => toggleTemplate(t)}
                    className="mt-1 rounded border-stone-600 bg-stone-800 text-amber-600 focus:ring-amber-600/30"
                  />
                  <label htmlFor={`ft-${t.id}`} className="flex-1 text-sm text-stone-200 cursor-pointer pt-0.5">
                    {t.name}
                    <span className="ml-1.5 text-xs text-stone-500">{t.category}</span>
                  </label>
                  {linked ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={linked.customAmount}
                        onChange={e => updateAmount(t.id, e.target.value)}
                        placeholder="0.00"
                        className="w-20 bg-stone-800 border border-stone-600 rounded-lg px-2 py-1 text-stone-100 text-sm"
                      />
                      <input
                        type="text"
                        value={linked.customCurrency}
                        onChange={e => updateCurrency(t.id, e.target.value)}
                        maxLength={3}
                        className="w-14 bg-stone-800 border border-stone-600 rounded-lg px-2 py-1 text-stone-100 text-sm uppercase text-center"
                      />
                    </div>
                  ) : (
                    t.defaultAmount != null && (
                      <span className="text-xs text-stone-600 text-right">
                        {parseFloat(String(t.defaultAmount)).toFixed(2)} {t.defaultCurrency}
                      </span>
                    )
                  )}
                </div>
              )
            })}
            {linkedFees.length > 0 && !allSameCurrency && (
              <></>
            )}
            <p className="text-xs text-stone-600 mt-1">
              Selected fees are tracked independently and auto-applied on backfill.
            </p>
          </div>
        ) : templatesLoaded ? (
          <p className="text-xs text-stone-500 mb-2">
            No fee templates defined.{' '}
            <a href="/profile" className="text-amber-400 underline" target="_blank" rel="noreferrer">Add them in settings.</a>
          </p>
        ) : (
          <p className="text-xs text-stone-600 mb-2">Loading…</p>
        )}

        {userDefaultTaxRate != null && userDefaultTaxRate > 0 && (
          <p className="text-xs text-stone-600 mt-1">Your default rate: {userDefaultTaxRate}%</p>
        )}
      </div>

      <p className="text-xs text-stone-500">
        These values can be updated per-book from your collection view.
      </p>

      {/* Already cancelled */}
      <div className="border-t border-stone-700/50 pt-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={alreadyCancelled}
            onChange={e => setAlreadyCancelled(e.target.checked)}
            className="rounded border-stone-600 bg-stone-800 text-amber-600 focus:ring-amber-600/30"
          />
          <span className="text-sm text-stone-300">Already cancelled (historical entry)</span>
        </label>

        {alreadyCancelled && (
          <div className="space-y-3 pl-6">
            <div>
              <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">
                Cancellation date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={cancellationDate}
                max={todayStr}
                min={firstOrderDate}
                required
                onChange={e => setCancellationDate(e.target.value)}
                className="bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">
                Cancellation reason
              </label>
              <input
                type="text"
                value={cancellationReason}
                onChange={e => setCancellationReason(e.target.value)}
                placeholder="e.g. Too expensive, moved abroad…"
                className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
              />
            </div>
            <p className="text-xs text-stone-500">
              Backfill will only show months up to the cancellation date. The entry will be saved as cancelled.
            </p>
          </div>
        )}
      </div>

      <button
        type="submit"
        className="w-full py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors"
      >
        Continue
      </button>
    </form>
  )
}

// ── Step 2: Book backfill ─────────────────────────────────────────────────────

interface Step2Props {
  eligibleMonths: SubscriptionMonth[]
  subscriptionSlug: string
  entry: JoinResult['entry']
  hasPrepayOptions?: boolean
  onDone: () => void
  onSkip: () => void
  onNextWithBilling?: (data: { selectedMonthIds: string[]; bookPrices: Record<string, string> }) => void
}

function Step2({ eligibleMonths, subscriptionSlug, entry, hasPrepayOptions, onDone, onSkip, onNextWithBilling }: Step2Props) {
  const [wantBackfill, setWantBackfill] = useState<boolean | null>(null)
  // monthId → 'selected' | 'skipped'
  const [choices, setChoices] = useState<Record<string, 'selected' | 'skipped'>>(() => {
    const init: Record<string, 'selected' | 'skipped'> = {}
    eligibleMonths.forEach(m => { init[m.id] = 'selected' })
    return init
  })
  // key = `${monthId}:${editionId}` → price string
  const [bookPrices, setBookPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const m of eligibleMonths) {
      const books = m.books.filter(b => b.editionId)
      if (books.length > 1) {
        books.forEach(b => {
          if (b.editionId) init[`${m.id}:${b.editionId}`] = ''
        })
      }
    }
    return init
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allSelected = eligibleMonths.every(m => choices[m.id] === 'selected')

  function toggleAll() {
    const next: Record<string, 'selected' | 'skipped'> = {}
    eligibleMonths.forEach(m => { next[m.id] = allSelected ? 'skipped' : 'selected' })
    setChoices(next)
  }

  function toggle(id: string) {
    setChoices(prev => ({ ...prev, [id]: prev[id] === 'selected' ? 'skipped' : 'selected' }))
  }

  async function submit() {
    const selectedMonthIds = eligibleMonths.filter(m => choices[m.id] === 'selected').map(m => m.id)

    // If onNextWithBilling is provided, pass data upstream instead of calling API
    if (onNextWithBilling) {
      onNextWithBilling({ selectedMonthIds, bookPrices })
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const skippedMonthIds = eligibleMonths.filter(m => choices[m.id] === 'skipped').map(m => m.id)
      const bookPricesPayload = Object.entries(bookPrices)
        .filter(([, v]) => v !== '' && parseDecimalInput(v) !== 0)
        .map(([key, v]) => {
          const [monthId, editionId] = key.split(':')
          return { monthId, editionId, price: parseDecimalInput(v) }
        })
      await authFetch(`/subscriptions/${subscriptionSlug}/join/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedMonthIds,
          skippedMonthIds,
          ...(bookPricesPayload.length > 0 && { bookPrices: bookPricesPayload }),
        }),
      })
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to backfill')
    } finally {
      setSubmitting(false)
    }
  }

  // Group months by series
  const seriesGroups: Map<string, { series: SubscriptionMonth['series']; months: SubscriptionMonth[] }> = new Map()
  const standalone: SubscriptionMonth[] = []
  for (const m of eligibleMonths) {
    if (m.series) {
      const key = m.series.id
      if (!seriesGroups.has(key)) seriesGroups.set(key, { series: m.series, months: [] })
      seriesGroups.get(key)!.months.push(m)
    } else {
      standalone.push(m)
    }
  }

  if (wantBackfill === null) {
    return (
      <div className="space-y-5">
        <h3 className="text-lg font-serif text-stone-100 font-semibold">Past boxes</h3>
        <p className="text-sm text-stone-300">
          You started in <strong className="text-stone-100">
            {entry.startDate ? formatYearMonth(
              parseInt(entry.startDate.slice(0, 4)),
              parseInt(entry.startDate.slice(5, 7)),
            ) : '?'}
          </strong>.
          There are <strong className="text-stone-100">{eligibleMonths.length}</strong> past box
          {eligibleMonths.length !== 1 ? 'es' : ''} to add to your collection.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setWantBackfill(true)}
            className="flex-1 py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors"
          >
            Yes, add past boxes
          </button>
          <button
            onClick={onSkip}
            className="flex-1 py-2.5 px-4 rounded-lg border border-stone-600 text-stone-300 hover:text-stone-100 text-sm font-medium transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif text-stone-100 font-semibold">Select past boxes</h3>
        <button
          onClick={toggleAll}
          className="text-xs text-amber-500 hover:text-amber-400 underline"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <p className="text-xs text-stone-500">
        Checked = received (added to collection). Unchecked = skipped.
      </p>

      <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
        {/* Series groups */}
        {Array.from(seriesGroups.values()).map(({ series, months }) => (
          <div key={series!.id} className="border border-stone-700 rounded-lg overflow-hidden">
            <div className="bg-stone-800/60 px-3 py-1.5 text-xs font-medium text-amber-400 uppercase tracking-wider">
              {series!.name}
            </div>
            {months.map(m => (
              <MonthRow key={m.id} month={m} checked={choices[m.id] === 'selected'} onToggle={() => toggle(m.id)} bookPrices={bookPrices} onPriceChange={(k, v) => setBookPrices(prev => ({ ...prev, [k]: v }))} />
            ))}
          </div>
        ))}

        {/* Standalone months */}
        {standalone.map(m => (
          <MonthRow key={m.id} month={m} checked={choices[m.id] === 'selected'} onToggle={() => toggle(m.id)} bookPrices={bookPrices} onPriceChange={(k, v) => setBookPrices(prev => ({ ...prev, [k]: v }))} />
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-60 text-stone-100 text-sm font-medium transition-colors"
        >
          {submitting ? 'Saving…' : 'Confirm'}
        </button>
        <button
          onClick={onSkip}
          disabled={submitting}
          className="py-2.5 px-4 rounded-lg border border-stone-600 text-stone-300 hover:text-stone-100 text-sm transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function MonthRow({ month, checked, onToggle, bookPrices, onPriceChange }: {
  month: SubscriptionMonth
  checked: boolean
  onToggle: () => void
  bookPrices: Record<string, string>
  onPriceChange: (key: string, val: string) => void
}) {
  const mainBook = month.books.find(b => b.isMainBook && b.edition) ?? month.books.find(b => b.edition)
  const allBooks = month.books.filter(b => b.edition)
  const authorName = mainBook?.edition?.book?.authors?.[0]?.author?.name
  const isMultiBook = allBooks.length > 1

  return (
    <div className="border-b border-stone-700/40 last:border-0">
      <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-stone-800/40">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 rounded border-stone-600 bg-stone-800 text-amber-600 focus:ring-amber-600/30"
        />
        {mainBook?.edition?.additionalImages?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryUrl(mainBook.edition.additionalImages[0], 'w_40,h_56,c_fill,q_auto,f_auto') ?? ''}
            alt=""
            width={40}
            height={56}
            className="rounded object-cover flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-amber-400/80 font-medium mb-0.5">{monthLabel(month)}</p>
          {allBooks.length <= 1 ? (
            <>
              <p className="text-sm text-stone-100 leading-snug truncate">
                {mainBook?.edition?.book?.title ?? mainBook?.edition?.title ?? '—'}
              </p>
              {authorName && <p className="text-xs text-stone-400 truncate">{authorName}</p>}
            </>
          ) : (
            <ul className="space-y-0.5">
              {allBooks.map(b => (
                <li key={b.editionId ?? b.bookId} className="text-sm text-stone-100 leading-snug truncate">
                  {b.edition?.book?.title ?? b.edition?.title ?? '—'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </label>

      {/* Per-book price inputs for multi-book months (not shown for combo months — priced as a unit) */}
      {isMultiBook && checked && !month.isComboMonth && (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">Price per book</p>
          {allBooks.map(b => {
            if (!b.editionId) return null
            const key = `${month.id}:${b.editionId}`
            const title = b.edition?.book?.title ?? b.edition?.title ?? b.editionId
            return (
              <div key={b.editionId} className="flex items-center gap-2">
                <span className="text-xs text-stone-400 flex-1 truncate">{title}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="auto"
                  value={bookPrices[key] ?? ''}
                  onChange={e => onPriceChange(key, e.target.value)}
                  className="w-20 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                />
              </div>
            )
          })}
          <p className="text-[10px] text-stone-600">Leave blank to split equally</p>
        </div>
      )}
    </div>
  )
}

// ── Step 3: Billing batches (prepay) ─────────────────────────────────────────

// Helpers

function lookupPriceAt(
  dateStr: string,
  priceChanges: PriceChange[],
  currency: string,
  fallback: string,
): string {
  if (!dateStr) return fallback
  const [y, m] = dateStr.split('-').map(Number)
  const matching = priceChanges
    .filter(pc => pc.currency === currency)
    .filter(pc => pc.effectiveYear < y || (pc.effectiveYear === y && pc.effectiveMonth <= m))
    .sort((a, b) => b.effectiveYear !== a.effectiveYear ? b.effectiveYear - a.effectiveYear : b.effectiveMonth - a.effectiveMonth)
  return matching.length > 0 ? matching[0].newBasePrice : fallback
}

interface ComputedBatch {
  billingDate: string   // ISO date yyyy-mm-dd
  monthIds: string[]    // selected months in this batch
  amount: string        // base price
  currency: string
}

/** Group selected months into prepay batches.
 *  Skipped months extend the current batch (don't count toward N).
 *  For the first batch, billing date is based on startDate (subscription entry start). */
function computeAutoBatches(
  eligibleMonths: SubscriptionMonth[],
  selectedMonthIds: string[],
  prepayN: number,
  renewalDay: number | null,
  currency: string,
  priceChanges: PriceChange[],
  fallbackPrice: string,
  startDate?: string | null,
  prepayPrice?: string | null,
): ComputedBatch[] {
  const selectedSet = new Set(selectedMonthIds)
  const sorted = [...eligibleMonths].sort(
    (a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month,
  )

  // Parse the subscription start date for first batch billing date
  let firstBatchDate: string | null = null
  if (startDate) {
    // startDate is YYYY-MM or YYYY-MM-DD
    if (startDate.length === 7) {
      const day = renewalDay ?? 1
      firstBatchDate = `${startDate}-${String(day).padStart(2, '0')}`
    } else {
      firstBatchDate = startDate
    }
  }

  const batches: ComputedBatch[] = []
  let batchStart: { year: number; month: number } | null = null
  let currentBatch: string[] = []

  for (const m of sorted) {
    if (batchStart === null) batchStart = { year: m.year, month: m.month }
    if (selectedSet.has(m.id)) {
      currentBatch.push(m.id)
      if (currentBatch.length === prepayN) {
        const day = renewalDay ?? 1
        const isFirst = batches.length === 0
        const dateStr = isFirst && firstBatchDate
          ? firstBatchDate
          : `${batchStart.year}-${String(batchStart.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const amount = prepayPrice ?? lookupPriceAt(dateStr, priceChanges, currency, fallbackPrice)
        batches.push({
          billingDate: dateStr,
          monthIds: [...currentBatch],
          amount,
          currency,
        })
        batchStart = null
        currentBatch = []
      }
    }
  }
  // Partial last batch
  if (currentBatch.length > 0 && batchStart) {
    const day = renewalDay ?? 1
    const isFirst = batches.length === 0
    const dateStr = isFirst && firstBatchDate
      ? firstBatchDate
      : `${batchStart.year}-${String(batchStart.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const amount = prepayPrice ?? lookupPriceAt(dateStr, priceChanges, currency, fallbackPrice)
    batches.push({
      billingDate: dateStr,
      monthIds: [...currentBatch],
      amount,
      currency,
    })
  }
  return batches
}

interface Step3Props {
  selectedMonthIds: string[]
  bookPrices: Record<string, string>
  selectedPrepayOption: { id: string; months: number; price: number | string; label: string | null }
  subscriptionSlug: string
  entryFees: { name: string; amount: string; currency: string }[]
  entry: JoinResult['entry']
  eligibleMonths: SubscriptionMonth[]
  priceChanges: PriceChange[]
  subscriptionPrice?: string | null
  onDone: () => void
  onBack: () => void
}

function Step3({ selectedMonthIds, bookPrices, selectedPrepayOption, subscriptionSlug, entryFees, entry, eligibleMonths, priceChanges, subscriptionPrice, onDone, onBack }: Step3Props) {
  const currency = entry.costCurrency ?? 'USD'
  const renewalDay = entry.renewalDay

  // did the user change periods during their subscription?
  const [didChange, setDidChange] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── "No" path: auto-computed batches ─────────────────────────────────────
  const autoBatches = computeAutoBatches(
    eligibleMonths,
    selectedMonthIds,
    selectedPrepayOption.months,
    renewalDay,
    currency,
    priceChanges,
    subscriptionPrice ?? '',
    entry.startDate,
    String(selectedPrepayOption.price),
  )

  // ── "Yes" path: user-provided dates ──────────────────────────────────────
  type YesRow = { date: string; amount: string }
  const [yesRows, setYesRows] = useState<YesRow[]>(() => {
    const expected = Math.ceil(selectedMonthIds.length / selectedPrepayOption.months)
    return Array.from({ length: Math.max(expected, 1) }, () => ({ date: '', amount: '' }))
  })

  function addRow() { setYesRows(prev => [...prev, { date: '', amount: '' }]) }
  function removeRow(i: number) { setYesRows(prev => prev.filter((_, j) => j !== i)) }
  function updateRow(i: number, field: keyof YesRow, val: string) {
    setYesRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: val } : r))
  }

  // Preview: assign selected months to yes-path rows based on date order
  const sortedSelectedMonths = [...eligibleMonths]
    .filter(m => selectedMonthIds.includes(m.id))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

  const yesBatches: { row: YesRow; months: SubscriptionMonth[] }[] = (() => {
    const sortedRows = [...yesRows].map((r, i) => ({ ...r, origIdx: i })).filter(r => r.date)
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    if (sortedRows.length === 0) return []
    const result: { row: YesRow; months: SubscriptionMonth[] }[] = sortedRows.map(r => ({ row: r, months: [] }))
    let batchIdx = 0
    for (const m of sortedSelectedMonths) {
      const mDate = `${m.year}-${String(m.month).padStart(2, '0')}-01`
      while (batchIdx + 1 < result.length && result[batchIdx + 1].row.date <= mDate) {
        batchIdx++
      }
      result[batchIdx].months.push(m)
    }
    return result
  })()

  function buildBookPricesPayload() {
    return Object.entries(bookPrices)
      .filter(([, v]) => v !== '' && parseDecimalInput(v) !== 0)
      .map(([key, v]) => {
        const [monthId, editionId] = key.split(':')
        return { monthId, editionId, price: parseDecimalInput(v) }
      })
  }

  async function submitAuto() {
    setSubmitting(true); setError(null)
    try {
      const skippedMonthIds = eligibleMonths.filter(m => !selectedMonthIds.includes(m.id)).map(m => m.id)
      const bookPricesPayload = buildBookPricesPayload()
      const billingBatches = autoBatches.map(b => ({
        billedAt: b.billingDate,
        baseAmount: parseDecimalInput(b.amount),
        monthsCovered: b.monthIds.length,
        currency: b.currency,
        monthIds: b.monthIds,
        ...(entryFees.length > 0 && {
          fees: entryFees.filter(f => f.amount).map(f => ({
            name: f.name,
            amount: parseDecimalInput(f.amount),
            currency: f.currency,
          })),
        }),
      }))
      await authFetch(`/subscriptions/${subscriptionSlug}/join/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedMonthIds,
          skippedMonthIds,
          ...(bookPricesPayload.length > 0 && { bookPrices: bookPricesPayload }),
          ...(billingBatches.length > 0 && { billingBatches }),
        }),
      })
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setSubmitting(false) }
  }

  async function submitYes() {
    setSubmitting(true); setError(null)
    try {
      const skippedMonthIds = eligibleMonths.filter(m => !selectedMonthIds.includes(m.id)).map(m => m.id)
      const bookPricesPayload = buildBookPricesPayload()
      const billingBatches = yesBatches
        .filter(b => b.row.date && b.months.length > 0)
        .map(b => {
          const providedAmount = b.row.amount ? parseDecimalInput(b.row.amount) : null
          const baseAmount = providedAmount !== null ? providedAmount : parseDecimalInput(String(selectedPrepayOption.price))
          return {
            billedAt: b.row.date,
            baseAmount,
            monthsCovered: b.months.length,
            currency,
            monthIds: b.months.map(m => m.id),
            ...(entryFees.length > 0 && {
              fees: entryFees.filter(f => f.amount).map(f => ({
                name: f.name, amount: parseDecimalInput(f.amount), currency: f.currency,
              })),
            }),
          }
        })
      await authFetch(`/subscriptions/${subscriptionSlug}/join/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedMonthIds,
          skippedMonthIds,
          ...(bookPricesPayload.length > 0 && { bookPrices: bookPricesPayload }),
          ...(billingBatches.length > 0 && { billingBatches }),
        }),
      })
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setSubmitting(false) }
  }

  const monthMap = new Map(eligibleMonths.map(m => [m.id, m]))

  // ── Question screen ───────────────────────────────────────────────────────
  if (didChange === null) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-serif text-stone-100 font-semibold">Billing periods</h3>
          <button onClick={onBack} className="text-xs text-stone-500 hover:text-stone-300">← Back</button>
        </div>
        <div className="rounded-lg border border-stone-700/60 bg-stone-800/40 p-4 text-sm text-stone-300">
          <p className="font-medium text-stone-100 mb-1">
            {selectedPrepayOption.label ?? `${selectedPrepayOption.months}-month prepay`}
          </p>
          <p className="text-xs text-stone-500">
            {selectedMonthIds.length} received box{selectedMonthIds.length !== 1 ? 'es' : ''} →{' '}
            {autoBatches.length} billing period{autoBatches.length !== 1 ? 's' : ''}
          </p>
        </div>
        <p className="text-sm text-stone-300">Did your prepaid periods change during your subscription?</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setDidChange(false)}
            className="w-full py-3 px-4 rounded-lg border border-stone-600 hover:border-amber-500 text-stone-200 text-sm text-left transition-colors hover:bg-amber-500/5"
          >
            <span className="font-medium text-stone-100">No, all payments were {selectedPrepayOption.label ?? `${selectedPrepayOption.months}-month prepay`}</span>
            <span className="block text-xs text-stone-500 mt-0.5">We&apos;ll auto-calculate billing dates from your start date and skips</span>
          </button>
          <button
            onClick={() => setDidChange(true)}
            className="w-full py-3 px-4 rounded-lg border border-stone-600 hover:border-amber-500 text-stone-200 text-sm text-left transition-colors hover:bg-amber-500/5"
          >
            <span className="font-medium text-stone-100">Yes, provide payment dates</span>
            <span className="block text-xs text-stone-500 mt-0.5">Enter actual payment dates; we&apos;ll look up amounts from price history</span>
          </button>
        </div>
      </div>
    )
  }

  // ── "No" — auto-computed preview ─────────────────────────────────────────
  if (!didChange) {
    return (
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-serif text-stone-100 font-semibold">Calculated billing</h3>
          <button onClick={() => setDidChange(null)} className="text-xs text-stone-500 hover:text-stone-300">← Back</button>
        </div>
        <p className="text-xs text-stone-400">
          Based on your start date, prepay period, and skipped months, we calculated the following billing batches.
          You can edit individual periods later from your collection.
        </p>
        <div className="space-y-2">
          {autoBatches.map((b, i) => {
            const months = b.monthIds.map(id => monthMap.get(id)).filter(Boolean) as SubscriptionMonth[]
            return (
              <div key={i} className="border border-stone-700 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-400">Billing period {i + 1}</span>
                  <span className="text-xs text-stone-400">{b.billingDate}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-stone-300">
                  <span>{months.map(m => `${MONTH_NAMES[m.month - 1]} ${m.year}`).join(', ')}</span>
                  <span className="text-stone-400 ml-2 shrink-0">
                    <span className="text-stone-200">{parseFloat(b.amount || '0').toFixed(2)} {b.currency}</span>
                    {months.length < selectedPrepayOption.months && (
                      <span className="text-stone-500"> ({months.length}/{selectedPrepayOption.months} boxes)</span>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
          {autoBatches.length === 0 && (
            <p className="text-xs text-stone-500">No billing batches to calculate.</p>
          )}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={submitAuto}
          disabled={submitting}
          className="w-full py-2.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    )
  }

  // ── "Yes" — user provides dates ───────────────────────────────────────────
  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif text-stone-100 font-semibold">Payment dates</h3>
        <button onClick={() => setDidChange(null)} className="text-xs text-stone-500 hover:text-stone-300">← Back</button>
      </div>
      <p className="text-xs text-stone-400">
        Enter your actual payment dates. We&apos;ll assign months based on the dates and look up amounts from price history if you leave them blank.
      </p>
      <div className="space-y-2">
        {yesRows.map((row, i) => {
          const batchMonths = yesBatches.find(b => b.row === row)?.months
            ?? yesBatches[i]?.months
            ?? []
          // For yes-path, use prepay option price as auto amount (not monthly × N)
          const prepayPriceStr = String(selectedPrepayOption.price)
          const autoAmount = row.date
            ? parseFloat(prepayPriceStr).toFixed(2)
            : null
          const feesDisplay = entryFees.filter(f => f.amount)
          return (
            <div key={i} className="border border-stone-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 w-16 shrink-0">Payment {i + 1}</span>
                <input
                  type="date"
                  value={row.date}
                  onChange={e => updateRow(i, 'date', e.target.value)}
                  className="flex-1 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                />
                <input
                  type="number"
                  step="0.01"
                  value={row.amount}
                  onChange={e => updateRow(i, 'amount', e.target.value)}
                  placeholder={autoAmount ?? `e.g. ${parseFloat(prepayPriceStr).toFixed(2)}`}
                  className="w-24 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                />
                <span className="text-xs text-stone-500">{currency}</span>
                {yesRows.length > 1 && (
                  <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
                )}
              </div>
              {batchMonths.length > 0 && (
                <p className="text-[10px] text-stone-500 pl-18">
                  Boxes: {batchMonths.map(m => `${MONTH_NAMES[m.month - 1]} ${m.year}`).join(', ')}
                </p>
              )}
              {feesDisplay.length > 0 && (
                <p className="text-[10px] text-stone-500 pl-18">
                  + fees: {feesDisplay.map(f => `${f.name} ${parseFloat(f.amount).toFixed(2)} ${f.currency}`).join(', ')}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <button onClick={addRow} className="text-xs text-amber-500 hover:text-amber-400 transition-colors">
        + Add payment
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={submitYes}
        disabled={submitting || yesRows.every(r => !r.date)}
        className="w-full py-2.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Save billing'}
      </button>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function JoinSubscriptionModal({
  subscriptionSlug,
  subscriptionCurrency,
  subscriptionRenewalDay,
  subscriptionPrice,
  subscriptionOriginalBasePrice,
  userDefaultTaxRate,
  userDefaultCurrency,
  prepayOptions,
  onJoined,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 'done'>(1)
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null)
  const [step2Data, setStep2Data] = useState<{ selectedMonthIds: string[]; bookPrices: Record<string, string> } | null>(null)
  const [step1Fees, setStep1Fees] = useState<{ name: string; amount: string; currency: string }[]>([])
  const [step1PriceChanges, setStep1PriceChanges] = useState<PriceChange[]>([])
  const [step1SelectedPrepayOption, setStep1SelectedPrepayOption] = useState<{ id: string; months: number; price: number | string; label: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const handleStep1 = useCallback(async (data: {
    startDate: string
    costCurrency: string
    basePrice: string
    shippingCost: string
    linkedFeeTemplates: { templateId: string; customAmount?: number; customCurrency?: string }[]
    resolvedFees: { name: string; amount: string; currency: string }[]
    priceChanges: PriceChange[]
    renewalDay?: number
    selectedPrepayOptionId?: string | null
    alreadyCancelled?: boolean
    cancellationDate?: string
    cancellationReason?: string
  }) => {
    setError(null)
    setJoining(true)
    try {
      const result = await authFetch<JoinResult>(`/subscriptions/${subscriptionSlug}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: data.startDate,
          costCurrency: data.costCurrency,
          basePrice: data.basePrice || undefined,
          shippingCost: data.shippingCost || undefined,
          renewalDay: data.renewalDay,
          linkedFeeTemplates: data.linkedFeeTemplates.map(f => ({
              templateId: f.templateId,
              customAmount: f.customAmount,
              customCurrency: f.customCurrency,
            })),
          ...(data.alreadyCancelled && {
            alreadyCancelled: true,
            cancellationDate: data.cancellationDate,
            cancellationReason: data.cancellationReason,
          }),
        }),
      })

      // Set billing mode if user selected a prepay option
      if (data.selectedPrepayOptionId) {
        try {
          await authFetch(`/subscriptions/${subscriptionSlug}/my-entry/billing-mode`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduledPrepayOptionId: data.selectedPrepayOptionId }),
          })
        } catch {
          // Non-fatal — join succeeded, billing mode can be changed later
        }
      }

      setJoinResult(result)
      setStep1Fees(data.resolvedFees ?? [])
      setStep1PriceChanges(data.priceChanges ?? [])
      if (data.selectedPrepayOptionId) {
        const opt = prepayOptions?.find(o => o.id === data.selectedPrepayOptionId) ?? null
        setStep1SelectedPrepayOption(opt ? { id: opt.id, months: opt.months, price: opt.price, label: opt.label } : null)
      } else {
        setStep1SelectedPrepayOption(null)
      }

      if (result.eligibleMonths.length > 0) {
        setStep(2)
      } else {
        setStep('done')
        onJoined()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }, [subscriptionSlug, onJoined])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl w-full max-w-md p-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-500 hover:text-stone-300 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        {joining && (
          <div className="flex items-center justify-center py-8">
            <span className="text-stone-400 text-sm">Saving…</span>
          </div>
        )}

        {!joining && step === 1 && (
          <>
            <Step1
              currency={subscriptionCurrency}
              subscriptionSlug={subscriptionSlug}
              subscriptionRenewalDay={subscriptionRenewalDay}
              subscriptionPrice={subscriptionPrice}
              subscriptionOriginalBasePrice={subscriptionOriginalBasePrice}
              userDefaultTaxRate={userDefaultTaxRate}
              userDefaultCurrency={userDefaultCurrency}
              prepayOptions={prepayOptions}
              onNext={handleStep1}
            />
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </>
        )}

        {!joining && step === 2 && joinResult && joinResult.eligibleMonths.length > 0 && (
          <Step2
            eligibleMonths={joinResult.eligibleMonths}
            subscriptionSlug={subscriptionSlug}
            entry={joinResult.entry}
            hasPrepayOptions={(prepayOptions?.length ?? 0) > 0}
            onDone={() => { setStep('done'); onJoined() }}
            onSkip={() => { setStep('done'); onJoined() }}
            onNextWithBilling={step1SelectedPrepayOption
              ? (data) => { setStep2Data(data); setStep(3) }
              : undefined
            }
          />
        )}

        {!joining && step === 3 && joinResult && step2Data && step1SelectedPrepayOption && (
          <Step3
            selectedMonthIds={step2Data.selectedMonthIds}
            bookPrices={step2Data.bookPrices}
            selectedPrepayOption={step1SelectedPrepayOption}
            subscriptionSlug={subscriptionSlug}
            entryFees={step1Fees}
            entry={joinResult.entry}
            eligibleMonths={joinResult.eligibleMonths}
            priceChanges={step1PriceChanges}
            subscriptionPrice={subscriptionPrice}
            onDone={() => { setStep('done'); onJoined() }}
            onBack={() => setStep(2)}
          />
        )}

        {step === 'done' && (
          <div className="text-center py-8 space-y-3">
            <p className="text-2xl">🎉</p>
            <p className="text-stone-100 font-medium">You&apos;re subscribed!</p>
            <button
              onClick={onClose}
              className="mt-2 py-2 px-6 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
