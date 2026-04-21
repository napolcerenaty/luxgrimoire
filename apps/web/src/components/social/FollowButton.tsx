'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'

interface Props {
  username: string
  initialIsFollowing: boolean
}

export function FollowButton({ username, initialIsFollowing }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    if (!user) {
      router.push('/login')
      return
    }

    startTransition(async () => {
      try {
        if (isFollowing) {
          await authFetch(`/social/follow/${username}`, { method: 'DELETE' })
          setIsFollowing(false)
        } else {
          await authFetch(`/social/follow/${username}`, { method: 'POST' })
          setIsFollowing(true)
        }
      } catch {
        // revert on error
        setIsFollowing((prev) => !prev)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
        isFollowing
          ? 'bg-stone-800 border border-stone-700 text-stone-300 hover:bg-red-900/30 hover:border-red-500/30 hover:text-red-400'
          : 'bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold'
      }`}
    >
      {isPending ? '…' : isFollowing ? 'Following' : 'Follow'}
    </button>
  )
}
