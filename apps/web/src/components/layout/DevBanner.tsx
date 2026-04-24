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
      style={{ background: 'linear-gradient(90deg, #78350f 0%, #92400e 50%, #78350f 100%)', color: '#fef3c7' }}
    >
      <div className="flex items-center gap-2 flex-1 justify-center">
        <Construction size={13} className="shrink-0 opacity-80" />
        <span>
          LuxGrimoire is under active development — you may encounter bugs or incomplete features.
          Found something? Use the <strong className="font-semibold">Report a Bug</strong> button.
        </span>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 p-0.5 rounded opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  )
}
