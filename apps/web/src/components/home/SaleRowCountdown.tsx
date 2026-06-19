'use client'

import { useEffect, useState } from 'react'

interface Parts {
  days: number
  hours: number
  minutes: number
  label: string
}

function compute(target: Date): Parts {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, label: 'now' }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)

  if (days === 0 && hours === 0) return { days, hours, minutes, label: `${minutes}m` }
  if (days === 0) return { days, hours, minutes, label: `${hours}h ${minutes}m` }
  if (days === 1) return { days, hours, minutes, label: `tomorrow` }
  return { days, hours, minutes, label: `${days}d ${hours}h` }
}

export function SaleRowCountdown({ dateStr, isFirst }: { dateStr: string; isFirst: boolean }) {
  const target = new Date(dateStr)
  const [parts, setParts] = useState<Parts>(() => compute(target))

  useEffect(() => {
    const id = setInterval(() => setParts(compute(target)), 60_000)
    return () => clearInterval(id)
  }, [dateStr])

  if (!isFirst) {
    // Simple styled badge for non-first rows
    return (
      <span className="ml-3 shrink-0 text-xs font-semibold text-amber-400/80">
        {parts.label}
      </span>
    )
  }

  // Compact countdown boxes for the soonest sale
  if (parts.days >= 2) {
    return (
      <div className="ml-3 flex shrink-0 items-center gap-1">
        <span className="tabular-nums rounded px-1.5 py-0.5 text-xs font-bold"
          style={{ background: 'rgba(42,158,196,0.15)', color: 'var(--accent-bright)' }}>
          {parts.days}d
        </span>
        <span className="tabular-nums rounded px-1.5 py-0.5 text-xs font-bold"
          style={{ background: 'rgba(42,158,196,0.15)', color: 'var(--accent-bright)' }}>
          {String(parts.hours).padStart(2, '0')}h
        </span>
      </div>
    )
  }

  return (
    <div className="ml-3 flex shrink-0 items-center gap-1">
      {parts.days > 0 && (
        <span className="tabular-nums rounded px-1.5 py-0.5 text-xs font-bold"
          style={{ background: 'rgba(42,158,196,0.15)', color: 'var(--accent-bright)' }}>
          {parts.days}d
        </span>
      )}
      <span className="tabular-nums rounded px-1.5 py-0.5 text-xs font-bold"
        style={{ background: 'rgba(42,158,196,0.15)', color: 'var(--accent-bright)' }}>
        {String(parts.hours).padStart(2, '0')}h
      </span>
      <span className="tabular-nums rounded px-1.5 py-0.5 text-xs font-bold"
        style={{ background: 'rgba(42,158,196,0.15)', color: 'var(--accent-bright)' }}>
        {String(parts.minutes).padStart(2, '0')}m
      </span>
    </div>
  )
}
