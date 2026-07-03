'use client'

import { useEffect } from 'react'

/**
 * Globally limits date/datetime-local inputs to correct digit counts per section.
 * Strategy: preventive keydown handler that tracks which section the user is in
 * (month/day/year/hour/minute) and blocks digits that would exceed the section limit.
 * Falls back to a reactive input-event clamp for edge cases (paste, etc.).
 */

// Section digit limits: date = [month(2), day(2), year(4)]
//                       datetime-local = [month(2), day(2), year(4), hour(2), minute(2)]
const SECTION_LIMITS: Record<string, number[]> = {
  date: [2, 2, 4],
  'datetime-local': [2, 2, 4, 2, 2],
}

interface SectionState { section: number; count: number }
const sectionState = new WeakMap<HTMLInputElement, SectionState>()

function isDateInput(el: EventTarget | null): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    (el.type === 'date' || el.type === 'datetime-local')
  )
}

export function DateInputYearGuard() {
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (!isDateInput(e.target)) return
      sectionState.set(e.target, { section: 0, count: 0 })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isDateInput(e.target)) return
      const input = e.target
      const state = sectionState.get(input) ?? { section: 0, count: 0 }
      const limits = SECTION_LIMITS[input.type] ?? [2, 2, 4]
      const maxSection = limits.length - 1

      if (e.key === 'ArrowLeft') {
        sectionState.set(input, { section: Math.max(0, state.section - 1), count: 0 })
        return
      }
      if (e.key === 'ArrowRight') {
        sectionState.set(input, { section: Math.min(maxSection, state.section + 1), count: 0 })
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        sectionState.set(input, { section: state.section, count: Math.max(0, state.count - 1) })
        return
      }
      if (!/^\d$/.test(e.key)) return

      // Digit key — enforce section limit
      const limit = limits[state.section] ?? 4
      const newCount = state.count + 1

      if (newCount > limit) {
        e.preventDefault()
        return
      }

      // Advance to next section when this one is full
      if (newCount === limit) {
        sectionState.set(input, { section: Math.min(maxSection, state.section + 1), count: 0 })
      } else {
        sectionState.set(input, { section: state.section, count: newCount })
      }
    }

    // Reactive fallback: catch anything that slips through (paste, autofill, etc.)
    let correcting = false
    const onInput = (e: Event) => {
      if (correcting) return
      if (!isDateInput(e.target)) return
      const input = e.target
      const val = input.value
      if (!val) return
      const dashIdx = val.indexOf('-')
      if (dashIdx <= 4) return
      correcting = true
      const newVal = val.slice(0, 4) + val.slice(dashIdx)
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (setter) {
        setter.call(input, newVal)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        input.value = newVal
      }
      correcting = false
    }

    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('input', onInput, true)
    return () => {
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('input', onInput, true)
    }
  }, [])

  return null
}
