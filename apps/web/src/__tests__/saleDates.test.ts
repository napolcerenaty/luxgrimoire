import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  resolveSaleDates,
  resolveSalePrice,
  resolveSubscriberPrice,
  formatTierDate,
  isSalePast,
  isOpenForPurchase,
} from '../lib/saleDates'

const NOW = new Date('2026-08-22T12:00:00Z')
const realDateNow = Date.now
beforeAll(() => {
  Date.now = () => NOW.getTime()
})
afterAll(() => {
  Date.now = realDateNow
})

const past = '2026-01-01T00:00:00Z'
const future = '2026-12-01T00:00:00Z'

/* eslint-disable @typescript-eslint/no-explicit-any */
const sale = (over: any = {}): any => ({
  firstAccessDate: null,
  earlyAccessDate: null,
  generalSaleDate: null,
  basePrice: null,
  currency: null,
  subscriberBasePrice: null,
  regions: [],
  tiers: [],
  ...over,
})

describe('resolveSaleDates', () => {
  it('uses the top-level dates when there are no regions', () => {
    const s = sale({ firstAccessDate: 'a', earlyAccessDate: 'b', generalSaleDate: 'c' })
    expect(resolveSaleDates(s)).toEqual({ FA: 'a', EA: 'b', GS: 'c' })
  })

  it('picks the named region and falls back per-field to the top level', () => {
    const s = sale({
      earlyAccessDate: 'top-EA',
      generalSaleDate: 'top-GS',
      regions: [{ id: 'r1', firstAccessDate: 'r1-FA', earlyAccessDate: null, generalSaleDate: 'r1-GS' }],
    })
    expect(resolveSaleDates(s, 'r1')).toEqual({ FA: 'r1-FA', EA: 'top-EA', GS: 'r1-GS' })
  })

  it('falls back to the default region when the requested id is missing', () => {
    const s = sale({
      regions: [
        { id: 'r1', isDefault: false, generalSaleDate: 'r1' },
        { id: 'r2', isDefault: true, generalSaleDate: 'r2' },
      ],
    })
    expect(resolveSaleDates(s, 'nope').GS).toBe('r2')
  })

  it('uses the first region when none is flagged default and no id is given', () => {
    const s = sale({ regions: [{ id: 'r1', generalSaleDate: 'r1' }, { id: 'r2', generalSaleDate: 'r2' }] })
    expect(resolveSaleDates(s).GS).toBe('r1')
  })
})

describe('resolveSalePrice', () => {
  it('prefers the region price/currency, then the sale, then USD', () => {
    expect(resolveSalePrice(sale({ basePrice: 40, currency: 'EUR' }))).toEqual({ basePrice: 40, currency: 'EUR' })
    expect(resolveSalePrice(sale({ basePrice: 40 }))).toEqual({ basePrice: 40, currency: 'USD' })
    expect(
      resolveSalePrice(sale({ basePrice: 40, regions: [{ id: 'r1', basePrice: 55, currency: 'GBP' }] }), 'r1'),
    ).toEqual({ basePrice: 55, currency: 'GBP' })
  })

  it('keeps a region base price of 0 rather than falling through to the sale price', () => {
    const s = sale({ basePrice: 40, regions: [{ id: 'r1', basePrice: 0, currency: 'USD' }] })
    expect(resolveSalePrice(s, 'r1').basePrice).toBe(0)
  })
})

describe('resolveSubscriberPrice', () => {
  it('prefers the region value, then the sale value, then null', () => {
    expect(resolveSubscriberPrice(sale({ subscriberBasePrice: 30 }))).toBe(30)
    expect(resolveSubscriberPrice(sale())).toBeNull()
    expect(
      resolveSubscriberPrice(sale({ subscriberBasePrice: 30, regions: [{ id: 'r1', subscriberBasePrice: 25 }] }), 'r1'),
    ).toBe(25)
  })
})

describe('formatTierDate', () => {
  it('returns null for missing input', () => {
    expect(formatTierDate(null)).toBeNull()
    expect(formatTierDate(undefined)).toBeNull()
    expect(formatTierDate('')).toBeNull()
  })

  it('formats a local date-time as "D Mon · HH:mm" in 24h mode', () => {
    expect(formatTierDate('2026-08-12T14:30')).toBe('12 Aug · 14:30')
    expect(formatTierDate('2026-08-05T09:05')).toBe('5 Aug · 09:05')
  })

  it('uses a 12-hour clock when asked', () => {
    const out = formatTierDate('2026-08-12T14:30', true)
    expect(out?.startsWith('12 Aug · ')).toBe(true)
    expect(out).toMatch(/2:30/)
    expect(out).toMatch(/PM/i)
  })
})

describe('isSalePast', () => {
  it('is driven by the latest tier date when tiers exist', () => {
    expect(isSalePast(sale({ tiers: [{ regionId: null, date: past }, { regionId: null, date: future }] }))).toBe(false)
    expect(isSalePast(sale({ tiers: [{ regionId: null, date: past }] }))).toBe(true)
  })

  it('falls back to GS/EA/FA for un-backfilled historical announcements', () => {
    expect(isSalePast(sale({ generalSaleDate: past }))).toBe(true)
    expect(isSalePast(sale({ firstAccessDate: future }))).toBe(false)
  })

  it('returns false when there is no date to compare at all', () => {
    expect(isSalePast(sale())).toBe(false)
  })
})

describe('isOpenForPurchase', () => {
  it('is driven by the earliest tier date when tiers exist', () => {
    expect(isOpenForPurchase(sale({ tiers: [{ regionId: null, date: past }, { regionId: null, date: future }] }))).toBe(true)
    expect(isOpenForPurchase(sale({ tiers: [{ regionId: null, date: future }] }))).toBe(false)
  })

  it('treats a start time exactly at now as open', () => {
    expect(isOpenForPurchase(sale({ tiers: [{ regionId: null, date: NOW.toISOString() }] }))).toBe(true)
  })

  it('falls back to FA/EA/GS and returns false when nothing is set', () => {
    expect(isOpenForPurchase(sale({ firstAccessDate: past }))).toBe(true)
    expect(isOpenForPurchase(sale())).toBe(false)
  })
})
