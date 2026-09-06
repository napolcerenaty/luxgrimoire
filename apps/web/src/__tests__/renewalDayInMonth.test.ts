import { describe, it, expect } from 'vitest'
import { renewalDayInMonth, type CalEntry } from '../lib/renewalDayInMonth'

function makeEntry(over: {
  entry?: Partial<CalEntry>
  sub?: Partial<CalEntry['subscription']>
} = {}): CalEntry {
  const sub: CalEntry['subscription'] = {
    id: 'sub-1',
    slug: 's',
    name: 'S',
    logoUrl: null,
    coverImage: null,
    intervalMonths: 1,
    startingMonth: 1,
    renewalDay: 15,
    renewalMonthOffset: 0,
    startDate: null,
    company: { name: 'Co', slug: 'co' },
    monthSkips: [],
    ...over.sub,
  }
  return {
    id: 'e-1',
    active: true,
    startDate: null,
    renewalDay: null,
    nextRenewalAmount: null,
    nextRenewalCurrency: null,
    skipRecords: [],
    subscription: sub,
    ...over.entry,
  }
}

describe('renewalDayInMonth', () => {
  it('returns null when neither the entry nor the subscription has a renewal day', () => {
    const e = makeEntry({ entry: { renewalDay: null }, sub: { renewalDay: null } })
    expect(renewalDayInMonth(e, 2026, 5)).toBeNull()
  })

  it('prefers the entry-level renewal day over the subscription default', () => {
    const e = makeEntry({ entry: { renewalDay: 10 }, sub: { renewalDay: 15 } })
    expect(renewalDayInMonth(e, 2026, 5)).toBe(10)
  })

  it('falls back to the subscription renewal day', () => {
    expect(renewalDayInMonth(makeEntry(), 2026, 5)).toBe(15)
  })

  it('does not show renewals before the user join date', () => {
    const e = makeEntry({ entry: { startDate: '2026-06-01' } })
    expect(renewalDayInMonth(e, 2026, 4)).toBeNull() // May
    expect(renewalDayInMonth(e, 2026, 5)).toBe(15) // June
    expect(renewalDayInMonth(e, 2025, 11)).toBeNull() // prior year
  })

  it('does not show renewals before the subscription start date (string or Date)', () => {
    const asStr = makeEntry({ sub: { startDate: '2026-03-01' } })
    expect(renewalDayInMonth(asStr, 2026, 1)).toBeNull()
    expect(renewalDayInMonth(asStr, 2026, 2)).toBe(15)

    const asDate = makeEntry({ sub: { startDate: new Date('2026-03-01T00:00:00Z') } })
    expect(renewalDayInMonth(asDate, 2026, 1)).toBeNull()
    expect(renewalDayInMonth(asDate, 2026, 2)).toBe(15)
  })

  it('only fires on the aligned month of a multi-month interval', () => {
    const e = makeEntry({ sub: { intervalMonths: 2, startingMonth: 1 } })
    expect(renewalDayInMonth(e, 2026, 0)).toBe(15) // Jan — aligned
    expect(renewalDayInMonth(e, 2026, 1)).toBeNull() // Feb — off cycle
    expect(renewalDayInMonth(e, 2026, 2)).toBe(15) // Mar — aligned
  })

  it('shifts the interval alignment back by the renewal-month offset', () => {
    // quarterly, box month 3, billed one month earlier (offset 1) => renewal aligns on Feb/May/Aug/Nov
    const e = makeEntry({ sub: { intervalMonths: 3, startingMonth: 3, renewalMonthOffset: 1 } })
    expect(renewalDayInMonth(e, 2026, 1)).toBe(15) // Feb
    expect(renewalDayInMonth(e, 2026, 4)).toBe(15) // May
    expect(renewalDayInMonth(e, 2026, 2)).toBeNull() // Mar
  })

  it('suppresses the renewal when the paid-for box month is a user skip', () => {
    const e = makeEntry({
      entry: { skipRecords: [{ month: { year: 2026, month: 2 } }] },
      sub: { renewalMonthOffset: 1 },
    })
    // Jan renewal (offset 1) pays for the Feb box -> skipped
    expect(renewalDayInMonth(e, 2026, 0)).toBeNull()
    // Feb renewal pays for the Mar box -> not skipped
    expect(renewalDayInMonth(e, 2026, 1)).toBe(15)
  })

  it('suppresses the renewal on a company-wide monthSkip', () => {
    const e = makeEntry({ sub: { monthSkips: [{ year: 2026, month: 1 }] } })
    expect(renewalDayInMonth(e, 2026, 0)).toBeNull() // Jan box skipped company-wide
    expect(renewalDayInMonth(e, 2026, 1)).toBe(15)
  })

  it('resolves the skipped box month across a year boundary', () => {
    const e = makeEntry({
      entry: { skipRecords: [{ month: { year: 2027, month: 1 } }] },
      sub: { renewalMonthOffset: 1 },
    })
    // Dec 2026 renewal (offset 1) pays for the Jan 2027 box -> skipped
    expect(renewalDayInMonth(e, 2026, 11)).toBeNull()
  })
})
