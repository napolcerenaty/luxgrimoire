'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { Heart } from 'lucide-react'

type FollowTargetType = 'artist' | 'author' | 'book'

const PATH_SEGMENT: Record<FollowTargetType, string> = {
  artist: 'artists',
  author: 'authors',
  book: 'books',
}

interface FollowButtonProps {
  targetType: FollowTargetType
  targetId: string
}

export function FollowButton({ targetType, targetId }: FollowButtonProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [following, setFollowing] = useState<boolean | 'loading'>('loading')
  const [isPending, setIsPending] = useState(false)

  const segment = PATH_SEGMENT[targetType]

  useEffect(() => {
    if (!user) { setFollowing(false); return }

    authFetch<{ following: boolean }>(`/follows/${segment}/${targetId}`)
      .then((res) => setFollowing(res.following))
      .catch(() => setFollowing(false))
  }, [segment, targetId, user])

  const handleToggle = async () => {
    if (!user || following === 'loading') return
    setIsPending(true)
    try {
      if (following) {
        await authFetch<void>(`/follows/${segment}/${targetId}`, { method: 'DELETE' })
        setFollowing(false)
      } else {
        await authFetch<unknown>(`/follows/${segment}/${targetId}`, { method: 'POST' })
        setFollowing(true)
      }
      void queryClient.invalidateQueries({ queryKey: ['follows'] })
    } finally {
      setIsPending(false)
    }
  }

  if (!user || following === 'loading') return null

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      title={following ? 'Unfollow' : 'Follow'}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border ${
        following
          ? 'bg-brand-500/10 border-brand-500/50 text-brand-400 hover:bg-brand-500/20'
          : 'bg-navy-800 border-navy-700 text-navy-200 hover:bg-navy-700 hover:border-navy-600'
      }`}
    >
      <Heart size={15} className={following ? 'fill-current' : ''} />
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
