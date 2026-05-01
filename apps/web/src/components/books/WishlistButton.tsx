'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/lib/authFetch'
import { useAuth } from '@/components/AuthProvider'
import { Bookmark, BookmarkCheck } from 'lucide-react'

interface EntryStatus {
  status: 'none' | 'wishlist' | 'collection'
  entryId?: string
}

interface WishlistButtonProps {
  editionId: string
}

export function WishlistButton({ editionId }: WishlistButtonProps) {
  const { user } = useAuth()
  const [status, setStatus] = useState<EntryStatus['status'] | 'loading'>('loading')
  const [entryId, setEntryId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (!user) { setStatus('none'); return }

    authFetch<EntryStatus>(`/collection/status/${editionId}`)
      .then(res => { setStatus(res.status); setEntryId(res.entryId ?? null) })
      .catch(() => setStatus('none'))
  }, [editionId, user])

  const handleAdd = async () => {
    setIsPending(true)
    try {
      const res = await authFetch<{ id: string }>('/collection/wishlist', {
        method: 'POST',
        body: JSON.stringify({ bookEditionId: editionId }),
      })
      setStatus('wishlist')
      setEntryId(res.id)
    } catch {
      // silently fail — user may not be logged in or edition already tracked
    } finally {
      setIsPending(false)
    }
  }

  const handleRemove = async () => {
    if (!entryId) return
    setIsPending(true)
    try {
      await authFetch<void>(`/collection/${entryId}`, { method: 'DELETE' })
      setStatus('none')
      setEntryId(null)
    } finally {
      setIsPending(false)
    }
  }

  if (status === 'loading') return null
  if (!user) return null

  if (status === 'collection') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-stone-400">
        <BookmarkCheck size={15} className="text-amber-400" />
        In your collection
      </span>
    )
  }

  if (status === 'wishlist') {
    return (
      <button
        onClick={handleRemove}
        disabled={isPending}
        title="Remove from wishlist"
        className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 disabled:opacity-50 text-sm transition-colors"
      >
        <BookmarkCheck size={16} />
        On Wishlist
      </button>
    )
  }

  return (
    <button
      onClick={handleAdd}
      disabled={isPending}
      className="inline-flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700 hover:border-stone-600"
    >
      <Bookmark size={16} />
      {isPending ? 'Adding…' : 'Add to Wishlist'}
    </button>
  )
}
