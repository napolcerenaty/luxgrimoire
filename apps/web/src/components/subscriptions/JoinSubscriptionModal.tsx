'use client'

import { useState, useEffect, useCallback } from 'react'
import { authFetch } from '@/lib/authFetch'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Author {
  author: { id: string; name: string }
}

interface BookEdition {
  id: string
  coverImage: string | null
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
    taxesAndFees: string | null
    renewalDay: number | null
  }
  eligibleMonths: SubscriptionMonth[]
}

interface Props {
  subscriptionSlug: string
  subscriptionCurrency: string
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

interface Step1Props {
  currency: string
  onNext: (data: {
    startDate: string
    costCurrency: string
    shippingCost: string
    taxesAndFees: string
    renewalDay: number
  }) => void
}

function Step1({ currency, onNext }: Step1Props) {
  const now = new Date()
  const [startYear, setStartYear] = useState(now.getFullYear())
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1)
  const [costCurrency, setCostCurrency] = useState(currency)
  const [shippingCost, setShippingCost] = useState('')
  const [taxesAndFees, setTaxesAndFees] = useState('')
  const [renewalDay, setRenewalDay] = useState(1)

  const years = Array.from({ length: 10 }, (_, i) => now.getFullYear() - 8 + i)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onNext({
      startDate: `${startYear}-${String(startMonth).padStart(2, '0')}`,
      costCurrency: costCurrency || currency,
      shippingCost,
      taxesAndFees,
      renewalDay,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <h3 className="text-lg font-serif text-stone-100 font-semibold">Join Subscription</h3>

      {/* Start date */}
      <div>
        <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">Start month</label>
        <div className="flex gap-2">
          <select
            value={startMonth}
            onChange={e => setStartMonth(Number(e.target.value))}
            className="flex-1 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={startYear}
            onChange={e => setStartYear(Number(e.target.value))}
            className="w-28 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Renewal day */}
      <div>
        <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">
          Renewal day of month
        </label>
        <input
          type="number"
          min={1}
          max={31}
          value={renewalDay}
          onChange={e => setRenewalDay(Number(e.target.value))}
          className="w-24 bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
        />
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

      {/* Shipping + taxes */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">Shipping cost</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={shippingCost}
            onChange={e => setShippingCost(e.target.value)}
            placeholder="0.00"
            className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-400 uppercase tracking-wider mb-1.5">Taxes &amp; fees</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={taxesAndFees}
            onChange={e => setTaxesAndFees(e.target.value)}
            placeholder="0.00"
            className="w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-stone-100 text-sm"
          />
        </div>
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
      await authFetch(`/subscriptions/${subscriptionSlug}/join/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedMonthIds, skippedMonthIds }),
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
              <MonthRow key={m.id} month={m} checked={choices[m.id] === 'selected'} onToggle={() => toggle(m.id)} />
            ))}
          </div>
        ))}

        {/* Standalone months */}
        {standalone.map(m => (
          <MonthRow key={m.id} month={m} checked={choices[m.id] === 'selected'} onToggle={() => toggle(m.id)} />
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

function MonthRow({ month, checked, onToggle }: {
  month: SubscriptionMonth
  checked: boolean
  onToggle: () => void
}) {
  const mainBook = month.books.find(b => b.isMainBook && b.edition) ?? month.books.find(b => b.edition)
  const otherBooks = month.books.filter(b => b !== mainBook && b.edition)
  const authorName = mainBook?.edition?.book?.authors?.[0]?.author?.name

  return (
    <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-stone-800/40 border-b border-stone-700/40 last:border-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 rounded border-stone-600 bg-stone-800 text-amber-600 focus:ring-amber-600/30"
      />
      {mainBook?.edition?.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/w_40,h_56,c_fill/${mainBook.edition.coverImage}`}
          alt=""
          width={40}
          height={56}
          className="rounded object-cover flex-shrink-0"
        />
      )}
      <div className="min-w-0">
        <p className="text-xs text-amber-400/80 font-medium mb-0.5">{monthLabel(month)}</p>
        <p className="text-sm text-stone-100 leading-snug truncate">
          {mainBook?.edition?.book?.title ?? mainBook?.edition?.title ?? '—'}
        </p>
        {authorName && <p className="text-xs text-stone-400 truncate">{authorName}</p>}
        {otherBooks.length > 0 && (
          <p className="text-xs text-stone-500 mt-0.5">+{otherBooks.length} more</p>
        )}
      </div>
    </label>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function JoinSubscriptionModal({ subscriptionSlug, subscriptionCurrency, onJoined, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 'done'>(1)
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const handleStep1 = useCallback(async (data: {
    startDate: string
    costCurrency: string
    shippingCost: string
    taxesAndFees: string
    renewalDay: number
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
          shippingCost: data.shippingCost || undefined,
          taxesAndFees: data.taxesAndFees || undefined,
          renewalDay: data.renewalDay,
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
            <Step1 currency={subscriptionCurrency} onNext={handleStep1} />
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
