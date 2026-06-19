'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

interface CountdownParts {
  days: number
  hours: number
  minutes: number
  expired: boolean
  within14Days: boolean
}

function getCountdown(target: Date): CountdownParts {
  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) return { days: 0, hours: 0, minutes: 0, expired: true, within14Days: true }
  const days = Math.floor(diffMs / 86400000)
  const hours = Math.floor((diffMs % 86400000) / 3600000)
  const minutes = Math.floor((diffMs % 3600000) / 60000)
  return { days, hours, minutes, expired: false, within14Days: days <= 14 }
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="min-w-[2.2rem] rounded-md bg-amber-900/40 px-2 py-1 text-center font-serif text-xl font-bold tabular-nums text-amber-300 leading-tight border border-amber-800/40"
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-widest text-amber-600">{label}</span>
    </div>
  )
}

export function SaleCountdownBanner({ announcements }: { announcements: ApiSaleAnnouncement[] }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const now = new Date()
  const nextSale = announcements
    .filter((a) => a.generalSaleDate && new Date(a.generalSaleDate) > now)
    .sort((a, b) => new Date(a.generalSaleDate!).getTime() - new Date(b.generalSaleDate!).getTime())[0] ?? null

  if (!nextSale?.generalSaleDate) return null

  const countdown = getCountdown(new Date(nextSale.generalSaleDate))
  if (countdown.expired || !countdown.within14Days) return null

  const title = nextSale.title.length > 45 ? `${nextSale.title.slice(0, 45)}…` : nextSale.title

  return (
    <div className="border-y border-amber-900/40 bg-gradient-to-r from-transparent via-amber-950/20 to-transparent">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
          {/* Label + title */}
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="text-amber-500">🔔</span>
            <div>
              <span className="text-xs uppercase tracking-widest text-amber-700">Next sale</span>
              <Link
                href={`/sale-announcements/${nextSale.id}`}
                className="ml-2 text-sm font-medium text-amber-300 transition-colors hover:text-amber-200"
              >
                {title}
              </Link>
            </div>
          </div>

          {/* Countdown boxes */}
          <div className="flex items-end gap-2">
            {countdown.days > 0 && <CountdownBox value={countdown.days} label="days" />}
            <CountdownBox value={countdown.hours} label="hrs" />
            <CountdownBox value={countdown.minutes} label="min" />
            <Link
              href={`/sale-announcements/${nextSale.id}`}
              className="mb-4 ml-1 rounded-full border border-amber-800/50 px-3 py-1 text-xs text-amber-500 transition-colors hover:border-amber-600 hover:text-amber-400"
            >
              View →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}


function formatCountdown(target: Date): string {
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return ''

  const days = Math.floor(diffMs / 86400000)
  const hours = Math.floor((diffMs % 86400000) / 3600000)

  if (days > 14) return ''
  if (days === 0 && hours === 0) return 'happening now!'
  if (days === 0) return `in ${hours}h`
  if (days === 1) return hours > 0 ? `tomorrow (${hours}h)` : 'tomorrow'
  return `in ${days} days`
}

export function SaleCountdownBanner({ announcements }: { announcements: ApiSaleAnnouncement[] }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const nextSale = announcements
    .filter((announcement) => announcement.generalSaleDate && new Date(announcement.generalSaleDate) > now)
    .sort(
      (a, b) =>
        new Date(a.generalSaleDate!).getTime() - new Date(b.generalSaleDate!).getTime(),
    )[0] ?? null

  if (!nextSale?.generalSaleDate) return null

  const countdown = formatCountdown(new Date(nextSale.generalSaleDate))
  if (!countdown) return null

  const title = nextSale.title.length > 50 ? `${nextSale.title.slice(0, 50)}…` : nextSale.title

  return (
    <div className="border-b border-amber-800/40 bg-amber-900/20">
      <div className="container mx-auto flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-sm">
        <span className="text-amber-400">🔔</span>
        <span className="text-amber-300/80">Next sale:</span>
        <Link
          href={`/sale-announcements/${nextSale.id}`}
          className="max-w-[280px] truncate font-medium text-amber-300 transition-colors hover:text-amber-200 sm:max-w-none"
        >
          {title}
        </Link>
        <span className="text-amber-500">—</span>
        <span className="font-semibold text-amber-400">{countdown}</span>
        <Link
          href={`/sale-announcements/${nextSale.id}`}
          className="rounded-full border border-amber-800/60 px-2 py-0.5 text-xs text-amber-500 transition-colors hover:text-amber-400"
        >
          View →
        </Link>
      </div>
    </div>
  )
}
