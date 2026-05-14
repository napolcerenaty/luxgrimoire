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
  userDefaultTaxRate?: number | null
  prepayOptions?: { id: string; months: number; price: number | string; label: string | null }[]
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

interface Step1Props {
  currency: string
  subscriptionRenewalDay?: number | null
  subscriptionPrice?: string | null
  userDefaultTaxRate?: number | null
  prepayOptions?: { id: string; months: number; price: number | string; label: string | null }[]
  onNext: (data: {
    startDate: string
    costCurrency: string
    basePrice: string
    shippingCost: string
    linkedFeeTemplates: { templateId: string; customAmount?: number; customCurrency?: string }[]
    resolvedFees: { name: string; amount: string; currency: string }[]
    renewalDay?: number
    selectedPrepayOptionId?: string | null
    alreadyCancelled?: boolean
    cancellationDate?: string
    cancellationReason?: string
  }) => void
}

function Step1({ currency, subscriptionRenewalDay, subscriptionPrice, userDefaultTaxRate, prepayOptions, onNext }: Step1Props) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

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

      {/* Billing period (only shown if prepay options exist) */}
      {prepayOptions && prepayOptions.length > 0 && (
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
            {prepayOptions.map(opt => (
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
                  <span className="text-xs text-stone-400">{parseFloat(String(opt.price)).toFixed(2)} {currency}</span>
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
        <input
          type="text"
          value={costCurrency}
          onChange={e => setCostCurrency(e.target.value.toUpperCase())}
          maxLength={3}
          className="w-24 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm uppercase"
        />
      </div>

      {/* Base price + shipping side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">Base price ({cur})</label>
          <input
            type="number" min={0} step="0.01"
            value={basePrice}
            onChange={e => setBasePrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
          />
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

      {/* Fee templates */}
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
          <p className="text-sm text-stone-100 leading-snug truncate">
            {mainBook?.edition?.book?.title ?? mainBook?.edition?.title ?? '—'}
          </p>
          {authorName && <p className="text-xs text-stone-400 truncate">{authorName}</p>}
          {!isMultiBook && allBooks.length > 1 && (
            <p className="text-xs text-stone-500 mt-0.5">+{allBooks.length - 1} more</p>
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

// ── Step 3: Billing batches ───────────────────────────────────────────────────

interface Step3Props {
  selectedMonthIds: string[]
  bookPrices: Record<string, string>
  prepayOptions: { id: string; months: number; price: number | string; label: string | null }[]
  subscriptionSlug: string
  entryFees: { name: string; amount: string; currency: string }[]
  entry: JoinResult['entry']
  eligibleMonths: SubscriptionMonth[]
  onDone: () => void
  onBack: () => void
}

function Step3({ selectedMonthIds, bookPrices, prepayOptions, subscriptionSlug, entryFees, entry, eligibleMonths, onDone, onBack }: Step3Props) {
  const currency = entry.costCurrency ?? 'USD'

  type BatchMode = 'all-monthly' | 'custom'
  const [batchMode, setBatchMode] = useState<BatchMode>('all-monthly')

  type BatchFeeRow = { name: string; amount: string; currency: string }
  type Batch = { billedAt: string; baseAmount: string; shippingAmount: string; monthIds: string[]; fees: BatchFeeRow[] }

  function makeDefaultFees(): BatchFeeRow[] {
    return entryFees.map(f => ({ name: f.name, amount: f.amount, currency: f.currency }))
  }

  const [batches, setBatches] = useState<Batch[]>(() =>
    [{ billedAt: '', baseAmount: '', shippingAmount: '', monthIds: [...selectedMonthIds], fees: makeDefaultFees() }]
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function switchMode(mode: BatchMode) {
    setBatchMode(mode)
    if (mode === 'custom' && batches.length === 0) {
      setBatches([{ billedAt: '', baseAmount: '', shippingAmount: '', monthIds: [...selectedMonthIds], fees: makeDefaultFees() }])
    }
  }

  function addBatch() {
    setBatches(prev => [...prev, { billedAt: '', baseAmount: '', shippingAmount: '', monthIds: [], fees: makeDefaultFees() }])
  }

  function removeBatch(idx: number) {
    setBatches(prev => prev.filter((_, i) => i !== idx))
  }

  function updateBatch(idx: number, field: string, value: string) {
    setBatches(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b))
  }

  function toggleMonth(batchIdx: number, monthId: string) {
    setBatches(prev => prev.map((b, i) => {
      if (i !== batchIdx) return b
      const has = b.monthIds.includes(monthId)
      return { ...b, monthIds: has ? b.monthIds.filter(id => id !== monthId) : [...b.monthIds, monthId] }
    }))
  }

  function updateFee(batchIdx: number, feeIdx: number, field: keyof BatchFeeRow, value: string) {
    setBatches(prev => prev.map((b, i) => {
      if (i !== batchIdx) return b
      const fees = b.fees.map((f, j) => j === feeIdx ? { ...f, [field]: value } : f)
      return { ...b, fees }
    }))
  }

  function addFee(batchIdx: number) {
    setBatches(prev => prev.map((b, i) => i !== batchIdx ? b : { ...b, fees: [...b.fees, { name: '', amount: '', currency }] }))
  }

  function removeFee(batchIdx: number, feeIdx: number) {
    setBatches(prev => prev.map((b, i) => i !== batchIdx ? b : { ...b, fees: b.fees.filter((_, j) => j !== feeIdx) }))
  }

  async function submitSkip() {
    setSubmitting(true)
    setError(null)
    try {
      const skippedMonthIds = eligibleMonths.filter(m => !selectedMonthIds.includes(m.id)).map(m => m.id)
      const bookPricesPayload = buildBookPricesPayload()
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
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  function buildBookPricesPayload() {
    return Object.entries(bookPrices)
      .filter(([, v]) => v !== '' && parseDecimalInput(v) !== 0)
      .map(([key, v]) => {
        const [monthId, editionId] = key.split(':')
        return { monthId, editionId, price: parseDecimalInput(v) }
      })
  }

  async function submitCustom() {
    setSubmitting(true)
    setError(null)
    try {
      const skippedMonthIds = eligibleMonths.filter(m => !selectedMonthIds.includes(m.id)).map(m => m.id)
      const bookPricesPayload = buildBookPricesPayload()

      const billingBatches = batches
        .filter(b => b.monthIds.length > 0 && b.billedAt)
        .map(b => ({
          billedAt: b.billedAt,
          baseAmount: parseDecimalInput(b.baseAmount) || 0,
          monthsCovered: b.monthIds.length,
          currency,
          shippingAmount: b.shippingAmount ? parseDecimalInput(b.shippingAmount) : undefined,
          monthIds: b.monthIds,
          ...(b.fees.filter(f => f.name && f.amount).length > 0 && {
            fees: b.fees
              .filter(f => f.name && f.amount)
              .map(f => ({ name: f.name, amount: parseDecimalInput(f.amount), currency: f.currency || currency })),
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
      setError(e instanceof Error ? e.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const monthMap = new Map(eligibleMonths.map(m => [m.id, m]))
  const assignedMonthIds = new Set(batches.flatMap(b => b.monthIds))

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif text-stone-100 font-semibold">Billing batches</h3>
        <button onClick={onBack} className="text-xs text-stone-500 hover:text-stone-300">← Back</button>
      </div>
      <p className="text-xs text-stone-400">
        Group months you paid for together into billing batches. Each batch represents one payment.
      </p>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => switchMode('all-monthly')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            batchMode === 'all-monthly'
              ? 'bg-amber-700/40 border-amber-600 text-amber-300'
              : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-500'
          }`}
        >
          All monthly
          <span className="block text-[10px] font-normal opacity-70">1 payment per month</span>
        </button>
        <button
          onClick={() => switchMode('custom')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            batchMode === 'custom'
              ? 'bg-amber-700/40 border-amber-600 text-amber-300'
              : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-500'
          }`}
        >
          Custom
          <span className="block text-[10px] font-normal opacity-70">group months freely</span>
        </button>
      </div>

      {/* All-monthly: simple info, no batch cards */}
      {batchMode === 'all-monthly' && (
        <div className="rounded-lg border border-stone-700 bg-stone-800/50 p-4 text-xs text-stone-400 space-y-1">
          <p className="text-stone-300 font-medium">Each month will be recorded as a separate monthly payment.</p>
          <p>Prices will be taken from your subscription entry settings. You can add custom fees and exact payment dates later by editing each billing period.</p>
        </div>
      )}

      {/* Custom batches */}
      {batchMode === 'custom' && batches.map((batch, idx) => (
        <div key={idx} className="border border-stone-700 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-400 font-medium">Batch {idx + 1}</span>
            {batches.length > 1 && (
              <button onClick={() => removeBatch(idx)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Payment date</label>
              <input
                type="date"
                value={batch.billedAt}
                onChange={e => updateBatch(idx, 'billedAt', e.target.value)}
                className="w-full bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Total paid ({currency})</label>
              <input
                type="number"
                step="0.01"
                value={batch.baseAmount}
                onChange={e => updateBatch(idx, 'baseAmount', e.target.value)}
                placeholder="0.00"
                className="w-full bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Shipping ({currency})</label>
              <input
                type="number"
                step="0.01"
                value={batch.shippingAmount}
                onChange={e => updateBatch(idx, 'shippingAmount', e.target.value)}
                placeholder="0.00"
                className="w-full bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
              />
            </div>
          </div>

          {/* Months */}
          <div>
            <p className="text-xs text-stone-500 mb-1">Months in this batch:</p>
            <div className="flex flex-wrap gap-1">
              {selectedMonthIds.map(mid => {
                const m = monthMap.get(mid)
                if (!m) return null
                const inThis = batch.monthIds.includes(mid)
                const inOther = !inThis && assignedMonthIds.has(mid)
                return (
                  <button
                    key={mid}
                    onClick={() => toggleMonth(idx, mid)}
                    disabled={inOther}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      inThis
                        ? 'bg-amber-700 border-amber-600 text-stone-100'
                        : inOther
                        ? 'bg-stone-800 border-stone-700 text-stone-600 cursor-not-allowed'
                        : 'bg-stone-800 border-stone-600 text-stone-400 hover:border-amber-600'
                    }`}
                  >
                    {MONTH_NAMES[m.month - 1]} {m.year}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fees */}
          <div>
            <p className="text-xs text-stone-500 mb-1">Additional fees / taxes:</p>
            <div className="space-y-1">
              {batch.fees.map((fee, feeIdx) => (
                <div key={feeIdx} className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={fee.name}
                    onChange={e => updateFee(idx, feeIdx, 'name', e.target.value)}
                    placeholder="Name"
                    className="flex-1 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={fee.amount}
                    onChange={e => updateFee(idx, feeIdx, 'amount', e.target.value)}
                    placeholder="0.00"
                    className="w-20 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs"
                  />
                  <input
                    type="text"
                    value={fee.currency}
                    onChange={e => updateFee(idx, feeIdx, 'currency', e.target.value.toUpperCase())}
                    maxLength={3}
                    className="w-12 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs uppercase"
                  />
                  <button onClick={() => removeFee(idx, feeIdx)} className="text-xs text-red-400 hover:text-red-300 px-1">✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => addFee(idx)} className="mt-1 text-xs text-amber-500 hover:text-amber-400 transition-colors">
              + Add fee
            </button>
          </div>
        </div>
      ))}

      {batchMode === 'custom' && (
        <button
          onClick={addBatch}
          className="text-xs text-amber-500 hover:text-amber-400 transition-colors"
        >
          + Add another batch
        </button>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <p className="text-xs text-stone-500">
        If you skip this step, all selected months will be recorded as individual monthly payments using the subscription price.
      </p>

      <div className="flex gap-3 pt-2">
        {batchMode === 'all-monthly' ? (
          <button
            onClick={submitSkip}
            disabled={submitting}
            className="flex-1 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save as all monthly'}
          </button>
        ) : (
          <>
            <button
              onClick={submitCustom}
              disabled={submitting}
              className="flex-1 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-stone-100 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save batches'}
            </button>
            <button
              onClick={submitSkip}
              disabled={submitting}
              className="py-2 px-4 rounded-lg border border-stone-600 text-stone-400 text-sm hover:text-stone-300 transition-colors disabled:opacity-50"
            >
              Skip batches
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function JoinSubscriptionModal({
  subscriptionSlug,
  subscriptionCurrency,
  subscriptionRenewalDay,
  subscriptionPrice,
  userDefaultTaxRate,
  prepayOptions,
  onJoined,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 'done'>(1)
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null)
  const [step2Data, setStep2Data] = useState<{ selectedMonthIds: string[]; bookPrices: Record<string, string> } | null>(null)
  const [step1Fees, setStep1Fees] = useState<{ name: string; amount: string; currency: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const handleStep1 = useCallback(async (data: {
    startDate: string
    costCurrency: string
    basePrice: string
    shippingCost: string
    linkedFeeTemplates: { templateId: string; customAmount?: number; customCurrency?: string }[]
    resolvedFees: { name: string; amount: string; currency: string }[]
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
          linkedFeeTemplates: data.linkedFeeTemplates.length > 0
            ? data.linkedFeeTemplates.map(f => ({
                templateId: f.templateId,
                customAmount: f.customAmount,
                customCurrency: f.customCurrency,
              }))
            : undefined,
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
              subscriptionRenewalDay={subscriptionRenewalDay}
              subscriptionPrice={subscriptionPrice}
              userDefaultTaxRate={userDefaultTaxRate}
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
            onNextWithBilling={(prepayOptions?.length ?? 0) > 0
              ? (data) => { setStep2Data(data); setStep(3) }
              : undefined
            }
          />
        )}

        {!joining && step === 3 && joinResult && step2Data && (prepayOptions?.length ?? 0) > 0 && (
          <Step3
            selectedMonthIds={step2Data.selectedMonthIds}
            bookPrices={step2Data.bookPrices}
            prepayOptions={prepayOptions!}
            subscriptionSlug={subscriptionSlug}
            entryFees={step1Fees}
            entry={joinResult.entry}
            eligibleMonths={joinResult.eligibleMonths}
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
