/**
 * Component-level regression tests for Step3 of JoinSubscriptionModal — the "backfill billing"
 * step of the join flow. Step3 is exported (not just used internally) specifically so these
 * tests can mount it directly with controlled props, instead of driving the whole multi-step
 * modal (including the real join API call) through steps 1–2 first.
 *
 * Covers the two frontend fixes for the "trailing incomplete prepay window" bug: a payment that
 * covers N months but where fewer than N SubscriptionMonth rows exist yet must still send the
 * true N as monthsCovered, not however many months are currently backfillable.
 *  - Auto ("no") path: monthsCovered = the single prepayN, not the batch's bucketed month count.
 *  - Manual ("yes") path: an explicit per-row override is honored; blank still falls back to the
 *    bucketed count (see resolveBatchMonthsCovered, unit-tested separately in
 *    joinSubscription.utils.test.ts — this test instead proves the actual DOM input is wired to
 *    it correctly).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Step3 } from '../components/subscriptions/JoinSubscriptionModal'

vi.mock('@/lib/authFetch', () => ({ authFetch: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/api', () => ({ getFeeTemplates: vi.fn().mockResolvedValue([]) }))

import { authFetch } from '@/lib/authFetch'

function month(id: string, year: number, monthNum: number) {
  return { id, year, month: monthNum, theme: null, series: null, books: [] }
}

function lastBackfillRequestBody() {
  const mock = authFetch as unknown as ReturnType<typeof vi.fn>
  const call = mock.mock.calls.find(c => String(c[0]).includes('/join/backfill'))
  return call ? JSON.parse(call[1].body) : null
}

const baseEntry = {
  id: 'entry-1',
  startDate: '2026-08-01',
  costCurrency: 'USD',
  shippingCost: null,
  renewalDay: 1,
  basePrice: '90.00',
}

describe('Step3 — auto ("no") path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends monthsCovered = the true prepay N for a trailing partial batch, not the bucketed month count', async () => {
    // Paid for 3 months upfront, but only 2 exist as SubscriptionMonth rows so far.
    const months = [month('m-1', 2026, 8), month('m-2', 2026, 9)]

    render(
      <Step3
        selectedMonthIds={['m-1', 'm-2']}
        bookPrices={{}}
        choicePicks={{}}
        selectedPrepayOption={{ id: 'opt-1', months: 3, price: 90, label: null }}
        allPrepayOptions={[{ id: 'opt-1', months: 3, price: 90, currency: 'USD' }]}
        subscriptionSlug="test-sub"
        entryFees={[]}
        entry={baseEntry}
        eligibleMonths={months}
        initiallyChanged={false}
        onDone={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    const confirmButton = await screen.findByRole('button', { name: 'Confirm' })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(authFetch).toHaveBeenCalled())

    const body = lastBackfillRequestBody()
    expect(body.billingBatches).toHaveLength(1)
    expect(body.billingBatches[0].monthsCovered).toBe(3)
    expect(body.billingBatches[0].monthIds).toEqual(['m-1', 'm-2'])
  })

  it('sends monthsCovered = N for every batch when the window is fully known (regression)', async () => {
    const months = [month('m-1', 2026, 8), month('m-2', 2026, 9), month('m-3', 2026, 10)]

    render(
      <Step3
        selectedMonthIds={['m-1', 'm-2', 'm-3']}
        bookPrices={{}}
        choicePicks={{}}
        selectedPrepayOption={{ id: 'opt-1', months: 3, price: 90, label: null }}
        allPrepayOptions={[{ id: 'opt-1', months: 3, price: 90, currency: 'USD' }]}
        subscriptionSlug="test-sub"
        entryFees={[]}
        entry={baseEntry}
        eligibleMonths={months}
        initiallyChanged={false}
        onDone={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    const confirmButton = await screen.findByRole('button', { name: 'Confirm' })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(authFetch).toHaveBeenCalled())

    const body = lastBackfillRequestBody()
    expect(body.billingBatches).toHaveLength(1)
    expect(body.billingBatches[0].monthsCovered).toBe(3)
  })
})

describe('Step3 — manual ("yes") path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the user-entered Months override for a trailing row instead of its bucketed count', async () => {
    // Only August exists yet, but the user is recording a payment that covered 3 months.
    const months = [month('m-1', 2026, 8)]

    render(
      <Step3
        selectedMonthIds={['m-1']}
        bookPrices={{}}
        choicePicks={{}}
        selectedPrepayOption={{ id: 'opt-1', months: 3, price: 90, label: null }}
        allPrepayOptions={[{ id: 'opt-1', months: 3, price: 90, currency: 'USD' }]}
        subscriptionSlug="test-sub"
        entryFees={[]}
        entry={baseEntry}
        eligibleMonths={months}
        initiallyChanged={true}
        onDone={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-08-01' } })

    const numberInputs = document.querySelectorAll('input[type="number"]')
    // Per-row order: amount, shipping, months (see the "Months" input added next to shipping).
    const monthsInput = numberInputs[2] as HTMLInputElement
    fireEvent.change(monthsInput, { target: { value: '3' } })

    const saveButton = await screen.findByRole('button', { name: 'Save billing' })
    fireEvent.click(saveButton)

    await waitFor(() => expect(authFetch).toHaveBeenCalled())

    const body = lastBackfillRequestBody()
    expect(body.billingBatches).toHaveLength(1)
    expect(body.billingBatches[0].monthsCovered).toBe(3)
  })

  it('falls back to the bucketed month count when the Months field is left blank', async () => {
    const months = [month('m-1', 2026, 8)]

    render(
      <Step3
        selectedMonthIds={['m-1']}
        bookPrices={{}}
        choicePicks={{}}
        selectedPrepayOption={{ id: 'opt-1', months: 3, price: 90, label: null }}
        allPrepayOptions={[{ id: 'opt-1', months: 3, price: 90, currency: 'USD' }]}
        subscriptionSlug="test-sub"
        entryFees={[]}
        entry={baseEntry}
        eligibleMonths={months}
        initiallyChanged={true}
        onDone={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-08-01' } })

    const saveButton = await screen.findByRole('button', { name: 'Save billing' })
    fireEvent.click(saveButton)

    await waitFor(() => expect(authFetch).toHaveBeenCalled())

    const body = lastBackfillRequestBody()
    expect(body.billingBatches).toHaveLength(1)
    expect(body.billingBatches[0].monthsCovered).toBe(1) // bucketed: only August exists
  })
})
