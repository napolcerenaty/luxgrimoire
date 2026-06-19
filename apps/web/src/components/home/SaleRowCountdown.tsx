'use client'

import { useEffect, useState } from 'react'

interface Parts {
  days: number
  hours: number
  minutes: number
}

function compute(target: Date): Parts {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0 }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
  }
}

function Box({ val }: { val: string }) {
  return (
    <span
      className="tabular-nums rounded px-1.5 py-0.5 text-xs font-bold"
      style={{ background: 'rgba(42,158,196,0.15)', color: 'var(--accent-bright)' }}
    >
      {val}
    </span>
  )
}

export function SaleRowCountdown({ dateStr, isFirst }: { dateStr: string; isFirst: boolean }) {
  const target = new Date(dateStr)
  const [parts, setParts] = useState<Parts>(() => compute(target))

  useEffect(() => {
    const id = setInterval(() => setParts(compute(target)), 60_000)
    return () => clearInterval(id)
  }, [dateStr])

  // First row (soonest): show days+hrs+min if < 2 days, else days+hrs
  if (isFirst && parts.days < 2) {
    return (
      <div className="ml-3 flex shrink-0 items-center gap-1">
        {parts.days > 0 && <Box val={`${parts.days}d`} />}
        <Box val={`${String(parts.hours).padStart(2, '0')}h`} />
        <Box val={`${String(parts.minutes).padStart(2, '0')}m`} />
      </div>
    )
  }

  // All other rows (or first with many days): days + hrs
  return (
    <div className="ml-3 flex shrink-0 items-center gap-1">
      {parts.days > 0 && <Box val={`${parts.days}d`} />}
      <Box val={`${String(parts.hours).padStart(2, '0')}h`} />
    </div>
  )
}
