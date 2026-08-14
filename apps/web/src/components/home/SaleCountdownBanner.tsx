'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  expired: boolean
  within14Days: boolean
}

function getCountdown(target: Date): CountdownParts {
  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, within14Days: true }
  const days = Math.floor(diffMs / 86400000)
  const hours = Math.floor((diffMs % 86400000) / 3600000)
  const minutes = Math.floor((diffMs % 3600000) / 60000)
  const seconds = Math.floor((diffMs % 60000) / 1000)
  return { days, hours, minutes, seconds, expired: false, within14Days: days <= 14 }
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="min-w-[2.2rem] rounded-md px-2 py-1 text-center font-serif text-xl font-bold tabular-nums leading-tight"
        style={{
          background: 'var(--accent-glow)',
          border: '1px solid var(--accent-border, rgba(42,158,196,0.3))',
          color: 'var(--accent-bright)',
        }}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-widest text-navy-500">{label}</span>
    </div>
  )
}

interface NextSale {
  date: string
  announcementId: string
  title: string
}

export function SaleCountdownBanner({ nextSale }: { nextSale: NextSale }) {
  // Computed client-side only: getCountdown() reads Date.now(), so calling it directly during
  // render produces a different value at SSR time vs. client hydration a moment later — a text
  // mismatch React then has to discard and re-render. Starting from null and filling it in via
  // effect means the server never renders a Date-derived number at all.
  const [countdown, setCountdown] = useState<CountdownParts | null>(null)

  useEffect(() => {
    const update = () => setCountdown(getCountdown(new Date(nextSale.date)))
    update()
    const id = setInterval(update, 1_000)
    return () => clearInterval(id)
  }, [nextSale.date])

  if (!countdown || countdown.expired || !countdown.within14Days) return null

  const title = nextSale.title.length > 45 ? `${nextSale.title.slice(0, 45)}…` : nextSale.title

  return (
    <div className="border-y border-navy-800 bg-navy-900/40">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
          {/* Label + title */}
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span>🔔</span>
            <div>
              <span className="text-xs uppercase tracking-widest text-navy-500">Next sale</span>
              <Link
                href={`/sale-announcements/${nextSale.announcementId}`}
                className="ml-2 text-sm font-medium text-brand-400 transition-colors hover:text-brand-300"
              >
                {title}
              </Link>
            </div>
          </div>

          {/* Countdown boxes */}
          <div className="flex items-end gap-2">
            {countdown.days > 0 && <CountdownBox value={countdown.days} label={countdown.days === 1 ? 'day' : 'days'} />}
            <CountdownBox value={countdown.hours} label="hrs" />
            <CountdownBox value={countdown.minutes} label="min" />
            <CountdownBox value={countdown.seconds} label="sec" />
            <Link
              href={`/sale-announcements/${nextSale.announcementId}`}
              className="mb-4 ml-1 rounded-full border border-navy-700 px-3 py-1 text-xs text-navy-400 transition-colors hover:border-navy-500 hover:text-navy-200"
            >
              View →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

