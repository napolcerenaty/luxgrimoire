'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface MultiSelectProps {
  /** Plural noun used in the closed-state placeholder, e.g. "genres" → "All genres" */
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}

/** Dropdown checklist for selecting zero or more of a flat string option list. */
export function MultiSelect({ label, options, selected, onChange, className = '' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const toggleOption = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const buttonLabel = selected.length === 0
    ? `All ${label}`
    : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label} selected`

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 bg-stone-800 border text-sm rounded-lg px-3 py-1.5 focus:outline-none transition-colors ${
          selected.length > 0 ? 'border-amber-600 text-amber-400' : 'border-stone-700 text-stone-200 hover:border-stone-500'
        }`}
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[12rem] max-h-64 overflow-y-auto bg-stone-800 border border-stone-700 rounded-lg shadow-xl p-1.5">
          {options.length === 0 ? (
            <p className="text-xs text-stone-500 px-2 py-1.5">No options</p>
          ) : (
            options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-700/60 cursor-pointer text-sm text-stone-200">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  className="accent-amber-500 w-3.5 h-3.5 shrink-0"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}
