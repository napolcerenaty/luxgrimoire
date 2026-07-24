'use client'

import { useEffect, useState } from 'react'

function getCountdown(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now())
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return { days, hours, minutes, seconds, done: diff <= 0 }
}

function Segment({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl sm:text-3xl font-serif font-bold text-amber-400 tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-stone-500">{label}</span>
    </div>
  )
}

interface Props {
  date: string
  /** The tier's own free-text name (e.g. "First Access", "VIP Access") — no longer a fixed code. */
  tier: string
  title: string | null
  personalized: boolean
}

export function SaleCountdownCounter({ date, tier, title, personalized }: Props) {
  const target = new Date(date)
  const [countdown, setCountdown] = useState(() => getCountdown(target))

  useEffect(() => {
    const id = setInterval(() => setCountdown(getCountdown(target)), 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  return (
    <div className="rounded-2xl border border-amber-800/40 bg-gradient-to-br from-stone-900 to-amber-950/20 p-5">
      <p className="text-xs uppercase tracking-widest text-amber-600 font-medium mb-1">
        {personalized ? `Your ${tier} countdown` : `Next sale — ${tier}`}
      </p>
      {title && <p title={title} className="text-sm text-stone-300 font-serif mb-3 line-clamp-1">{title}</p>}
      {countdown.done ? (
        <p className="text-lg font-serif text-amber-400">It&apos;s here!</p>
      ) : (
        <div className="flex items-center gap-4">
          <Segment value={countdown.days} label="Days" />
          <Segment value={countdown.hours} label="Hrs" />
          <Segment value={countdown.minutes} label="Min" />
          <Segment value={countdown.seconds} label="Sec" />
        </div>
      )}
    </div>
  )
}
