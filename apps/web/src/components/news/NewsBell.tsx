'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Newspaper } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { useNewsUnreadCount } from './useNewsUnreadCount'

/**
 * Icon + unread badge next to NotificationBell (spec section 9) — 1 tap from
 * any page to /news, no need to open the mobile hamburger. Deliberately no
 * dropdown (unlike NotificationBell) — the spec calls for a simple counter,
 * not an inbox preview.
 */
export function NewsBell() {
  const router = useRouter()
  const { user } = useAuth()
  const { count, refresh } = useNewsUnreadCount()

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 60_000)
    return () => clearInterval(interval)
  }, [refresh, user?.id])

  const handleClick = useCallback(() => {
    router.push('/news')
  }, [router])

  return (
    <button
      onClick={handleClick}
      className="relative p-1.5 rounded-lg text-stone-400 hover:text-amber-400 transition-colors"
      aria-label="News"
      title="News"
    >
      <Newspaper size={18} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-amber-400 text-stone-950 text-[10px] font-bold flex items-center justify-center leading-none">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
