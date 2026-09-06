import { describe, it, expect, afterEach } from 'vitest'
import { getSignupSource } from '@/lib/attribution'

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', { value, writable: true, configurable: true })
}

afterEach(() => setCookie(''))

describe('getSignupSource', () => {
  it('returns undefined when no lg_src cookie is present', () => {
    setCookie('foo=bar; baz=qux')
    expect(getSignupSource()).toBeUndefined()
  })

  it('returns the decoded lg_src payload when present', () => {
    const payload = JSON.stringify({ ref: 'alice', lp: '/editions/foo', t: '1' })
    setCookie(`other=1; lg_src=${encodeURIComponent(payload)}; more=2`)
    expect(getSignupSource()).toBe(payload)
  })

  it('returns undefined for an empty lg_src value', () => {
    setCookie('lg_src=')
    expect(getSignupSource()).toBeUndefined()
  })

  it('caps the returned value at 512 chars', () => {
    setCookie(`lg_src=${'x'.repeat(2000)}`)
    expect(getSignupSource()!.length).toBe(512)
  })
})
