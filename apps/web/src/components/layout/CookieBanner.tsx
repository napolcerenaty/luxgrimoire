'use client'

import { useEffect, useState } from 'react'
import { Cookie, X } from 'lucide-react'

const STORAGE_KEY = 'lx-cookie-consent'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY)
    if (!consent) setVisible(true)
  }, [])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie information"
      className="fixed bottom-0 left-0 right-0 z-[70] border-t border-amber-800/20 bg-stone-900/95 backdrop-blur-md"
    >
      <div className="mx-auto max-w-5xl flex items-start sm:items-center gap-4 px-4 py-4 sm:flex-row flex-col">
        <Cookie
          size={18}
          className="shrink-0 text-amber-400/60 mt-0.5 sm:mt-0"
          aria-hidden
        />

        <p className="flex-1 text-xs leading-relaxed text-stone-400">
          <span className="font-medium text-stone-300">
            We use browser storage to keep you signed in and remember your theme preference.
          </span>{' '}
          We do{' '}
          <strong className="font-semibold text-stone-200">
            not
          </strong>{' '}
          use tracking, analytics or advertising cookies.{' '}
          {/* Update when Faza 4 httpOnly session cookie is added */}
          All stored data stays on your device and is used solely to make the app work.
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={accept}
            className="rounded px-4 py-1.5 text-xs font-medium transition-all bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            Got it
          </button>
          <button
            onClick={accept}
            className="p-1 rounded transition-opacity opacity-50 hover:opacity-100 text-stone-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
