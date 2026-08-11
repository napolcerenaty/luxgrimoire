'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { PaginatedResponse } from '@luxgrimoire/shared-types'
import { useAuth } from '@/components/AuthProvider'
import { SaleCountdownCounter } from './SaleCountdownCounter'

interface NextSale {
  date: string | null
  /** The tier's own free-text name (e.g. "First Access", "VIP Access") — no longer a fixed code. */
  tier: string | null
  announcementId: string | null
  title: string | null
  personalized: boolean
}

interface LatestItem {
  id: string
  title: string
  imageUrl: string | null
  generalSaleDate: string | null
}

interface Props {
  companyId: string
  companySlug: string
}

export function CompanySaleAnnouncementsSection({ companyId, companySlug }: Props) {
  const seeAllHref = `/companies/${companySlug}/sale-announcements`
  const { user } = useAuth()

  const { data: nextSale } = useQuery({
    // user?.id in the key (not just companyId) — otherwise login/logout keeps serving the
    // other identity's cached personalized/aggregate response back for up to staleTime.
    queryKey: ['company-next-sale', companyId, user?.id ?? null],
    queryFn: () => authFetch<NextSale>(`/announcements/next-sale?companyId=${companyId}`),
    staleTime: 60_000,
  })

  const { data: latest } = useQuery({
    queryKey: ['company-latest-announcements', companyId],
    // Future (live/upcoming) only — past announcements belong on the "See all" page's Past tab,
    // not in this preview, which is meant to give people a reason to come back.
    queryFn: () => apiFetch<PaginatedResponse<LatestItem>>(`/announcements?companyId=${companyId}&pageSize=3&sort=recent&upcoming=true`),
    staleTime: 60_000,
  })

  const latestItems = latest?.data ?? []
  if (!nextSale?.date && latestItems.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      {nextSale?.date && nextSale.tier && (
        <SaleCountdownCounter
          date={nextSale.date}
          tier={nextSale.tier}
          title={nextSale.title}
          personalized={nextSale.personalized}
        />
      )}

      {latestItems.length > 0 && (
        <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-serif font-semibold text-stone-200">Latest Announcements</h3>
            <Link href={seeAllHref} className="text-xs text-brand-500 hover:text-brand-400 transition-colors">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {latestItems.map((a) => {
              const cover = a.imageUrl ? cloudinaryUrl(a.imageUrl, 'w_80,h_120,c_fill,q_auto,f_auto') : null
              return (
                <Link
                  key={a.id}
                  href={seeAllHref}
                  title={a.title}
                  className="flex items-center gap-2.5 text-left hover:bg-stone-800/60 transition-colors rounded-lg p-1.5 -m-1.5"
                >
                  <div className="w-8 h-12 shrink-0 rounded bg-stone-950 overflow-hidden">
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p className="text-xs text-stone-300 line-clamp-2 leading-snug">{a.title}</p>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {latestItems.length === 0 && nextSale?.date && (
        <Link href={seeAllHref} className="text-xs text-brand-500 hover:text-brand-400 transition-colors self-start">
          View all sale announcements →
        </Link>
      )}
    </section>
  )
}
