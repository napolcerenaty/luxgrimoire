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
}

/** Inline "interested" toggle for a calendar sale pill — the pill already represents one
 *  concrete tier, so this registers/removes interest directly against it (same shortcut
 *  SaleInterestButton takes for a `directTier`), no region/tier picker needed. */
export function SalePillBell({ announcementId, tierId, tierName, tierRegionId, size = 9 }: Props) {
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
    if (activeForThisTier) removeInterest()
    else setInterest(tierId, tierName, tierRegionId)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={activeForThisTier ? 'Interested — click to remove' : 'Mark as interested'}
      className="shrink-0 hover:scale-110 transition-transform"
    >
      <Bell size={size} className={activeForThisTier ? 'fill-current' : ''} />
    </button>
  )
}
