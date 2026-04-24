'use client'

import { useEffect, useState } from 'react'
import { X, Construction } from 'lucide-react'

const STORAGE_KEY = 'luxgrimoire_dev_banner_dismissed'

export function DevBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem(STORAGE_KEY)
      if (!dismissed) setVisible(true)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="relative z-[60] flex items-center justify-between gap-3 px-4 py-2 text-xs font-medium"
      style={{ background: 'var(--grad-header, #1c1917)', borderBottom: '1px solid rgba(245,158,11,0.2)', color: '#d6c89a' }}
    >
      <div className="flex items-center gap-2 flex-1 justify-center">
        <Construction size={13} className="shrink-0 text-amber-400/70" />
        <span style={{ color: '#b0956a' }}>
          LuxGrimoire is under active development — you may encounter bugs or incomplete features.
          Found something?{' '}
          <strong className="font-semibold" style={{ color: '#d4a843' }}>Use the Report a Bug button.</strong>
        </span>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 p-0.5 rounded transition-opacity"
        style={{ color: '#7a6a50', opacity: 0.7 }}
        aria-label="Dismiss"
        onMouseOver={e => (e.currentTarget.style.opacity = '1')}
        onMouseOut={e => (e.currentTarget.style.opacity = '0.7')}
      >
        <X size={13} />
      </button>
    </div>
  )
}
