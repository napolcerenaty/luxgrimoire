'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/authFetch'
import { getFeeTemplates } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import type { ApiFeeTemplate } from '@luxgrimoire/shared-types'

import { parseDecimalInput } from '@/lib/parseDecimalInput'
import { isValidCalendarDate } from '@/lib/dateValidation'
import { groupIntoBundles } from '@/lib/bundleHelpers'
import {
  computeAutoBatches,
  resolveBackfillFallbackPrice,
  computeFirstBillingMonth,
  isGrandfatheredExcluded,
  buildFirstBoxCandidates,
  applyFirstBoxChoice,
  type PriceChangeRecord,
  type ComputedBatch,
  type FirstBoxCandidates,
  type BoxCandidate,
} from '@/lib/joinSubscription.utils'
import { bundleRangeLabel } from '@/lib/bundleHelpers'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Author {
  author: { id: string; name: string }
}

interface BookEdition {
  id: string
  additionalImages: string[]
  title: string | null
  variantLabel?: string | null
  book: {
    title: string
    authors: Author[]
  }
}

/** book.title (+ variant suffix) when book data is present, falling back to the edition's own legacy title field. */
function editionDisplayTitle(edition: BookEdition | null | undefined): string | null {
  if (!edition) return null
  return formatEditionDisplayTitle(edition.book, edition) || edition.title
}

type ChoiceGroupMeta = { allowMultiple: boolean; label: string | null }

/** Fetches allowMultiple/label for every choice group referenced by these months (one request per month that has one). */
async function fetchChoiceGroupMeta(subscriptionSlug: string, months: SubscriptionMonth[]): Promise<Record<string, ChoiceGroupMeta>> {
  const monthsWithGroups = months.filter(m => m.books.some(b => b.choiceGroupId))
  if (monthsWithGroups.length === 0) return {}
  const results = await Promise.all(
    monthsWithGroups.map(m =>
      authFetch<{ id: string; label: string | null; allowMultiple: boolean }[]>(
        `/subscriptions/${subscriptionSlug}/months/${m.year}/${m.month}/choice-groups`,
      ).catch(() => []),
    ),
  )
  const meta: Record<string, ChoiceGroupMeta> = {}
  for (const groups of results) {
    for (const g of groups) meta[g.id] = { allowMultiple: g.allowMultiple, label: g.label }
  }
  return meta
}

/**
 * Records the user's own picks for any choice group in a received (selected) past month —
 * this is the self-service replacement for admin-set backfill choices: the joining user
 * declares what they actually got, right here, instead of an admin looking up their user ID
 * later. Best-effort: the join/backfill itself already succeeded by the time this runs, so a
 * failure here shouldn't be reported as a failed join.
 */
