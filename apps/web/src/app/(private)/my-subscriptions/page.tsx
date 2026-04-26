'use client'

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { CheckCircle2, XCircle } from 'lucide-react'

interface MySubscriptionEntry {
  id: string
  active: boolean
  startDate: string | null
  renewalDay: number | null
  costCurrency: string | null
  basePrice: string | null
  shippingCost: string | null
  taxesAndFees: string | null
  nextRenewalDate: string | null
  nextRenewalAmount: string | null
  nextRenewalCurrency: string | null
  subscription: {
    slug: string
    name: string
    coverImage: string | null
    logoUrl: string | null
    currency: string
    price: string | null
    isDiscontinued: boolean
    company: { name: string; slug: string }
  }
}

function formatMoney(amount: string | number | null, currency: string | null) {
  if (amount === null || amount === undefined || !currency) return null
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return null
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n)
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function MySubscriptionsPage() {
  const { data: entries = [], isLoading } = useQuery<MySubscriptionEntry[]>({
    queryKey: ['my-subscriptions'],
    queryFn: () => authFetch('/subscriptions/my/subscriptions'),
  })

  const active = entries.filter(e => e.active)
  const inactive = entries.filter(e => !e.active)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="text-stone-500 animate-pulse">Loading subscriptions…</span>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-serif text-stone-100">My Subscriptions</h1>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <p className="mb-3">You haven't joined any subscriptions yet.</p>
          <Link href="/subscriptions" className="text-amber-400 underline text-sm">
            Browse subscriptions →
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">
                Active ({active.length})
              </h2>
              <div className="space-y-3">
                {active.map(e => <SubscriptionCard key={e.id} entry={e} />)}
              </div>
            </section>
          )}
          {inactive.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">
                Cancelled / Inactive ({inactive.length})
              </h2>
              <div className="space-y-3 opacity-70">
                {inactive.map(e => <SubscriptionCard key={e.id} entry={e} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function SubscriptionCard({ entry }: { entry: MySubscriptionEntry }) {
  const sub = entry.subscription
  const logoUrl = sub.logoUrl
    ? cloudinaryUrl(sub.logoUrl, 'w_160,h_160,c_pad,q_auto,f_auto')
    : null
  const bgUrl = sub.logoUrl
    ? cloudinaryUrl(sub.logoUrl, 'w_400,h_120,c_fill,q_auto,f_auto')
    : null

  const renewalLabel = formatDate(entry.nextRenewalDate)
  const renewalAmount = formatMoney(entry.nextRenewalAmount, entry.nextRenewalCurrency)

  return (
    <Link
      href={`/subscriptions/${sub.slug}`}
      className="block bg-stone-900 border border-stone-800 rounded-xl overflow-hidden hover:border-amber-500/50 transition-colors group"
    >
      {/* Logo with blur background */}
      <div className="relative h-24 overflow-hidden bg-stone-800">
        {bgUrl && (
          <img
            src={bgUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg opacity-40"
            aria-hidden
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={sub.name}
              className="h-16 max-w-[180px] object-contain drop-shadow-lg"
            />
          ) : (
            <span className="text-3xl font-serif text-stone-400">{sub.name[0]}</span>
          )}
        </div>
        {/* Status badge */}
        <div className="absolute top-2 right-2">
          {entry.active ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-stone-900/80 rounded-full px-2 py-0.5">
              <CheckCircle2 size={12} /> Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-stone-400 bg-stone-900/80 rounded-full px-2 py-0.5">
              <XCircle size={12} /> Cancelled
            </span>
          )}
        </div>
        {sub.isDiscontinued && (
          <div className="absolute top-2 left-2">
            <span className="text-xs text-amber-600 bg-stone-900/80 border border-amber-700/40 rounded px-1.5 py-0.5">
              Discontinued
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <p className="text-xs text-stone-500">{sub.company.name}</p>
        <h3 className="font-semibold text-stone-100 leading-tight group-hover:text-amber-400 transition-colors">
          {sub.name}
        </h3>

        <div className="mt-3 flex flex-wrap gap-4">
          {entry.active && renewalLabel && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Next renewal</p>
              <p className="text-sm font-medium text-stone-200">{renewalLabel}</p>
            </div>
          )}
          {entry.active && renewalAmount && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Renewal amount</p>
              <p className="text-sm font-medium text-amber-400">{renewalAmount}</p>
            </div>
          )}
          {!entry.active && entry.startDate && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Subscribed since</p>
              <p className="text-sm font-medium text-stone-300">{formatDate(entry.startDate)}</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
