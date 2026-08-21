/**
 * Unit tests for photoCredit.ts — merges the manually-typed photoCredit text with the book
 * box company's own Instagram handle so admins don't have to type it in by hand when there's
 * no dedicated photographer/artist, while never double-crediting an already-typed handle.
 */
import { describe, it, expect } from 'vitest'
import { normalizeInstagramHandle, parsePhotoCredits, buildPhotoCredits } from '../lib/photoCredit'

describe('normalizeInstagramHandle', () => {
  it('returns null for empty/missing input', () => {
    expect(normalizeInstagramHandle(null)).toBeNull()
    expect(normalizeInstagramHandle(undefined)).toBeNull()
    expect(normalizeInstagramHandle('')).toBeNull()
    expect(normalizeInstagramHandle('   ')).toBeNull()
  })

  it('strips a leading @ from a bare handle', () => {
    expect(normalizeInstagramHandle('@fairyloot')).toBe('fairyloot')
    expect(normalizeInstagramHandle('fairyloot')).toBe('fairyloot')
  })

  it('extracts the handle from a full profile URL', () => {
    expect(normalizeInstagramHandle('https://instagram.com/fairyloot')).toBe('fairyloot')
    expect(normalizeInstagramHandle('https://www.instagram.com/fairyloot')).toBe('fairyloot')
    expect(normalizeInstagramHandle('http://instagram.com/fairyloot')).toBe('fairyloot')
  })

  it('strips a trailing slash or query string from a URL', () => {
    expect(normalizeInstagramHandle('https://instagram.com/fairyloot/')).toBe('fairyloot')
    expect(normalizeInstagramHandle('https://instagram.com/fairyloot?hl=en')).toBe('fairyloot')
  })

  it('lowercases the result so comparisons are case-insensitive', () => {
    expect(normalizeInstagramHandle('@FairyLoot')).toBe('fairyloot')
  })
})

describe('parsePhotoCredits', () => {
  it('returns an empty array for empty/missing input', () => {
    expect(parsePhotoCredits(null)).toEqual([])
    expect(parsePhotoCredits(undefined)).toEqual([])
    expect(parsePhotoCredits('')).toEqual([])
  })

  it('parses a single handle with no role', () => {
    expect(parsePhotoCredits('@janedoe')).toEqual([{ handle: 'janedoe', role: null }])
  })

  it('preserves the artist-role-in-parentheses functionality', () => {
    expect(parsePhotoCredits('@janedoe (Cover Art)')).toEqual([{ handle: 'janedoe', role: 'Cover Art' }])
  })

  it('parses multiple comma-separated handles, mixing roles and no-roles', () => {
    expect(parsePhotoCredits('@janedoe (Cover Art), @studioxyz, @johnsmith (Photography)')).toEqual([
      { handle: 'janedoe', role: 'Cover Art' },
      { handle: 'studioxyz', role: null },
      { handle: 'johnsmith', role: 'Photography' },
    ])
  })
})

describe('buildPhotoCredits', () => {
  it('returns just the parsed credits when the company has no Instagram handle', () => {
    expect(buildPhotoCredits('@janedoe (Cover Art)', null)).toEqual([
      { handle: 'janedoe', role: 'Cover Art' },
    ])
  })

  it('auto-appends the company handle when photoCredit is empty (no dedicated artist)', () => {
    expect(buildPhotoCredits(null, '@fairyloot')).toEqual([{ handle: 'fairyloot', role: null }])
    expect(buildPhotoCredits('', 'https://instagram.com/fairyloot')).toEqual([{ handle: 'fairyloot', role: null }])
  })

  it('appends the company handle alongside an existing named artist credit', () => {
    expect(buildPhotoCredits('@janedoe (Cover Art)', '@fairyloot')).toEqual([
      { handle: 'janedoe', role: 'Cover Art' },
      { handle: 'fairyloot', role: null },
    ])
  })

  it('returns an empty array when neither photoCredit nor the company handle is set', () => {
    expect(buildPhotoCredits(null, null)).toEqual([])
    expect(buildPhotoCredits('', undefined)).toEqual([])
  })

  // Deduplication — the actual bug this function exists to avoid: some editions already have
  // the company's own handle typed into photoCredit by hand (the old manual workaround), and
  // auto-appending it again would show it twice.
  describe('deduplication against an already-typed company handle', () => {
    it('does not duplicate an exact match', () => {
      expect(buildPhotoCredits('@fairyloot', '@fairyloot')).toEqual([{ handle: 'fairyloot', role: null }])
    })

    it('does not duplicate when casing differs between the two sources', () => {
      expect(buildPhotoCredits('@FairyLoot', '@fairyloot')).toEqual([{ handle: 'FairyLoot', role: null }])
      expect(buildPhotoCredits('@fairyloot', '@FairyLoot')).toEqual([{ handle: 'fairyloot', role: null }])
    })

    it('does not duplicate when the company field is a full URL but photoCredit has the bare handle', () => {
      expect(buildPhotoCredits('@fairyloot', 'https://instagram.com/fairyloot')).toEqual([
        { handle: 'fairyloot', role: null },
      ])
    })

    it('does not duplicate when the already-typed handle carries a role in parentheses', () => {
      expect(buildPhotoCredits('@fairyloot (Team Photo)', '@fairyloot')).toEqual([
        { handle: 'fairyloot', role: 'Team Photo' },
      ])
    })

    it('still appends the company handle when photoCredit has a different, unrelated handle', () => {
      expect(buildPhotoCredits('@someoneelse', '@fairyloot')).toEqual([
        { handle: 'someoneelse', role: null },
        { handle: 'fairyloot', role: null },
      ])
    })

    it('dedupes against just one matching entry among several credits', () => {
      expect(buildPhotoCredits('@janedoe (Cover Art), @fairyloot, @johnsmith (Photography)', '@fairyloot')).toEqual([
        { handle: 'janedoe', role: 'Cover Art' },
        { handle: 'fairyloot', role: null },
        { handle: 'johnsmith', role: 'Photography' },
      ])
    })
  })
})