async function submitChoicePicks(
  subscriptionSlug: string,
  months: SubscriptionMonth[],
  selectedMonthIds: string[],
  picks: Record<string, string[]>,
) {
  for (const [choiceGroupId, monthBookIds] of Object.entries(picks)) {
    if (monthBookIds.length === 0) continue
    const month = months.find(m => m.books.some(b => b.choiceGroupId === choiceGroupId))
    if (!month || !selectedMonthIds.includes(month.id)) continue
    await authFetch(`/subscriptions/${subscriptionSlug}/months/${month.year}/${month.month}/choice-groups/${choiceGroupId}/my-choice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthBookIds }),
    }).catch(() => {})
  }
}

interface MonthBook {
  id: string
  editionId: string | null
  bookId: string | null
  isMainBook: boolean
  choiceGroupId: string | null
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
    basePrice: string | null
  }
  eligibleMonths: SubscriptionMonth[]
  /** One box unit's worth of months immediately before the default first box (see below) — empty if none. */
  previousBoxMonths?: SubscriptionMonth[]
  /** The server's date-anchored default first box month — the "current" candidate in the picker step. */
  defaultFirstBoxYear?: number | null
  defaultFirstBoxMonth?: number | null
}

interface Props {
  subscriptionSlug: string
  subscriptionCurrency: string
  subscriptionRenewalDay?: number | null
  subscriptionRenewalMonthOffset?: number
  subscriptionPrice?: string | null
  subscriptionOriginalBasePrice?: string | null
  userDefaultTaxRate?: number | null
  userDefaultCurrency?: string | null
  prepayOptions?: { id: string; months: number; price: number | string; currency: string; label: string | null; validFrom?: string | null; validUntil?: string | null }[]
  isDiscontinued?: boolean
  subscriptionEndDate?: string | null
  signupIncludesCurrentMonth?: boolean
  isBundleSubscription?: boolean
  hasBookChoiceMonths?: boolean
  intervalMonths?: number
  startingMonth?: number
  onJoined: () => void
  onClose: () => void
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENCY_LIST = ['EUR','GBP','USD','CAD','AUD','CHF','PLN','SEK','NOK','DKK','CZK','HUF','RON','BGN','HRK','RUB','JPY','KRW','CNY','BRL','MXN','INR','ZAR','NZD','SGD','HKD','TRY']

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

/** @see PriceChangeRecord in joinSubscription.utils — kept as local alias for prop typing */
type PriceChange = PriceChangeRecord

interface Step1FormData {
  startDate: string
  costCurrency: string
  basePrice: string
  shippingCost: string
  isForwarding: boolean
  linkedFeeTemplates: { templateId: string; customAmount?: number; customCurrency?: string }[]
  resolvedFees: { name: string; amount: string; currency: string }[]
  priceChanges: PriceChange[]
  renewalDay?: number
  selectedPrepayOptionId?: string | null
  alreadyCancelled?: boolean
  cancellationDate?: string
  cancellationReason?: string
}

interface JoinSubscriptionData {
  startDate: string
  costCurrency: string
  basePrice?: string
  shippingCost?: string
  isForwarding: boolean
  renewalDay?: number
  linkedFeeTemplates: { templateId: string; customAmount?: number; customCurrency?: string }[]
  alreadyCancelled?: boolean
  cancellationDate?: string
  cancellationReason?: string
  selectedPrepayOptionId: string | null
  /** Set once the mandatory "choose your first box" step is confirmed — see StepChooseFirstBox. */
  firstBoxYear?: number
  firstBoxMonth?: number
}

interface Step1Props {
  currency: string
  subscriptionSlug: string
  subscriptionRenewalDay?: number | null
  subscriptionRenewalMonthOffset?: number
  subscriptionPrice?: string | null
  subscriptionOriginalBasePrice?: string | null
  userDefaultTaxRate?: number | null
  userDefaultCurrency?: string | null
  prepayOptions?: { id: string; months: number; price: number | string; currency: string; label: string | null; validFrom?: string | null; validUntil?: string | null }[]
  isDiscontinued?: boolean
  subscriptionEndDate?: string | null
  signupIncludesCurrentMonth?: boolean
  onNext: (data: Step1FormData) => void
}

function Step1({ currency, subscriptionSlug, subscriptionRenewalDay, subscriptionRenewalMonthOffset, subscriptionPrice, subscriptionOriginalBasePrice, userDefaultTaxRate, userDefaultCurrency, prepayOptions, isDiscontinued, subscriptionEndDate, signupIncludesCurrentMonth, onNext }: Step1Props) {
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
  const [isForwarding, setIsForwarding] = useState(false)
  const [selectedPrepayOptionId, setSelectedPrepayOptionId] = useState<string | null>(null)

  // Already cancelled fields
  const [alreadyCancelled, setAlreadyCancelled] = useState(isDiscontinued ?? false)
  const [cancellationDate, setCancellationDate] = useState(() => {
    if (isDiscontinued && subscriptionEndDate) return subscriptionEndDate.slice(0, 10)
    return ''
  })
  const [cancellationReason, setCancellationReason] = useState('')
  const [dateError, setDateError] = useState<string | null>(null)
  const [firstOrderDateInvalid, setFirstOrderDateInvalid] = useState(false)
  const [cancellationDateInvalid, setCancellationDateInvalid] = useState(false)

  function handleFirstOrderDateChange(v: string) {
    setFirstOrderDate(v)
    if (firstOrderDateInvalid) { setFirstOrderDateInvalid(false); setDateError(null) }
  }
  function handleCancellationDateChange(v: string) {
    setCancellationDate(v)
    if (cancellationDateInvalid) { setCancellationDateInvalid(false); setDateError(null) }
  }

  function handleSelectPrepay(optionId: string | null) {
    setSelectedPrepayOptionId(optionId)
    if (optionId === null) {
      setBasePrice(subscriptionPrice ? parseFloat(subscriptionPrice).toFixed(2) : '')
    } else {
      const opt = prepayOptions?.find(o => o.id === optionId)
      if (opt) {
        // Only auto-fill price when the option's currency matches the user's chosen currency.
        // Never force the currency to change — billing period and currency are independent choices.
        if (opt.currency === costCurrency) {
          setBasePrice(parseFloat(String(opt.price)).toFixed(2))
        }
      }
    }
  }

  // Price changes
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([])

  useEffect(() => {
    authFetch<PriceChange[]>(`/subscriptions/${subscriptionSlug}/price-changes`)
      .then(data => setPriceChanges(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [subscriptionSlug])

  // Auto-fill base price when costCurrency changes to one with official price records.
  // Billing period (prepay option) is independent of currency — never clear it here.
  useEffect(() => {
    const matching = priceChanges.filter(pc => pc.currency === costCurrency)
    if (matching.length === 0) {
      if (costCurrency === currency && subscriptionPrice) {
        setBasePrice(parseFloat(subscriptionPrice).toFixed(2))
      }
      return
    }
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

  // Whether selected currency has official price records.
  // Also treat the sub's default currency as official when subscriptionPrice exists
  // (it may be based on a sentinel record which is excluded from listPriceChanges).
  const hasOfficialPriceForCurrency = priceChanges.some(pc => pc.currency === costCurrency)
    || (costCurrency === currency && !!subscriptionPrice)

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
    if (!isValidCalendarDate(firstOrderDate)) {
      setFirstOrderDateInvalid(true); setDateError('Enter a valid first order date'); return
    }
    if (alreadyCancelled && !isValidCalendarDate(cancellationDate)) {
      setCancellationDateInvalid(true); setDateError('Enter a valid cancellation date'); return
    }
    setDateError(null)
    const parts = firstOrderDate.split('-').map(Number)
    const startDate = subscriptionRenewalDay != null
      ? firstOrderDate
      : `${parts[0]}-${String(parts[1]).padStart(2, '0')}`

    onNext({
      startDate,
      costCurrency: costCurrency || currency,
      basePrice,
      shippingCost,
      isForwarding,
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

      {/* Billing period (shown whenever any prepay options exist) */}
      {activePrepayOptions && activePrepayOptions.length > 0 && (() => {
        // Show options for the selected currency; if none, fall back to the subscription's default currency
        const forCurrency = activePrepayOptions.filter(o => o.currency === costCurrency)
        const displayedOptions = forCurrency.length > 0 ? forCurrency : activePrepayOptions.filter(o => o.currency === currency)
        return (
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
            {displayedOptions.map(opt => (
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
        )
      })()}
      <div>
        <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">
          {subscriptionRenewalDay != null ? 'First order date' : 'First order date (sets renewal day)'}
        </label>
        <input
          type="date"
          value={firstOrderDate}
          max={todayStr}
          onChange={e => handleFirstOrderDateChange(e.target.value)}
          className={`bg-stone-800 border rounded-lg px-3 py-2 text-stone-100 text-sm ${firstOrderDateInvalid ? 'border-red-500/70' : 'border-stone-600'}`}
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
          {CURRENCY_LIST.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
          {!CURRENCY_LIST.includes(costCurrency) && costCurrency && (
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
          // When prepay is selected, use prepay option history (validFrom/validUntil) for price changes
          if (selectedPrepayOptionId !== null) {
            const opt = activePrepayOptions?.find(o => o.id === selectedPrepayOptionId)
            if (!opt) return null
            const prepayN = opt.months
            // All options with same months + currency represent historical pricing for this prepay period
            const sameOptions = (prepayOptions ?? []).filter(o => o.months === prepayN && o.currency === costCurrency)
            const sortedOptions = [...sameOptions].sort((a, b) => {
              const af = a.validFrom ?? '1900-01-01'
              const bf = b.validFrom ?? '1900-01-01'
              return af < bf ? -1 : af > bf ? 1 : 0
            })
            if (sortedOptions.length <= 1) {
              // No historical price changes — just show current price
              return (
                <p>
                  Prepay option: <span className="text-stone-300">{opt.label ?? `${opt.months}-month prepay`}</span> at{' '}
                  <span className="text-stone-300">{parseFloat(String(opt.price)).toFixed(2)} {opt.currency}</span> per batch ({opt.months} months).
                  Each billing period covers {opt.months} received boxes.
                </p>
              )
            }
            // Build period breakdown from sorted options
            const startDateStr = firstOrderDate ?? ''
            type PrepayPeriod = { label: string; batches: number | null; price: string; cur: string }
            const periods: PrepayPeriod[] = []
            if (startDateStr) {
              // Find which option was active at start date
              const activeAtStart = [...sortedOptions].reverse().find(o => {
                const from = o.validFrom ? o.validFrom.slice(0, 10) : null
                return !from || from <= startDateStr
              }) ?? sortedOptions[0]
              // Options that became effective after start date
              const laterOptions = sortedOptions.filter(o => {
                const from = o.validFrom ? o.validFrom.slice(0, 10) : null
                return from && from > startDateStr
              })
              // First period: from start to first change (or open-ended)
              if (laterOptions.length > 0) {
                const nextFrom = laterOptions[0].validFrom!.slice(0, 7) // YYYY-MM
                const nextY = parseInt(nextFrom.slice(0, 4))
                const nextM = parseInt(nextFrom.slice(5, 7))
                const startY2 = parseInt(startDateStr.slice(0, 4))
                const startM2 = parseInt(startDateStr.slice(5, 7))
                const nMonths = Math.max(0, (nextY - startY2) * 12 + (nextM - startM2))
                const endLabel = `${MONTH_NAMES[nextM - 2 < 0 ? 11 : nextM - 2]} ${nextM === 1 ? nextY - 1 : nextY}`
                periods.push({
                  label: `${MONTH_NAMES[startM2 - 1]} ${startY2} – ${endLabel}`,
                  batches: nMonths > 0 ? Math.ceil(nMonths / prepayN) : null,
                  price: String(activeAtStart.price),
                  cur: activeAtStart.currency,
                })
                for (let i = 0; i < laterOptions.length; i++) {
                  const cur2 = laterOptions[i]
                  const next2 = laterOptions[i + 1]
                  if (next2 && next2.validFrom) {
                    const cf = cur2.validFrom!.slice(0, 7)
                    const nf = next2.validFrom!.slice(0, 7)
                    const cy2 = parseInt(cf.slice(0, 4)), cm2 = parseInt(cf.slice(5, 7))
                    const ny2 = parseInt(nf.slice(0, 4)), nm2 = parseInt(nf.slice(5, 7))
                    const n2 = Math.max(0, (ny2 - cy2) * 12 + (nm2 - cm2))
                    const endLabel2 = `${MONTH_NAMES[nm2 - 2 < 0 ? 11 : nm2 - 2]} ${nm2 === 1 ? ny2 - 1 : ny2}`
                    periods.push({ label: `${MONTH_NAMES[cm2 - 1]} ${cy2} – ${endLabel2}`, batches: Math.ceil(n2 / prepayN), price: String(cur2.price), cur: cur2.currency })
                  } else {
                    const cf = cur2.validFrom!.slice(0, 7)
                    const cy2 = parseInt(cf.slice(0, 4)), cm2 = parseInt(cf.slice(5, 7))
                    periods.push({ label: `${MONTH_NAMES[cm2 - 1]} ${cy2}+`, batches: null, price: String(cur2.price), cur: cur2.currency })
                  }
                }
              } else {
                const startY2 = parseInt(startDateStr.slice(0, 4))
                const startM2 = parseInt(startDateStr.slice(5, 7))
                periods.push({ label: `${MONTH_NAMES[startM2 - 1]} ${startY2}+`, batches: null, price: String(activeAtStart.price), cur: activeAtStart.currency })
              }
            }
            return (
              <>
                <p>
                  Prepay option: <span className="text-stone-300">{opt.label ?? `${opt.months}-month prepay`}</span>.
                  Each billing period covers {opt.months} received boxes. We know of the following price changes:{' '}
                  {sortedOptions.map((o, i) => (
                    <span key={o.id}>
                      {i > 0 && ', '}
                      <span className="text-stone-300">{parseFloat(String(o.price)).toFixed(2)} {o.currency}</span>
                      {o.validFrom && <>{' '}from <span className="text-stone-300">{MONTH_NAMES[parseInt(o.validFrom.slice(5, 7)) - 1]} {o.validFrom.slice(0, 4)}</span></>}
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
                          {' '}<span className="text-stone-500">per batch ({prepayN} months)</span>
                          {p.batches !== null && <span className="text-stone-500"> — {p.batches} batch{p.batches !== 1 ? 'es' : ''}</span>}
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
          const sorted = [...currencyPriceChanges].filter(pc => pc.effectiveYear !== 1900).sort(
            (a, b) => a.effectiveYear !== b.effectiveYear ? a.effectiveYear - b.effectiveYear : a.effectiveMonth - b.effectiveMonth
          )
          // Parse join month from firstOrderDate and derive first billing month
          const startY = firstOrderDate ? parseInt(firstOrderDate.slice(0, 4)) : null
          const startM = firstOrderDate ? parseInt(firstOrderDate.slice(5, 7)) : null
          const startD = firstOrderDate && firstOrderDate.length >= 10 ? parseInt(firstOrderDate.slice(8, 10)) : 1
          const firstBilling = startY && startM
            ? computeFirstBillingMonth(startY, startM, signupIncludesCurrentMonth ?? true, startD, subscriptionRenewalDay ?? null, subscriptionRenewalMonthOffset ?? 0)
            : null
          const firstBillingY = firstBilling?.year ?? null
          const firstBillingM = firstBilling?.month ?? null
          // Effective price at start (most recent change before/at first billing month, or original base price fallback)
          const originalFallback = subscriptionOriginalBasePrice ?? subscriptionPrice ?? basePrice
          const effectivePriceAtStart = firstBillingY && firstBillingM ? (() => {
            const applicable = sorted
              .filter(pc => pc.effectiveYear < firstBillingY || (pc.effectiveYear === firstBillingY && pc.effectiveMonth <= firstBillingM))
            return applicable.length > 0 ? applicable[applicable.length - 1].newBasePrice : originalFallback
          })() : originalFallback
          // Grandfathered change doesn't affect user if their first billing month is before the effective date.
          const isGrandfatheredFutureChange = (pc: PriceChange) =>
            firstBillingY && firstBillingM
              ? isGrandfatheredExcluded(pc, firstBillingY, firstBillingM)
              : false
          // Months between two (year,month) pairs — inclusive start, exclusive end
          const monthsBetween = (y1: number, m1: number, y2: number, m2: number) => Math.max(0, (y2 - y1) * 12 + (m2 - m1))
          type Period = { label: string; months: number | null; price: string; cur: string }
          const periods: Period[] = []
          if (firstBillingY && firstBillingM) {
            const futureChanges = sorted.filter(
              pc => (pc.effectiveYear > firstBillingY || (pc.effectiveYear === firstBillingY && pc.effectiveMonth > firstBillingM))
                && !isGrandfatheredFutureChange(pc)
            )
            // Initial period: from first billing month to first future change (or open-ended if none)
            const first = futureChanges[0]
            if (first) {
              const n = monthsBetween(firstBillingY, firstBillingM, first.effectiveYear, first.effectiveMonth)
              periods.push({ label: `${MONTH_NAMES[firstBillingM - 1]} ${firstBillingY} – ${MONTH_NAMES[first.effectiveMonth - 2 < 0 ? 11 : first.effectiveMonth - 2]} ${first.effectiveMonth === 1 ? first.effectiveYear - 1 : first.effectiveYear}`, months: n, price: String(effectivePriceAtStart), cur: costCurrency })
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
          // Price changes to show in summary — all of them, but grandfathered future ones are annotated
          const visiblePriceChanges = sorted
          return (
            <>
              {visiblePriceChanges.length > 0 && (
                <p>
                  We know of the following price changes:{' '}
                  {visiblePriceChanges.map((pc, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      <span className="text-stone-300">{parseFloat(pc.newBasePrice).toFixed(2)} {pc.currency}</span>
                      {' '}from{' '}
                      <span className="text-stone-300">{MONTH_NAMES[pc.effectiveMonth - 1]} {pc.effectiveYear}</span>
                      {isGrandfatheredFutureChange(pc) && (
                        <span className="text-amber-500/80"> (grandfathered — won&apos;t affect you)</span>
                      )}
                    </span>
                  ))}
                </p>
              )}
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
              {visiblePriceChanges.length > 0 ? (
                <p>
                  Books will be added to your collection with those prices. If you&apos;ve been a long-time subscriber and can provide more historical pricing data, please submit it via the <span className="text-amber-400">Request data</span> form in the site footer.
                </p>
              ) : (
                <p>
                  No historical price change information is available for this subscription. If you&apos;ve been a long-time subscriber and can provide pricing data, please submit it via the <span className="text-amber-400">Request data</span> form in the site footer.
                </p>
              )}
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

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isForwarding}
          onChange={e => setIsForwarding(e.target.checked)}
          className="rounded border-stone-600 bg-stone-800 text-amber-500"
        />
        <span className="text-sm text-stone-300">📦 Forwarding packages</span>
      </label>

      {/* Already cancelled */}
      <div className="border-t border-stone-700/50 pt-4 space-y-3">
        {isDiscontinued ? (
          <p className="text-sm text-stone-400">
            <span className="text-amber-500 font-medium">Discontinued subscription</span> — this entry will be saved as cancelled.
          </p>
        ) : (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={alreadyCancelled}
              onChange={e => setAlreadyCancelled(e.target.checked)}
              className="rounded border-stone-600 bg-stone-800 text-amber-600 focus:ring-amber-600/30"
            />
            <span className="text-sm text-stone-300">Already cancelled (historical entry)</span>
          </label>
        )}

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
                onChange={e => handleCancellationDateChange(e.target.value)}
                className={`bg-stone-800 border rounded-lg px-3 py-2 text-stone-100 text-sm ${cancellationDateInvalid ? 'border-red-500/70' : 'border-stone-600'}`}
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

      {dateError && <p className="text-xs text-red-400">{dateError}</p>}
      <button
        type="submit"
        className="w-full py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors"
      >
        Continue
      </button>
    </form>
  )
}

// ── Step ChooseFirstBox: mandatory first-box month picker ───────────────────
//
// Renewal-day/signupIncludesCurrentMonth cycle math drifts over time (settings history bug
// fixes, historical corrections) — the same entry can compute a different "first box" on every
// recompute. Instead of trusting that formula live, we show the user a calculated default plus
// the adjacent box (earlier/later) and let them confirm which one was actually theirs; the choice
// gets saved on the entry and reused everywhere the app needs "first box month" from then on.
// Always shown — no skip button — for every subscription type, including bundles.

interface ChooseFirstBoxProps {
  eligibleMonths: SubscriptionMonth[]
  previousBoxMonths: SubscriptionMonth[]
  defaultFirstBoxYear: number
  defaultFirstBoxMonth: number
  isBundleMode: boolean
  intervalMonths: number
  startingMonth: number
  onConfirm: (firstBoxYear: number, firstBoxMonth: number, adjustedEligibleMonths: SubscriptionMonth[]) => void
  onBack: () => void
}

function candidateBookTitles(candidate: BoxCandidate, monthMap: Map<string, SubscriptionMonth>): string[] {
  const titles = new Set<string>()
  for (const id of candidate.monthIds) {
    const m = monthMap.get(id)
    if (!m) continue
    for (const b of m.books) {
      const title = editionDisplayTitle(b.edition)
      if (title) titles.add(title)
    }
  }
  return Array.from(titles)
}

function candidateLabel(candidate: BoxCandidate, isBundleMode: boolean, intervalMonths: number): string {
  return isBundleMode
    ? bundleRangeLabel(candidate.year, candidate.month, intervalMonths)
    : `${MONTH_NAMES[candidate.month - 1]} ${candidate.year}`
}

function StepChooseFirstBox({ eligibleMonths, previousBoxMonths, defaultFirstBoxYear, defaultFirstBoxMonth, isBundleMode, intervalMonths, startingMonth, onConfirm, onBack }: ChooseFirstBoxProps) {
  const candidates: FirstBoxCandidates = buildFirstBoxCandidates(
    eligibleMonths, previousBoxMonths, defaultFirstBoxYear, defaultFirstBoxMonth, isBundleMode, intervalMonths, startingMonth,
  )
  const [choice, setChoice] = useState<'previous' | 'current' | 'next'>('current')

  const monthMap = new Map<string, SubscriptionMonth>([...previousBoxMonths, ...eligibleMonths].map(m => [m.id, m]))

  function submit() {
    // choice can only ever be 'previous' if candidates.previous is non-null — the radio option
    // for it isn't rendered otherwise (see options.map below) — but the indexed access can't
    // express that to TypeScript.
    const selected = candidates[choice]
    if (!selected) return
    const adjusted = applyFirstBoxChoice(choice, eligibleMonths, previousBoxMonths, candidates)
    onConfirm(selected.year, selected.month, adjusted)
  }

  const options: { key: 'previous' | 'current' | 'next'; candidate: BoxCandidate | null }[] = [
    { key: 'previous', candidate: candidates.previous },
    { key: 'current', candidate: candidates.current },
    { key: 'next', candidate: candidates.next },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif text-stone-100 font-semibold">Which was your first box?</h3>
        <button onClick={onBack} className="text-xs text-stone-500 hover:text-stone-300">← Back</button>
      </div>
      <p className="text-sm text-stone-400">
        We calculated a default from your join date, but renewal timing can shift over time — confirm the month your subscription actually started with.
      </p>
      <div className="space-y-2">
        {options.map(({ key, candidate }) => {
          if (!candidate) return null
          const titles = candidateBookTitles(candidate, monthMap)
          const label = candidateLabel(candidate, isBundleMode, intervalMonths)
          return (
            <label
              key={key}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${choice === key ? 'border-amber-500 bg-amber-500/5' : 'border-stone-700 hover:border-stone-500'}`}
            >
              <input
                type="radio"
                name="firstBoxChoice"
                checked={choice === key}
                onChange={() => setChoice(key)}
                className="mt-1 text-amber-600 focus:ring-amber-600/30"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-100">{label}</span>
                  {key === 'current' && (
                    <span className="text-[10px] uppercase tracking-wide text-amber-500/80">Suggested</span>
                  )}
                </div>
                {titles.length > 0 ? (
                  <p className="text-xs text-stone-400 mt-0.5">{titles.join(', ')}</p>
                ) : (
                  <p className="text-xs text-stone-600 mt-0.5 italic">Not yet announced</p>
                )}
              </div>
            </label>
          )
        })}
      </div>
      <button
        onClick={submit}
        className="w-full py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors"
      >
        Continue
      </button>
    </div>
  )
}

