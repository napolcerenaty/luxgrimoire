'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { getNewsUnreadCount, markNewsSeen } from '@/lib/api'
import { getNewsLastSeenCookie, setNewsLastSeenCookie } from '@/lib/newsCookie'

/**
 * Shared unread-count logic for NewsBell and the /news page (spec 8.1/8.2):
 * logged-in users get their count from the server cursor (User.newsLastSeenAt,
 * read automatically via the auth cookie); anonymous visitors pass their own
 * `news_last_seen_at` cookie as `since`.
 */
export function useNewsUnreadCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const since = user ? undefined : getNewsLastSeenCookie()
      const res = await getNewsUnreadCount(since)
      setCount(res.count)
    } catch {
      // silently fail — a stale/wrong badge count is not worth surfacing an error for
    }
  }, [user])

  /** Called when the user actually opens the full /news list — clears the badge (never on teaser render, spec 8). */
  const markSeen = useCallback(async () => {
    if (user) {
      await markNewsSeen().catch(() => {})
    } else {
      setNewsLastSeenCookie(new Date().toISOString())
    }
    setCount(0)
  }, [user])

  return { count, refresh, markSeen }
}
