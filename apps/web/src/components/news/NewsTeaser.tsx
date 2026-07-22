import Link from 'next/link'
import { Newspaper, ArrowRight } from 'lucide-react'
import type { ApiNewsItem } from '@/lib/api'

/**
 * Homepage teaser (spec section 9) — zero-click visibility of the latest news
 * on desktop. Rendering this does NOT clear the unread badge (spec 8) — only
 * opening the full /news page does; a teaser someone scrolled past isn't
 * "read".
 */
export function NewsTeaser({ items }: { items: ApiNewsItem[] }) {
  if (items.length === 0) return null

  return (
    <section className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Newspaper size={16} className="text-amber-400" />
          <h2 className="text-sm font-serif font-semibold uppercase tracking-widest text-stone-300">Latest News</h2>
        </div>
        <Link href="/news" className="text-xs text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1">
          View all <ArrowRight size={12} />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.slice(0, 3).map((item) => (
          <Link
            key={item.id}
            href="/news"
            className="block rounded-xl border border-stone-700 bg-stone-800/60 p-3 hover:border-amber-600/50 transition-colors"
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">{item.companyName}</span>
            <p className="text-sm text-stone-200 font-medium mt-1 line-clamp-2">{item.title}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
