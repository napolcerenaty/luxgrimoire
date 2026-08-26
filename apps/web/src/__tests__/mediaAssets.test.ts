/**
 * Unit tests for mediaAssets.ts helpers used by the admin Media Library page:
 * assetName() derives a display name from a Cloudinary publicId, and
 * usageDeleteBlockReason() decides whether the delete button should be disabled.
 */
import { describe, it, expect } from 'vitest'
import { assetName, usageDeleteBlockReason } from '../lib/mediaAssets'

describe('assetName', () => {
  it('returns the last path segment of a publicId', () => {
    expect(assetName('luxgrimoire/covers/spring-box')).toBe('spring-box')
  })

  it('returns the whole string when there is no slash', () => {
    expect(assetName('spring-box')).toBe('spring-box')
  })

  it('falls back to the original string for a trailing-slash publicId', () => {
    expect(assetName('luxgrimoire/covers/')).toBe('luxgrimoire/covers/')
  })

  it('returns an empty string for an empty publicId', () => {
    expect(assetName('')).toBe('')
  })
})

describe('usageDeleteBlockReason', () => {
  it('returns false (deletable) when there are zero usages', () => {
    expect(usageDeleteBlockReason(0)).toBe(false)
  })

  it('returns a singular reason string for exactly one reference', () => {
    expect(usageDeleteBlockReason(1)).toBe('In use (1 reference)')
  })

  it('returns a pluralized reason string for more than one reference', () => {
    expect(usageDeleteBlockReason(3)).toBe('In use (3 references)')
  })
})
