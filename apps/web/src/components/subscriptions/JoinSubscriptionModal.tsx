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
  onNext: (data: {
    startDate: string
    costCurrency: string
    basePrice: string
    shippingCost: string
    linkedFeeTemplates: { templateId: string; customAmount?: number; customCurrency?: string }[]
    renewalDay?: number
  }) => void
}

function Step1({ currency, subscriptionRenewalDay, subscriptionPrice, userDefaultTaxRate, onNext }: Step1Props) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const [firstOrderDate, setFirstOrderDate] = useState(todayStr)
  const [costCurrency, setCostCurrency] = useState(currency)
  const [basePrice, setBasePrice] = useState(subscriptionPrice ? parseFloat(subscriptionPrice).toFixed(2) : '')
  const [shippingCost, setShippingCost] = useState('')

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
      ...(subscriptionRenewalDay == null && { renewalDay: parts[2] ?? new Date(firstOrderDate + 'T00:00:00').getDate() }),
    })
  }

  const cur = effectiveCur

  return (
    <form onSubmit={submit} className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      <h3 className="text-lg font-serif text-stone-100 font-semibold">Join Subscription</h3>

      {/* First order date */}
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
        {subscriptionRenewalDay != null ? (
          <p className="text-xs text-stone-500 mt-1">
            Renewal day: <span className="text-stone-300">{subscriptionRenewalDay}</span> (set by subscription)
          </p>
        ) : (
          <p className="text-xs text-stone-500 mt-1">
            Renewal day will be set to{' '}
            <span className="text-stone-300">{new Date(firstOrderDate + 'T00:00:00').getDate()}</span>
          </p>
        )}
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
              <p className="text-xs text-amber-600/80 pt-1">Fees are in different currencies — enter a manual total below if needed.</p>
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
  onDone: () => void
  onSkip: () => void
}

function Step2({ eligibleMonths, subscriptionSlug, entry, onDone, onSkip }: Step2Props) {
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
    setSubmitting(true)
    setError(null)
    try {
      const selectedMonthIds = eligibleMonths.filter(m => choices[m.id] === 'selected').map(m => m.id)
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

      {/* Per-book price inputs for multi-book months */}
      {isMultiBook && checked && (
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

// ── Main modal ────────────────────────────────────────────────────────────────

export default function JoinSubscriptionModal({
  subscriptionSlug,
  subscriptionCurrency,
  subscriptionRenewalDay,
  subscriptionPrice,
  userDefaultTaxRate,
  onJoined,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 'done'>(1)
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const handleStep1 = useCallback(async (data: {
    startDate: string
    costCurrency: string
    basePrice: string
    shippingCost: string
    linkedFeeTemplates: { templateId: string; customAmount?: number; customCurrency?: string }[]
    renewalDay?: number
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
        }),
      })
      setJoinResult(result)

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
            onDone={() => { setStep('done'); onJoined() }}
            onSkip={() => { setStep('done'); onJoined() }}
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
