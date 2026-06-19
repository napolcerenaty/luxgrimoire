'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

interface Props {
  announcements: ApiSaleAnnouncement[]
}

function getDayDiff(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)

  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function SaleCountdownBanner({ announcements }: Props) {
  const nextSale = useMemo(() => {
    return announcements
      .filter((announcement) => announcement.generalSaleDate)
      .map((announcement) => ({
        announcement,
        days: getDayDiff(announcement.generalSaleDate!),
      }))
      .filter(({ days }) => days >= 0)
      .sort((a, b) => a.days - b.days)[0] ?? null
  }, [announcements])

  if (!nextSale || nextSale.days > 14) return null

  const message = nextSale.days === 0
    ? 'happening today!'
    : nextSale.days === 1
      ? 'tomorrow'
      : `in ${nextSale.days} days`

  return (
    <div className="border border-amber-800/40 bg-amber-900/20 px-4 py-2 text-center text-sm text-amber-300">
      <span>🔔 Next sale: {nextSale.announcement.title} — {message}</span>
      <span className="mx-2 text-amber-500/70">|</span>
      <Link href="/sale-announcements" className="font-serif hover:text-amber-200">
        View →
      </Link>
    </div>
  )
}
