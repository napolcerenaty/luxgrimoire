'use client'

import { useEffect } from 'react'

/**
 * Globally limits the year portion of all <input type="date"> / <input type="datetime-local">
 * fields to 4 digits. Without this, browsers allow typing arbitrarily long years (e.g. 20241).
 *
 * Strategy: on every `input` event for a date field, if the year portion has more than 4 digits
 * we clamp the value by reconstructing the date string with only the first 4 year digits.
 */
export function DateInputYearGuard() {
  useEffect(() => {
    const handler = (e: Event) => {
      const input = e.target
      if (!(input instanceof HTMLInputElement)) return
      if (input.type !== 'date' && input.type !== 'datetime-local') return

      const val = input.value
      if (!val) return

      // Both "date" (YYYY-MM-DD) and "datetime-local" (YYYY-MM-DDTHH:mm) start with the year
      const dashIdx = val.indexOf('-')
      if (dashIdx <= 4) return // year is already 4 digits or less

      // Clamp year to 4 digits
      const clampedYear = val.slice(0, 4)
      const rest = val.slice(dashIdx)
      const newVal = clampedYear + rest

      // Use a native setter to properly trigger React's synthetic events
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, newVal)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        input.value = newVal
      }
    }

    document.addEventListener('input', handler, true)
    return () => document.removeEventListener('input', handler, true)
  }, [])

  return null
}
