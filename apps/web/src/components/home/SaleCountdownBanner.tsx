'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

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