// ── Step 2: Book backfill ─────────────────────────────────────────────────────

interface Step2Props {
  eligibleMonths: SubscriptionMonth[]
  subscriptionSlug: string
  entry: JoinResult['entry']
  hasPrepayOptions?: boolean
  isBundleSubscription?: boolean
  intervalMonths?: number
  startingMonth?: number
  onDone: () => void
  onSkip: () => void
  onBack: () => void
  onNextWithBilling?: (data: { selectedMonthIds: string[]; bookPrices: Record<string, string>; backfillOwnershipStatus: 'OWNED' | 'PREORDER'; choicePicks: Record<string, string[]> }) => void
  onBeforeBackfill?: () => Promise<void>
}

function Step2({ eligibleMonths, subscriptionSlug, entry, hasPrepayOptions, isBundleSubscription, intervalMonths = 1, startingMonth = 1, onDone, onSkip, onBack, onNextWithBilling, onBeforeBackfill }: Step2Props) {
  const isBundleMode = (isBundleSubscription ?? false) && intervalMonths > 1
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
  const [backfillOwnershipStatus, setBackfillOwnershipStatus] = useState<'OWNED' | 'PREORDER'>('OWNED')
  // choiceGroupId → picked SubscriptionMonthBook id(s) — the user's own "which did I receive" answer
  const [choicePicks, setChoicePicks] = useState<Record<string, string[]>>({})
  const [choiceGroupMeta, setChoiceGroupMeta] = useState<Record<string, ChoiceGroupMeta>>({})

  useEffect(() => {
    fetchChoiceGroupMeta(subscriptionSlug, eligibleMonths).then(setChoiceGroupMeta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allSelected = eligibleMonths.every(m => choices[m.id] === 'selected')

  // Every choice group in a received (selected) month must have a pick before continuing —
  // this is what "forces" the choice instead of letting it silently default to both later.
  const requiredChoiceGroupIds = Array.from(new Set(
    eligibleMonths
      .filter(m => choices[m.id] === 'selected')
      .flatMap(m => m.books)
      .map(b => b.choiceGroupId)
      .filter((id): id is string => !!id),
  ))
  const unresolvedChoiceGroupIds = requiredChoiceGroupIds.filter(id => !choicePicks[id] || choicePicks[id].length === 0)
  const hasUnresolvedChoices = unresolvedChoiceGroupIds.length > 0

  function onChoicePick(groupId: string, monthBookIds: string[]) {
    setChoicePicks(prev => ({ ...prev, [groupId]: monthBookIds }))
  }

  function toggleAll() {
    const next: Record<string, 'selected' | 'skipped'> = {}
    eligibleMonths.forEach(m => { next[m.id] = allSelected ? 'skipped' : 'selected' })
    setChoices(next)
  }

  function toggle(id: string) {
    setChoices(prev => ({ ...prev, [id]: prev[id] === 'selected' ? 'skipped' : 'selected' }))
  }

  function toggleBundle(monthIds: string[]) {
    const allBundleSelected = monthIds.every(id => choices[id] === 'selected')
    setChoices(prev => {
      const next = { ...prev }
      for (const id of monthIds) next[id] = allBundleSelected ? 'skipped' : 'selected'
      return next
    })
  }

  async function submit() {
    if (hasUnresolvedChoices) {
      setError('Pick which book you received for the highlighted month(s) before continuing.')
      return
    }
    const selectedMonthIds = eligibleMonths.filter(m => choices[m.id] === 'selected').map(m => m.id)

    // If onNextWithBilling is provided, pass data upstream instead of calling API
    if (onNextWithBilling) {
      onNextWithBilling({ selectedMonthIds, bookPrices, backfillOwnershipStatus, choicePicks })
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
      // First do the real join (creates entry), then record any book choices — the backfill
      // call below resolves book entries against whatever choice already exists, so the
      // choice must be saved BEFORE backfill runs, not after.
      if (onBeforeBackfill) await onBeforeBackfill()
      await submitChoicePicks(subscriptionSlug, eligibleMonths, selectedMonthIds, choicePicks)
      await authFetch(`/subscriptions/${subscriptionSlug}/join/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedMonthIds,
          skippedMonthIds,
          backfillOwnershipStatus,
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

  // Group months by series (non-bundle mode only)
  const seriesGroups: Map<string, { series: SubscriptionMonth['series']; months: SubscriptionMonth[] }> = new Map()
  const standalone: SubscriptionMonth[] = []
  if (!isBundleMode) {
    for (const m of eligibleMonths) {
      if (m.series) {
        const key = m.series.id
        if (!seriesGroups.has(key)) seriesGroups.set(key, { series: m.series, months: [] })
        seriesGroups.get(key)!.months.push(m)
      } else {
        standalone.push(m)
      }
    }
  }

  // Bundle grouping (bundle mode only)
  const bundleGroups = isBundleMode
    ? groupIntoBundles(eligibleMonths, intervalMonths, startingMonth)
    : []

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
        <div className="flex flex-col gap-3">
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
          <button
            onClick={onBack}
            className="text-xs text-stone-500 hover:text-stone-300 transition-colors text-left"
          >
            ← Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif text-stone-100 font-semibold">Select past boxes</h3>
        {!isBundleMode && (
          <button
            onClick={toggleAll}
            className="text-xs text-amber-500 hover:text-amber-400 underline"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      <p className="text-xs text-stone-500">
        {isBundleMode
          ? 'Checked = received (added to collection). Unchecked = skipped. Bundles cannot be partially selected.'
          : 'Checked = received (added to collection). Unchecked = skipped.'}
      </p>

      <div className="flex items-center gap-3">
        <label className="text-xs text-stone-400 whitespace-nowrap">Add as:</label>
        <select
          value={backfillOwnershipStatus}
          onChange={e => setBackfillOwnershipStatus(e.target.value as 'OWNED' | 'PREORDER')}
          className="bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
        >
          <option value="OWNED">Owned</option>
          <option value="PREORDER">Pre-order</option>
        </select>
      </div>

      <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
        {isBundleMode ? (
          /* Bundle groups */
          bundleGroups.map(bundle => {
            const bundleMonthIds = bundle.items.map(m => m.id)
            const allBundleSelected = bundleMonthIds.every(id => choices[id] === 'selected')
            const allBooks = bundle.items.flatMap(m => m.books.filter(b => b.edition))
            const uniqueBooks = allBooks.filter((b, i, arr) => arr.findIndex(x => x.edition?.id === b.edition?.id) === i)
            const mainBook = uniqueBooks.find(b => b.isMainBook && b.edition) ?? uniqueBooks[0]
            const authorName = mainBook?.edition?.book?.authors?.[0]?.author?.name
            return (
              <label key={bundle.key} className="flex items-start gap-3 border border-stone-700 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-stone-800/40">
                <input
                  type="checkbox"
                  checked={allBundleSelected}
                  onChange={() => toggleBundle(bundleMonthIds)}
                  className="mt-0.5 rounded border-stone-600 bg-stone-800 text-amber-600 focus:ring-amber-600/30"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-100">{bundle.label}</p>
                  {authorName && <p className="text-xs text-stone-400 mt-0.5">{authorName}</p>}
                  {uniqueBooks.length > 1 && (
                    <div className="mt-1 space-y-0.5">
                      {uniqueBooks.map((b, i) => (
                        <p key={i} className="text-xs text-stone-500">
                          {editionDisplayTitle(b.edition) ?? '—'}
                          {b.edition?.book?.authors?.[0]?.author?.name
                            ? <span className="text-stone-600"> · {b.edition.book.authors[0].author.name}</span>
                            : null}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {mainBook?.edition?.additionalImages?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cloudinaryUrl(mainBook.edition.additionalImages[0], 'w_60,h_80,c_fill,q_auto,f_auto') ?? ''}
                    alt=""
                    className="w-10 h-14 object-cover rounded shrink-0"
                  />
                )}
              </label>
            )
          })
        ) : (
          <>
            {/* Series groups */}
            {Array.from(seriesGroups.values()).map(({ series, months }) => (
              <div key={series!.id} className="border border-stone-700 rounded-lg overflow-hidden">
                <div className="bg-stone-800/60 px-3 py-1.5 text-xs font-medium text-amber-400 uppercase tracking-wider">
                  {series!.name}
                </div>
                {months.map(m => (
                  <MonthRow key={m.id} month={m} checked={choices[m.id] === 'selected'} onToggle={() => toggle(m.id)} bookPrices={bookPrices} onPriceChange={(k, v) => setBookPrices(prev => ({ ...prev, [k]: v }))} choicePicks={choicePicks} onChoicePick={onChoicePick} choiceGroupMeta={choiceGroupMeta} />
                ))}
              </div>
            ))}

            {/* Standalone months */}
            {standalone.map(m => (
              <MonthRow key={m.id} month={m} checked={choices[m.id] === 'selected'} onToggle={() => toggle(m.id)} bookPrices={bookPrices} onPriceChange={(k, v) => setBookPrices(prev => ({ ...prev, [k]: v }))} choicePicks={choicePicks} onChoicePick={onChoicePick} choiceGroupMeta={choiceGroupMeta} />
            ))}
          </>
        )}
      </div>

      {hasUnresolvedChoices && (
        <p className="text-xs text-amber-400">Pick which book you received for the highlighted month(s) above before continuing.</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={submitting || hasUnresolvedChoices}
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

function MonthRow({ month, checked, onToggle, bookPrices, onPriceChange, choicePicks, onChoicePick, choiceGroupMeta }: {
  month: SubscriptionMonth
  checked: boolean
  onToggle: () => void
  bookPrices: Record<string, string>
  onPriceChange: (key: string, val: string) => void
  choicePicks: Record<string, string[]>
  onChoicePick: (groupId: string, monthBookIds: string[]) => void
  choiceGroupMeta: Record<string, ChoiceGroupMeta>
}) {
  const mainBook = month.books.find(b => b.isMainBook && b.edition) ?? month.books.find(b => b.edition)
  const allBooks = month.books.filter(b => b.edition)
  const authorName = mainBook?.edition?.book?.authors?.[0]?.author?.name
  const isMultiBook = allBooks.length > 1

  const choiceGroups = new Map<string, MonthBook[]>()
  for (const b of allBooks) {
    if (!b.choiceGroupId) continue
    if (!choiceGroups.has(b.choiceGroupId)) choiceGroups.set(b.choiceGroupId, [])
    choiceGroups.get(b.choiceGroupId)!.push(b)
  }

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
                {editionDisplayTitle(mainBook?.edition) ?? '—'}
              </p>
              {authorName && <p className="text-xs text-stone-400 truncate">{authorName}</p>}
            </>
          ) : (
            <ul className="space-y-0.5">
              {allBooks.map(b => (
                <li key={b.editionId ?? b.bookId} className="text-sm text-stone-100 leading-snug truncate">
                  {editionDisplayTitle(b.edition) ?? '—'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </label>

      {/* Choice groups: force the user to say which edition they actually received before
          this month can be marked as selected — this is what replaces an admin having to
          set it later (which required a user ID admins don't have easy access to). */}
      {checked && choiceGroups.size > 0 && (
        <div className="px-3 pb-3 space-y-2">
          {Array.from(choiceGroups.entries()).map(([groupId, books]) => {
            const meta = choiceGroupMeta[groupId]
            const allowMultiple = meta?.allowMultiple ?? true
            const picked = choicePicks[groupId] ?? []
            const unresolved = picked.length === 0
            return (
              <div key={groupId} className={`rounded-lg border p-2 space-y-1 ${unresolved ? 'border-amber-500/60 bg-amber-500/5' : 'border-stone-700 bg-stone-800/40'}`}>
                <p className="text-[10px] uppercase tracking-wider text-amber-400">
                  {meta?.label || 'Which did you receive?'}
                  {unresolved && <span className="text-amber-300 normal-case"> — required</span>}
                </p>
                {books.map(b => (
                  <label key={b.id} className="flex items-center gap-2 text-xs text-stone-200 cursor-pointer">
                    <input
                      type={allowMultiple ? 'checkbox' : 'radio'}
                      name={`choice-${groupId}`}
                      checked={picked.includes(b.id)}
                      onChange={e => onChoicePick(
                        groupId,
                        allowMultiple
                          ? (e.target.checked ? [...picked, b.id] : picked.filter(id => id !== b.id))
                          : [b.id],
                      )}
                    />
                    {editionDisplayTitle(b.edition) ?? '—'}
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Per-book price inputs temporarily removed: they're misleading — all books in a month
          share one UserPurchaseGroup/totalAmount, there's no real per-book price to set (see
          project_backfill_per_book_price_bug memory). bookPrices state/payload wiring is left
          in place since nothing can populate it without this UI; revisit once that's resolved. */}
    </div>
  )
}

// ── Step 3: Billing batches (prepay) ─────────────────────────────────────────

interface Step3Props {
  selectedMonthIds: string[]
  bookPrices: Record<string, string>
  backfillOwnershipStatus?: 'OWNED' | 'PREORDER'
  choicePicks: Record<string, string[]>
  selectedPrepayOption: { id: string; months: number; price: number | string; label: string | null } | null
  allPrepayOptions: { id: string; months: number; price: number | string; currency: string; validFrom?: string | null; validUntil?: string | null }[]
  subscriptionSlug: string
  entryFees: { name: string; amount: string; currency: string }[]
  entry: JoinResult['entry']
  eligibleMonths: SubscriptionMonth[]
  /** When true, skip the "Did you change billing periods?" question and go straight to manual entry */
  initiallyChanged?: boolean
  onDone: () => void
  onBack: () => void
  onBeforeBackfill?: () => Promise<void>
}

function Step3({ selectedMonthIds, bookPrices, backfillOwnershipStatus, choicePicks, selectedPrepayOption, allPrepayOptions, subscriptionSlug, entryFees, entry, eligibleMonths, initiallyChanged, onDone, onBack, onBeforeBackfill }: Step3Props) {
  const currency = entry.costCurrency ?? 'USD'
  const renewalDay = entry.renewalDay

  // did the user change periods during their subscription?
  // If initiallyChanged=true (monthly user who told us they changed), start in the "Yes" path
  const [didChange, setDidChange] = useState<boolean | null>(initiallyChanged ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feeTemplates, setFeeTemplates] = useState<ApiFeeTemplate[]>([])
  const [addFeePickerBatch, setAddFeePickerBatch] = useState<number | null>(null)
  const [addFeePickerRow, setAddFeePickerRow] = useState<number | null>(null)

  useEffect(() => {
    getFeeTemplates(true).then(ts => setFeeTemplates(Array.isArray(ts) ? ts : [])).catch(() => {})
  }, [])

  // ── "No" path: auto-computed batches (only when a prepay option is known) ─────
  const prepayMonths = selectedPrepayOption?.months ?? 1
  // Use entry.basePrice as fallback so custom-currency users get their own entered price
  const noPathFallbackPrice = resolveBackfillFallbackPrice(entry.basePrice, selectedPrepayOption?.price)
  const autoBatches = selectedPrepayOption ? computeAutoBatches(
    eligibleMonths,
    selectedMonthIds,
    prepayMonths,
    renewalDay,
    currency,
    allPrepayOptions,
    noPathFallbackPrice,
    entry.startDate,
  ) : []

  // Per-batch editable overrides for the "No" path (amount, shipping, fees, discounts)
  type AutoBatchFee = { name: string; amount: string; currency: string; isCustom?: boolean }
  type AutoBatchOverride = { amount: string; shipping: string; fees: AutoBatchFee[]; discounts: { name: string; amount: string; currency: string }[] }
  const [autoBatchOverrides, setAutoBatchOverrides] = useState<AutoBatchOverride[]>(() =>
    autoBatches.map(b => ({
      amount: b.amount,
      shipping: entry.shippingCost ? String(entry.shippingCost) : '',
      fees: entryFees.map(f => ({ ...f, isCustom: false as const })),
      discounts: [],
    })),
  )

  function updateAutoOverride(i: number, field: 'amount' | 'shipping', val: string) {
    setAutoBatchOverrides(prev => prev.map((o, j) => j === i ? { ...o, [field]: val } : o))
  }
  function updateAutoOverrideFee(batchIdx: number, feeIdx: number, field: 'amount' | 'currency' | 'name', val: string) {
    setAutoBatchOverrides(prev => prev.map((o, j) => {
      if (j !== batchIdx) return o
      const fees = o.fees.map((f, k) => k === feeIdx ? { ...f, [field]: val } : f)
      return { ...o, fees }
    }))
  }
  function addAutoOverrideFee(batchIdx: number, tmpl: ApiFeeTemplate | null) {
    const newFee: AutoBatchFee = tmpl
      ? { name: tmpl.name, amount: tmpl.defaultAmount != null ? String(tmpl.defaultAmount) : '', currency: tmpl.defaultCurrency, isCustom: false }
      : { name: '', amount: '', currency, isCustom: true }
    setAutoBatchOverrides(prev => prev.map((o, j) => j === batchIdx ? { ...o, fees: [...o.fees, newFee] } : o))
  }
  function removeAutoOverrideFee(batchIdx: number, feeIdx: number) {
    setAutoBatchOverrides(prev => prev.map((o, j) => j === batchIdx ? { ...o, fees: o.fees.filter((_, k) => k !== feeIdx) } : o))
  }
  function addAutoOverrideDiscount(batchIdx: number) {
    setAutoBatchOverrides(prev => prev.map((o, j) => j === batchIdx ? { ...o, discounts: [...o.discounts, { name: '', amount: '', currency }] } : o))
  }
  function updateAutoOverrideDiscount(batchIdx: number, discIdx: number, field: 'name' | 'amount' | 'currency', val: string) {
    setAutoBatchOverrides(prev => prev.map((o, j) => {
      if (j !== batchIdx) return o
      const discounts = o.discounts.map((d, k) => k === discIdx ? { ...d, [field]: val } : d)
      return { ...o, discounts }
    }))
  }
  function removeAutoOverrideDiscount(batchIdx: number, discIdx: number) {
    setAutoBatchOverrides(prev => prev.map((o, j) => j === batchIdx ? { ...o, discounts: o.discounts.filter((_, k) => k !== discIdx) } : o))
  }

  // ── "Yes" path: user-provided dates ──────────────────────────────────────
  type YesFee = { name: string; amount: string; currency: string; isCustom?: boolean }
  type YesRow = { date: string; amount: string; shipping: string; fees: YesFee[]; discounts: { name: string; amount: string; currency: string }[] }
  const [yesRows, setYesRows] = useState<YesRow[]>(() => {
    const expected = Math.ceil(selectedMonthIds.length / (selectedPrepayOption?.months ?? 1))
    return Array.from({ length: Math.max(expected, 1) }, () => ({
      date: '',
      amount: '',
      shipping: '',
      fees: entryFees.map(f => ({ name: f.name, amount: f.amount, currency: f.currency, isCustom: false as const })),
      discounts: [],
    }))
  })

  // Once feeTemplates load, prefill fee amounts from template defaultAmount where available
  // (only fills empty amounts — user-entered values from entryFees are preserved)
  useEffect(() => {
    if (feeTemplates.length === 0) return
    setYesRows(prev => prev.map(row => ({
      ...row,
      fees: row.fees.map(fee => {
        if (fee.amount !== '') return fee // already has a value, don't overwrite
        const tmpl = feeTemplates.find(t => t.name === fee.name)
        if (tmpl && tmpl.defaultAmount != null) return { ...fee, amount: String(tmpl.defaultAmount) }
        return fee
      }),
    })))
  }, [feeTemplates])

  function addRow() { setYesRows(prev => [...prev, { date: '', amount: '', shipping: '', fees: entryFees.map(f => ({ name: f.name, amount: f.amount, currency: f.currency, isCustom: false as const })), discounts: [] }]) }
  function removeRow(i: number) { setYesRows(prev => prev.filter((_, j) => j !== i)) }
  function updateRow(i: number, field: 'date' | 'amount' | 'shipping', val: string) {
    setYesRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: val } : r))
  }
  function updateRowFee(rowIdx: number, feeIdx: number, field: 'name' | 'amount' | 'currency', val: string) {
    setYesRows(prev => prev.map((r, j) => {
      if (j !== rowIdx) return r
      const fees = r.fees.map((f, k) => k === feeIdx ? { ...f, [field]: val } : f)
      return { ...r, fees }
    }))
  }
  function addRowFee(rowIdx: number, tmpl: ApiFeeTemplate | null) {
    const newFee: YesFee = tmpl
      ? { name: tmpl.name, amount: tmpl.defaultAmount != null ? String(tmpl.defaultAmount) : '', currency: tmpl.defaultCurrency, isCustom: false }
      : { name: '', amount: '', currency, isCustom: true }
    setYesRows(prev => prev.map((r, j) => j === rowIdx ? { ...r, fees: [...r.fees, newFee] } : r))
  }
  function removeRowFee(rowIdx: number, feeIdx: number) {
    setYesRows(prev => prev.map((r, j) => j === rowIdx ? { ...r, fees: r.fees.filter((_, k) => k !== feeIdx) } : r))
  }
  function addRowDiscount(rowIdx: number) {
    setYesRows(prev => prev.map((r, j) => j === rowIdx ? { ...r, discounts: [...r.discounts, { name: '', amount: '', currency }] } : r))
  }
  function updateRowDiscount(rowIdx: number, discIdx: number, field: 'name' | 'amount' | 'currency', val: string) {
    setYesRows(prev => prev.map((r, j) => {
      if (j !== rowIdx) return r
      const discounts = r.discounts.map((d, k) => k === discIdx ? { ...d, [field]: val } : d)
      return { ...r, discounts }
    }))
  }
  function removeRowDiscount(rowIdx: number, discIdx: number) {
    setYesRows(prev => prev.map((r, j) => j === rowIdx ? { ...r, discounts: r.discounts.filter((_, k) => k !== discIdx) } : r))
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
      const billingBatches = autoBatches.map((b, i) => {
        const override = autoBatchOverrides[i]
        const baseAmount = parseDecimalInput(override?.amount || b.amount)
        const shippingAmt = override?.shipping ? parseDecimalInput(override.shipping) : null
        const batchFees = (override?.fees ?? []).filter(f => f.name && f.amount)
        const batchDiscounts = (override?.discounts ?? []).filter(d => d.name && d.amount)
        return {
          billedAt: b.billingDate,
          baseAmount,
          monthsCovered: b.monthIds.length,
          currency: b.currency,
          monthIds: b.monthIds,
          ...(shippingAmt !== null && { shippingAmount: shippingAmt }),
          ...(batchFees.length > 0 && {
            fees: batchFees.map(f => ({ name: f.name, amount: parseDecimalInput(f.amount), currency: f.currency })),
          }),
          ...(batchDiscounts.length > 0 && {
            discounts: batchDiscounts.map(d => ({ name: d.name, amount: parseDecimalInput(d.amount), currency: d.currency })),
          }),
        }
      })
      if (onBeforeBackfill) await onBeforeBackfill()
      await submitChoicePicks(subscriptionSlug, eligibleMonths, selectedMonthIds, choicePicks)
      await authFetch(`/subscriptions/${subscriptionSlug}/join/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedMonthIds,
          skippedMonthIds,
          ...(backfillOwnershipStatus && { backfillOwnershipStatus }),
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
    if (yesRows.some(r => r.date && !isValidCalendarDate(r.date))) {
      setError('One or more payment dates is invalid')
      return
    }
    setSubmitting(true); setError(null)
    try {
      const skippedMonthIds = eligibleMonths.filter(m => !selectedMonthIds.includes(m.id)).map(m => m.id)
      const bookPricesPayload = buildBookPricesPayload()
      const billingBatches = yesBatches
        .filter(b => b.row.date && b.months.length > 0)
        .map(b => {
          const providedAmount = b.row.amount ? parseDecimalInput(b.row.amount) : null
          // Always use entry.basePrice as fallback: it reflects the user's actual currency
          // and custom price from Step 1 (whether from price history or manually entered).
          const fallbackBase = parseDecimalInput(
            resolveBackfillFallbackPrice(entry.basePrice, selectedPrepayOption?.price),
          )
          const baseAmount = providedAmount !== null ? providedAmount : fallbackBase
          const shippingAmt = b.row.shipping ? parseDecimalInput(b.row.shipping) : null
          const rowFees = b.row.fees.filter(f => f.name && f.amount)
          const rowDiscounts = b.row.discounts.filter(d => d.name && d.amount)
          return {
            billedAt: b.row.date,
            baseAmount,
            monthsCovered: b.months.length,
            currency,
            monthIds: b.months.map(m => m.id),
            ...(shippingAmt !== null && { shippingAmount: shippingAmt }),
            ...(rowFees.length > 0 && {
              fees: rowFees.map(f => ({
                name: f.name, amount: parseDecimalInput(f.amount), currency: f.currency,
              })),
            }),
            ...(rowDiscounts.length > 0 && {
              discounts: rowDiscounts.map(d => ({
                name: d.name, amount: parseDecimalInput(d.amount), currency: d.currency,
              })),
            }),
          }
        })
      if (onBeforeBackfill) await onBeforeBackfill()
      await submitChoicePicks(subscriptionSlug, eligibleMonths, selectedMonthIds, choicePicks)
      await authFetch(`/subscriptions/${subscriptionSlug}/join/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedMonthIds,
          skippedMonthIds,
          ...(backfillOwnershipStatus && { backfillOwnershipStatus }),
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
    const periodLabel = selectedPrepayOption
      ? (selectedPrepayOption.label ?? `${selectedPrepayOption.months}-month prepay`)
      : 'monthly'
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-serif text-stone-100 font-semibold">Billing periods</h3>
          <button onClick={onBack} className="text-xs text-stone-500 hover:text-stone-300">← Back</button>
        </div>
        {selectedPrepayOption && (
          <div className="rounded-lg border border-stone-700/60 bg-stone-800/40 p-4 text-sm text-stone-300">
            <p className="font-medium text-stone-100 mb-1">
              {periodLabel}
            </p>
            <p className="text-xs text-stone-500">
              {selectedMonthIds.length} received box{selectedMonthIds.length !== 1 ? 'es' : ''} →{' '}
              {autoBatches.length} billing period{autoBatches.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
        <p className="text-sm text-stone-300">Did your billing periods ever change during your subscription?</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              if (!selectedPrepayOption) {
                // Monthly user, no billing changes — save directly
                void submitAuto()
              } else {
                setDidChange(false)
              }
            }}
            className="w-full py-3 px-4 rounded-lg border border-stone-600 hover:border-amber-500 text-stone-200 text-sm text-left transition-colors hover:bg-amber-500/5"
          >
            <span className="font-medium text-stone-100">No, all payments were {periodLabel}</span>
            <span className="block text-xs text-stone-500 mt-0.5">
              {selectedPrepayOption
                ? 'We\'ll auto-calculate billing dates from your start date and skips'
                : 'Save subscription with your selected months'}
            </span>
          </button>
          <button
            onClick={() => setDidChange(true)}
            className="w-full py-3 px-4 rounded-lg border border-stone-600 hover:border-amber-500 text-stone-200 text-sm text-left transition-colors hover:bg-amber-500/5"
          >
            <span className="font-medium text-stone-100">Yes, I used different billing periods</span>
            <span className="block text-xs text-stone-500 mt-0.5">Enter actual payment dates; we&apos;ll look up amounts from price history</span>
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {submitting && <p className="text-sm text-stone-500">Saving…</p>}
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
          Amounts are preset from your prepay option — adjust shipping and fees as needed.
        </p>
        <div className="space-y-3">
          {autoBatches.map((b, i) => {
            const months = b.monthIds.map(id => monthMap.get(id)).filter(Boolean) as SubscriptionMonth[]
            const override = autoBatchOverrides[i] ?? { amount: b.amount, shipping: '', fees: [] }
            return (
              <div key={i} className="border border-stone-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-400">Billing period {i + 1}</span>
                  <span className="text-xs text-stone-400">{b.billingDate}</span>
                </div>
                <p className="text-xs text-stone-400">{months.map(m => `${MONTH_NAMES[m.month - 1]} ${m.year}`).join(', ')}
                  {months.length < (selectedPrepayOption?.months ?? Infinity) && (
                    <span className="text-stone-500"> ({months.length}/{selectedPrepayOption?.months ?? '?'} boxes)</span>
                  )}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-stone-500 w-14 shrink-0">Amount</span>
                  <input
                    type="number" step="0.01"
                    value={override.amount}
                    onChange={e => updateAutoOverride(i, 'amount', e.target.value)}
                    className="w-24 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                  />
                  <span className="text-xs text-stone-500 w-14 shrink-0">Shipping</span>
                  <input
                    type="number" step="0.01"
                    value={override.shipping}
                    onChange={e => updateAutoOverride(i, 'shipping', e.target.value)}
                    placeholder="0.00"
                    className="w-24 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                  />
                  <span className="text-xs text-stone-500">{currency}</span>
                </div>
                {override.fees.length > 0 && (
                  <div className="space-y-1 pl-2">
                    {override.fees.map((fee, fi) => (
                      <div key={fi} className="flex items-center gap-1">
                        <span className="text-[10px] text-stone-500 w-10 shrink-0">Fee</span>
                        {fee.isCustom ? (
                          <input
                            type="text"
                            value={fee.name}
                            onChange={e => updateAutoOverrideFee(i, fi, 'name', e.target.value)}
                            placeholder="Fee name"
                            className="flex-1 bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-100 text-[10px]"
                          />
                        ) : (
                          <span className="flex-1 text-stone-300 text-[10px] px-2">{fee.name || '—'}</span>
                        )}
                        <input
                          type="number" step="0.01"
                          value={fee.amount}
                          onChange={e => updateAutoOverrideFee(i, fi, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="w-20 bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-100 text-[10px]"
                        />
                        <select
                          value={fee.currency}
                          onChange={e => updateAutoOverrideFee(i, fi, 'currency', e.target.value)}
                          className="w-16 bg-stone-800 border border-stone-700 rounded px-1 py-0.5 text-stone-100 text-[10px]"
                        >
                          {CURRENCY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                          {!CURRENCY_LIST.includes(fee.currency) && fee.currency && <option value={fee.currency}>{fee.currency}</option>}
                        </select>
                        <button onClick={() => removeAutoOverrideFee(i, fi)} className="text-red-400 hover:text-red-300 text-[10px] px-1">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {override.discounts.length > 0 && (
                  <div className="space-y-1 pl-2">
                    {override.discounts.map((disc, di) => (
                      <div key={di} className="flex items-center gap-1">
                        <span className="text-[10px] text-stone-500 w-10 shrink-0">Disc</span>
                        <input
                          type="text"
                          value={disc.name}
                          onChange={e => updateAutoOverrideDiscount(i, di, 'name', e.target.value)}
                          placeholder="Discount name"
                          className="flex-1 bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-100 text-[10px]"
                        />
                        <input
                          type="number" step="0.01"
                          value={disc.amount}
                          onChange={e => updateAutoOverrideDiscount(i, di, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="w-20 bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-100 text-[10px]"
                        />
                        <select
                          value={disc.currency}
                          onChange={e => updateAutoOverrideDiscount(i, di, 'currency', e.target.value)}
                          className="w-16 bg-stone-800 border border-stone-700 rounded px-1 py-0.5 text-stone-100 text-[10px]"
                        >
                          {CURRENCY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                          {!CURRENCY_LIST.includes(disc.currency) && disc.currency && <option value={disc.currency}>{disc.currency}</option>}
                        </select>
                        <button onClick={() => removeAutoOverrideDiscount(i, di)} className="text-red-400 hover:text-red-300 text-[10px] px-1">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-3">
                  {addFeePickerBatch === i ? (
                  <select
                    autoFocus
                    className="text-[10px] bg-stone-800 border border-stone-600 rounded px-2 py-0.5 text-stone-200"
                    defaultValue=""
                    onChange={e => {
                      const val = e.target.value
                      if (!val) return
                      const tmpl = feeTemplates.find(t => t.id === val); if (tmpl) addAutoOverrideFee(i, tmpl)
                      setAddFeePickerBatch(null)
                    }}
                    onBlur={() => setAddFeePickerBatch(null)}
                  >
                    <option value="" disabled>— pick template —</option>
                    {feeTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  ) : (
                    <button onClick={() => setAddFeePickerBatch(i)} className="text-[10px] text-amber-600 hover:text-amber-400">+ fee</button>
                  )}
                  <button onClick={() => addAutoOverrideDiscount(i)} className="text-[10px] text-blue-400 hover:text-blue-300">+ discount</button>
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
          const prepayPriceStr = String(selectedPrepayOption?.price ?? 0)
          const autoAmount = row.date
            ? parseFloat(prepayPriceStr).toFixed(2)
            : null
          return (
            <div key={i} className="border border-stone-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 w-16 shrink-0">Shipping</span>
                <input
                  type="number"
                  step="0.01"
                  value={row.shipping}
                  onChange={e => updateRow(i, 'shipping', e.target.value)}
                  placeholder="0.00"
                  className="w-24 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                />
                <span className="text-xs text-stone-500">{currency}</span>
              </div>
              {batchMonths.length > 0 && (
                <p className="text-[10px] text-stone-500 pl-18">
                  Boxes: {batchMonths.map(m => `${MONTH_NAMES[m.month - 1]} ${m.year}`).join(', ')}
                </p>
              )}
              {/* Fees and discounts per payment */}
              <div className="pl-2 space-y-1">
                {row.fees.map((fee, fi) => (
                  <div key={fi} className="flex items-center gap-1">
                    <span className="text-[10px] text-stone-500 w-10 shrink-0">Fee</span>
                    {fee.isCustom ? (
                      <input
                        type="text"
                        value={fee.name}
                        onChange={e => updateRowFee(i, fi, 'name', e.target.value)}
                        placeholder="Fee name"
                        className="flex-1 bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-100 text-[10px]"
                      />
                    ) : (
                      <span className="flex-1 text-stone-300 text-[10px] px-2">{fee.name || '—'}</span>
                    )}
                    <input
                      type="number"
                      step="0.01"
                      value={fee.amount}
                      onChange={e => updateRowFee(i, fi, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="w-20 bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-100 text-[10px]"
                    />
                    <select
                      value={fee.currency}
                      onChange={e => updateRowFee(i, fi, 'currency', e.target.value)}
                      className="w-16 bg-stone-800 border border-stone-700 rounded px-1 py-0.5 text-stone-100 text-[10px]"
                    >
                      {CURRENCY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                      {!CURRENCY_LIST.includes(fee.currency) && fee.currency && <option value={fee.currency}>{fee.currency}</option>}
                    </select>
                    <button onClick={() => removeRowFee(i, fi)} className="text-red-400 hover:text-red-300 text-[10px] px-1">✕</button>
                  </div>
                ))}
                {row.discounts.map((disc, di) => (
                  <div key={`d${di}`} className="flex items-center gap-1">
                    <span className="text-[10px] text-stone-500 w-10 shrink-0">Disc</span>
                    <input
                      type="text"
                      value={disc.name}
                      onChange={e => updateRowDiscount(i, di, 'name', e.target.value)}
                      placeholder="Discount name"
                      className="flex-1 bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-100 text-[10px]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={disc.amount}
                      onChange={e => updateRowDiscount(i, di, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="w-20 bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-100 text-[10px]"
                    />
                    <select
                      value={disc.currency}
                      onChange={e => updateRowDiscount(i, di, 'currency', e.target.value)}
                      className="w-16 bg-stone-800 border border-stone-700 rounded px-1 py-0.5 text-stone-100 text-[10px]"
                    >
                      {CURRENCY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                      {!CURRENCY_LIST.includes(disc.currency) && disc.currency && <option value={disc.currency}>{disc.currency}</option>}
                    </select>
                    <button onClick={() => removeRowDiscount(i, di)} className="text-red-400 hover:text-red-300 text-[10px] px-1">✕</button>
                  </div>
                ))}
                <div className="flex gap-3">
                  {addFeePickerRow === i ? (
                    <select
                      autoFocus
                      className="text-[10px] bg-stone-800 border border-stone-600 rounded px-2 py-0.5 text-stone-200"
                      defaultValue=""
                      onChange={e => {
                        const val = e.target.value
                        if (!val) return
                        const tmpl = feeTemplates.find(t => t.id === val); if (tmpl) addRowFee(i, tmpl)
                        setAddFeePickerRow(null)
                      }}
                      onBlur={() => setAddFeePickerRow(null)}
                    >
                      <option value="" disabled>— pick template —</option>
                      {feeTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : (
                    <button onClick={() => setAddFeePickerRow(i)} className="text-[10px] text-amber-600 hover:text-amber-400">+ fee</button>
                  )}
                  <button onClick={() => addRowDiscount(i)} className="text-[10px] text-blue-400 hover:text-blue-300">+ discount</button>
                </div>
              </div>
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
  subscriptionRenewalMonthOffset,
  subscriptionPrice,
  subscriptionOriginalBasePrice,
  userDefaultTaxRate,
  userDefaultCurrency,
  prepayOptions,
  isDiscontinued,
  subscriptionEndDate,
  signupIncludesCurrentMonth,
  isBundleSubscription,
  hasBookChoiceMonths,
  intervalMonths,
  startingMonth,
  onJoined,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 'chooseFirstBox' | 2 | 3 | 'done'>(1)
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null)
  const [finalEligibleMonths, setFinalEligibleMonths] = useState<SubscriptionMonth[] | null>(null)
  const [step2Data, setStep2Data] = useState<{ selectedMonthIds: string[]; bookPrices: Record<string, string>; backfillOwnershipStatus: 'OWNED' | 'PREORDER'; choicePicks: Record<string, string[]> } | null>(null)
  const [step1Fees, setStep1Fees] = useState<{ name: string; amount: string; currency: string }[]>([])
  const [step1PriceChanges, setStep1PriceChanges] = useState<PriceChange[]>([])
  const [step1SelectedPrepayOption, setStep1SelectedPrepayOption] = useState<{ id: string; months: number; price: number | string; label: string | null } | null>(null)
  const [step1JoinPayload, setStep1JoinPayload] = useState<JoinSubscriptionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const handleStep1 = useCallback(async (data: Step1FormData) => {
    setError(null)
    setJoining(true)
    try {
      const joinPayload: JoinSubscriptionData = {
        startDate: data.startDate,
        costCurrency: data.costCurrency,
        basePrice: data.basePrice || undefined,
        shippingCost: data.shippingCost || undefined,
        isForwarding: data.isForwarding,
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
        selectedPrepayOptionId: data.selectedPrepayOptionId ?? null,
      }

      // Dry run: preview eligible months WITHOUT creating the subscription entry
      const result = await authFetch<JoinResult>(`/subscriptions/${subscriptionSlug}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...joinPayload, dryRun: true }),
      })

      setStep1JoinPayload(joinPayload)
      setJoinResult(result)
      setStep1Fees(data.resolvedFees ?? [])
      setStep1PriceChanges(data.priceChanges ?? [])
      if (data.selectedPrepayOptionId) {
        const opt = prepayOptions?.find(o => o.id === data.selectedPrepayOptionId) ?? null
        setStep1SelectedPrepayOption(opt ? { id: opt.id, months: opt.months, price: opt.price, label: opt.label } : null)
      } else {
        setStep1SelectedPrepayOption(null)
      }

      // Mandatory first-box picker step always comes next — regardless of subscription type
      // (monthly, bundle, prepay) and regardless of whether there's anything to backfill yet.
      setStep('chooseFirstBox')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }, [subscriptionSlug])

  const handleChooseFirstBox = useCallback(async (firstBoxYear: number, firstBoxMonth: number, adjustedEligibleMonths: SubscriptionMonth[]) => {
    setStep1JoinPayload(prev => prev ? { ...prev, firstBoxYear, firstBoxMonth } : prev)
    setFinalEligibleMonths(adjustedEligibleMonths)
    if (adjustedEligibleMonths.length > 0) {
      setStep(2)
    } else if (step1JoinPayload) {
      // Nothing to backfill: do the real join immediately and finish
      setJoining(true)
      try {
        await performRealJoin({ ...step1JoinPayload, firstBoxYear, firstBoxMonth })
        setStep('done')
        onJoined()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to join')
      } finally {
        setJoining(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step1JoinPayload, onJoined])

  /** Executes the real join (creates subscription entry with prepaidMonths + scheduledPrepayOptionId set atomically) */
  const performRealJoin = useCallback(async (
    payload: JoinSubscriptionData,
    _selectedPrepayOptionId?: string | null,
  ) => {
    await authFetch(`/subscriptions/${subscriptionSlug}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }, [subscriptionSlug])

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
              subscriptionRenewalMonthOffset={subscriptionRenewalMonthOffset}
              subscriptionPrice={subscriptionPrice}
              subscriptionOriginalBasePrice={subscriptionOriginalBasePrice}
              userDefaultTaxRate={userDefaultTaxRate}
              userDefaultCurrency={userDefaultCurrency}
              prepayOptions={prepayOptions}
              isDiscontinued={isDiscontinued}
              subscriptionEndDate={subscriptionEndDate}
              signupIncludesCurrentMonth={signupIncludesCurrentMonth}
              onNext={handleStep1}
            />
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </>
        )}

        {!joining && step === 'chooseFirstBox' && joinResult && (
          <StepChooseFirstBox
            eligibleMonths={joinResult.eligibleMonths}
            previousBoxMonths={joinResult.previousBoxMonths ?? []}
            defaultFirstBoxYear={joinResult.defaultFirstBoxYear ?? new Date().getFullYear()}
            defaultFirstBoxMonth={joinResult.defaultFirstBoxMonth ?? new Date().getMonth() + 1}
            isBundleMode={(isBundleSubscription ?? false) && (intervalMonths ?? 1) > 1}
            intervalMonths={intervalMonths ?? 1}
            startingMonth={startingMonth ?? 1}
            onConfirm={handleChooseFirstBox}
            onBack={() => setStep(1)}
          />
        )}

        {!joining && step === 2 && joinResult && finalEligibleMonths && finalEligibleMonths.length > 0 && (
          <Step2
            eligibleMonths={finalEligibleMonths}
            subscriptionSlug={subscriptionSlug}
            entry={joinResult.entry}
            hasPrepayOptions={(prepayOptions?.length ?? 0) > 0}
            isBundleSubscription={isBundleSubscription}
            intervalMonths={intervalMonths}
            startingMonth={startingMonth}
            onDone={() => { setStep('done'); onJoined() }}
            onBack={() => setStep('chooseFirstBox')}
            onSkip={async () => {
              if (step1JoinPayload) {
                try { await performRealJoin(step1JoinPayload) } catch { /* ignore */ }
              }
              setStep('done')
              onJoined()
            }}
            onNextWithBilling={(step1SelectedPrepayOption || (prepayOptions?.length ?? 0) > 0)
              ? (data) => {
                  setStep2Data(data)
                  if (step1SelectedPrepayOption && data.selectedMonthIds.length < step1SelectedPrepayOption.months) {
                    // Partial prepay period — skip step 3, backfill months+skips without billing batches
                    const skippedMonthIds = (finalEligibleMonths ?? [])
                      .filter(m => !data.selectedMonthIds.includes(m.id))
                      .map(m => m.id)
                    const doJoinAndBackfill = async () => {
                      if (step1JoinPayload) {
                        await performRealJoin(step1JoinPayload)
                      }
                      await submitChoicePicks(subscriptionSlug, finalEligibleMonths ?? [], data.selectedMonthIds, data.choicePicks)
                      await authFetch(`/subscriptions/${subscriptionSlug}/join/backfill`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ selectedMonthIds: data.selectedMonthIds, skippedMonthIds, backfillOwnershipStatus: data.backfillOwnershipStatus }),
                      })
                    }
                    doJoinAndBackfill()
                      .then(() => { setStep('done'); onJoined() })
                      .catch(() => { setStep('done'); onJoined() })
                  } else {
                    setStep(3)
                  }
                }
              : undefined
            }
            onBeforeBackfill={step1JoinPayload
              ? () => performRealJoin(step1JoinPayload)
              : undefined
            }
          />
        )}

        {!joining && step === 3 && joinResult && step2Data && finalEligibleMonths && (step1SelectedPrepayOption || (prepayOptions?.length ?? 0) > 0) && (
          <Step3
            selectedMonthIds={step2Data.selectedMonthIds}
            bookPrices={step2Data.bookPrices}
            backfillOwnershipStatus={step2Data.backfillOwnershipStatus}
            choicePicks={step2Data.choicePicks}
            selectedPrepayOption={step1SelectedPrepayOption}
            allPrepayOptions={prepayOptions ?? []}
            subscriptionSlug={subscriptionSlug}
            entryFees={step1Fees}
            entry={joinResult.entry}
            eligibleMonths={finalEligibleMonths}
            onDone={() => { setStep('done'); onJoined() }}
            onBack={() => setStep(2)}
            onBeforeBackfill={step1JoinPayload
              ? () => performRealJoin(step1JoinPayload)
              : undefined
            }
          />
        )}

        {step === 'done' && (
          <div className="text-center py-8 space-y-3">
            <p className="text-2xl">🎉</p>
            <p className="text-stone-100 font-medium">You&apos;re subscribed!</p>
            {hasBookChoiceMonths && (
              <p className="text-xs text-stone-400 max-w-xs mx-auto">
                Some months let you pick between book options — reminders for that are off by default.{' '}
                <Link href="/profile?tab=notifications" className="text-amber-400 hover:text-amber-300 underline">
                  Turn them on
                </Link>
              </p>
            )}
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
