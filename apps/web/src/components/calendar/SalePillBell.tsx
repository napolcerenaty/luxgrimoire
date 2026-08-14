'use client'

import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { useSaleInterest } from '@/hooks/useSaleInterest'

interface Props {
  announcementId: string
  tierId: string
  tierName: string
  tierRegionId: string | null
  size?: number
  /** Extra classes for the button's hit area — defaults to a tight fit for cramped grid pills.
   *  Pass a padded + negative-margin combo (e.g. "p-2 -m-2") in roomier contexts like the day
   *  agenda, so the tappable area grows well past the visible icon without shifting layout. */
  hitAreaClassName?: string
  /** Fired synchronously right after the optimistic toggle, before the network call resolves —
   *  lets the producer (e.g. a calendar page's "mine" highlight) update instantly instead of
   *  waiting on a separate query to invalidate and refetch. */
  onToggled?: (isInterested: boolean) => void
}

/** Inline "interested" toggle for a calendar sale pill — the pill already represents one
 *  concrete tier, so this registers/removes interest directly against it (same shortcut
 *  SaleInterestButton takes for a `directTier`), no region/tier picker needed. */
export function SalePillBell({ announcementId, tierId, tierName, tierRegionId, size = 9, hitAreaClassName, onToggled }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const { isInterested, tierId: savedTierId, setInterest, removeInterest } = useSaleInterest(announcementId)
  const activeForThisTier = isInterested && savedTierId === tierId

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
      router.push(`/login?returnTo=${returnTo}`)
      return
    }
    if (activeForThisTier) {
      removeInterest()
      onToggled?.(false)
    } else {
      setInterest(tierId, tierName, tierRegionId)
      onToggled?.(true)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={activeForThisTier ? 'Interested — click to remove' : 'Mark as interested'}
      className={`shrink-0 hover:scale-110 transition-transform ${hitAreaClassName ?? ''}`}
    >
      <Bell size={size} className={activeForThisTier ? 'fill-current' : ''} />
    </button>
  )
}
