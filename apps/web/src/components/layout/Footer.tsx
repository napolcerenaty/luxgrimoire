import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

const YEAR = new Date().getFullYear()

const LINKS = {
  discover: [
    { href: '/subscriptions',      label: 'Subscription Boxes' },
    { href: '/books',              label: 'Browse Books' },
    { href: '/companies',          label: 'Book Box Companies' },
    { href: '/sale-announcements', label: 'Sale Announcements' },
    { href: '/search',             label: 'Search' },
  ],
  community: [
    { href: '/feature-requests',            label: 'Feature Requests' },
    { href: '/data-requests',               label: 'Request / Add Data' },
    { href: '/sale-announcement-requests',  label: 'Report a Sale' },
  ],
  account: [
    { href: '/collection', label: 'My Collection' },
    { href: '/calendar',   label: 'My Calendar' },
    { href: '/spending',   label: 'Spending Tracker' },
    { href: '/login',      label: 'Sign In' },
    { href: '/register',   label: 'Create Account' },
  ],
  company: [
    { href: '/about',   label: 'About' },
    { href: '/contact', label: 'Contact' },
    { href: '/faq',     label: 'FAQ' },
  ],
  legal: [
    { href: '/report',       label: 'Report Abuse / DMCA' },
    { href: '/privacy',      label: 'Privacy Policy' },
    { href: '/terms',        label: 'Terms of Use' },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-stone-800 bg-stone-950 text-stone-400 mt-16">
      <div className="container mx-auto px-4 sm:px-6 py-12">
        {/* Main grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="font-serif text-lg font-bold text-amber-400 mb-2">LuxGrimoire</p>
            <p className="text-xs text-stone-500 leading-relaxed">
              Track luxury book editions and subscription boxes. Community-driven database.
            </p>
          </div>

          {/* Discover */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Discover</p>
            <ul className="space-y-2">
              {LINKS.discover.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-stone-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Community</p>
            <ul className="space-y-2">
              {LINKS.community.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-stone-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 mt-5 mb-3">Account</p>
            <ul className="space-y-2">
              {LINKS.account.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-stone-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Company</p>
            <ul className="space-y-2">
              {LINKS.company.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-stone-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Report / Legal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Legal &amp; Safety</p>
            <ul className="space-y-2 mb-5">
              {LINKS.legal.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-stone-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>

            {/* Report abuse box */}
            <Link
              href="/report"
              className="flex items-start gap-2.5 p-3 rounded-lg border border-rose-900/60 bg-rose-950/20 hover:border-rose-700/60 transition-colors group"
            >
              <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-rose-400 group-hover:text-rose-300 transition-colors">Report an issue</p>
                <p className="text-[11px] text-stone-500 leading-relaxed mt-0.5">
                  Copyright violation, incorrect data, or other concerns.
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-stone-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-stone-600">© {YEAR} LuxGrimoire. All rights reserved.</p>
          <p className="text-xs text-stone-700">
            Cover images and trademarks belong to their respective owners.
            LuxGrimoire is a fan-made, community database.
          </p>
        </div>
      </div>
    </footer>
  )
}

