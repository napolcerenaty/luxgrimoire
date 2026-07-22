'use client'

import { useEffect, useState } from 'react'

interface Parts {
  expired: boolean
  days: number
  hours: number
  minutes: number
  seconds: number
}

function compute(target: Date): Parts {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    expired: false,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

function Box({ val }: { val: string }) {
  return (
    <span
      className="tabular-nums rounded px-1.5 py-0.5 text-xs font-bold"
      style={{
        background: 'var(--accent-glow)',
        border: '1px solid var(--accent-border)',
        color: 'var(--accent-bright)',
      }}
    >
      {val}
    </span>
  )
}

export function SaleRowCountdown({ dateStr, className = 'ml-2' }: { dateStr: string; className?: string }) {
  const target = new Date(dateStr)
  const [parts, setParts] = useState<Parts>(() => compute(target))

  useEffect(() => {
    const id = setInterval(() => setParts(compute(target)), 1_000)
    return () => clearInterval(id)
  }, [dateStr])

  if (parts.expired) {
    return (
      <span className={`${className} shrink-0 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-green-900/70 border border-green-600 text-green-400`}>
        Live
      </span>
    )
  }

  return (
    <div className={`${className} flex shrink-0 items-center gap-1`}>
      {parts.days > 0 && <Box val={`${parts.days}d`} />}
      <Box val={`${String(parts.hours).padStart(2, '0')}h`} />
      <Box val={`${String(parts.minutes).padStart(2, '0')}m`} />
      <Box val={`${String(parts.seconds).padStart(2, '0')}s`} />
    </div>
  )
}
