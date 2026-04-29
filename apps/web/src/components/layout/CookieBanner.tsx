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
      className="fixed bottom-0 left-0 right-0 z-[70] border-t"
      style={{
        background: 'rgba(12, 10, 9, 0.97)',
        borderColor: 'rgba(245,158,11,0.15)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="mx-auto max-w-5xl flex items-start sm:items-center gap-4 px-4 py-4 sm:flex-row flex-col">
        <Cookie
          size={18}
          className="shrink-0 text-amber-400/60 mt-0.5 sm:mt-0"
          aria-hidden
        />

        <p className="flex-1 text-xs leading-relaxed" style={{ color: '#a09070' }}>
          <span style={{ color: '#d4b896' }} className="font-medium">
            We use browser storage (localStorage) to keep you signed in, remember your
            language and theme preferences, and save your region selections.
          </span>{' '}
          We do{' '}
          <strong className="font-semibold" style={{ color: '#d6c89a' }}>
            not
          </strong>{' '}
          use tracking, analytics or advertising cookies.{' '}
          {/* Update this text when Faza 4 httpOnly session cookie is added */}
          All stored data stays on your device and is used solely to make the app work.
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={accept}
            className="rounded px-4 py-1.5 text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            style={{
              background: 'rgba(245,158,11,0.12)',
              color: '#d4a843',
              border: '1px solid rgba(245,158,11,0.25)',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(245,158,11,0.22)'
              e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)'
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(245,158,11,0.12)'
              e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)'
            }}
          >
            Got it
          </button>
          <button
            onClick={accept}
            className="p-1 rounded transition-opacity opacity-50 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            style={{ color: '#7a6a50' }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
