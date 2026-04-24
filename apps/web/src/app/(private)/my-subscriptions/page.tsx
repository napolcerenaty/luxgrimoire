'use client'

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react'

interface MySubscriptionEntry {
  id: string
  active: boolean
  startDate: string | null
  renewalDay: number | null
  costCurrency: string | null
  basePrice: string | null
  shippingCost: string | null
  taxesAndFees: string | null
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

function formatMoney(amount: string | null, currency: string | null) {
  if (!amount || !currency) return null
  const n = parseFloat(amount)
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
  const thumb = sub.coverImage
    ? cloudinaryUrl(sub.coverImage, 'w_80,h_80,c_fill,q_auto,f_auto')
    : null

  const cur = entry.costCurrency ?? sub.currency
  const base = formatMoney(entry.basePrice ?? sub.price, cur)
  const shipping = formatMoney(entry.shippingCost, cur)
  const taxes = formatMoney(entry.taxesAndFees, cur)
  const since = formatDate(entry.startDate)

  return (
    <div className="flex gap-4 bg-stone-900 border border-stone-800 rounded-xl p-4 hover:border-stone-700 transition-colors">
      {/* Thumbnail */}
      <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-stone-800">
        {thumb ? (
          <img src={thumb} alt={sub.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-600 text-2xl font-serif">
            {sub.name[0]}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-stone-500">{sub.company.name}</p>
            <h3 className="font-semibold text-stone-100 leading-tight">{sub.name}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {entry.active ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 size={14} /> Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-stone-500">
                <XCircle size={14} /> Cancelled
              </span>
            )}
            {sub.isDiscontinued && (
              <span className="text-xs text-amber-600/80 border border-amber-700/40 rounded px-1.5 py-0.5">
                Discontinued
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400">
          {since && <span>Since {since}</span>}
          {entry.renewalDay && <span>Renews on day {entry.renewalDay}</span>}
          {base && <span>Base {base}</span>}
          {shipping && <span>+ {shipping} shipping</span>}
          {taxes && <span>+ {taxes} taxes/fees</span>}
        </div>
      </div>

      {/* Link */}
      <Link
        href={`/subscriptions/${sub.slug}`}
        className="shrink-0 self-start text-stone-500 hover:text-amber-400 transition-colors mt-0.5"
        title="View subscription"
      >
        <ExternalLink size={16} />
      </Link>
    </div>
  )
}
