'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import type { PaginatedResponse } from '@luxgrimoire/shared-types'
import { SaleCountdownCounter } from './SaleCountdownCounter'
import { CompanySaleAnnouncementsBrowser } from './CompanySaleAnnouncementsBrowser'

interface NextSale {
  date: string | null
  tier: 'FA' | 'EA' | 'GS' | null
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
}

export function CompanySaleAnnouncementsSection({ companyId }: Props) {
  const [browserOpen, setBrowserOpen] = useState(false)

  const { data: nextSale } = useQuery({
    queryKey: ['company-next-sale', companyId],
    queryFn: () => authFetch<NextSale>(`/announcements/next-sale?companyId=${companyId}`),
    staleTime: 60_000,
  })

  const { data: latest } = useQuery({
    queryKey: ['company-latest-announcements', companyId],
    queryFn: () => apiFetch<PaginatedResponse<LatestItem>>(`/announcements?companyId=${companyId}&pageSize=3&sort=recent`),
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
            <button
              onClick={() => setBrowserOpen(true)}
              className="text-xs text-amber-500 hover:text-amber-400 transition-colors"
            >
              See all →
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {latestItems.map((a) => {
              const cover = a.imageUrl ? cloudinaryUrl(a.imageUrl, 'w_80,h_120,c_fill,q_auto,f_auto') : null
              return (
                <button
                  key={a.id}
                  onClick={() => setBrowserOpen(true)}
                  className="flex items-center gap-2.5 text-left hover:bg-stone-800/60 transition-colors rounded-lg p-1.5 -m-1.5"
                >
                  <div className="w-8 h-12 shrink-0 rounded bg-stone-950 overflow-hidden">
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p className="text-xs text-stone-300 line-clamp-2 leading-snug">{a.title}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {latestItems.length === 0 && nextSale?.date && (
        <button
          onClick={() => setBrowserOpen(true)}
          className="text-xs text-amber-500 hover:text-amber-400 transition-colors self-start"
        >
          See all sale announcements →
        </button>
      )}

      {browserOpen && (
        <CompanySaleAnnouncementsBrowser companyId={companyId} onClose={() => setBrowserOpen(false)} />
      )}
    </section>
  )
}
