import Link from 'next/link'
import Image from 'next/image'
import { AlertTriangle } from 'lucide-react'

const YEAR = new Date().getFullYear()

const LINKS = {
  discover: [
    { href: '/subscriptions',      label: 'Subscription Boxes' },
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
    { href: '/statistics', label: 'Statistics' },
    { href: '/login',      label: 'Sign In' },
    { href: '/register',   label: 'Create Account' },
  ],
  company: [
    { href: '/about',   label: 'About' },
    { href: '/support', label: 'Support Us' },
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
          <div className="col-span-2 md:col-span-1 flex flex-col items-start">
            <Link href="/" aria-label="LuxGrimoire" className="inline-block mb-3">
              {/* Logo with text — light version for dark theme */}
              <Image
                src="/logo-light-text.png"
                alt="LuxGrimoire"
                width={160}
                height={160}
                className="w-36 h-auto logo-for-dark"
              />
              {/* Logo with text — dark version for light theme */}
              <Image
                src="/logo-dark-text.png"
                alt="LuxGrimoire"
                width={160}
                height={160}
                className="w-36 h-auto logo-for-light"
              />
            </Link>
            <p className="text-[10px] font-serif uppercase tracking-[0.25em] font-semibold text-[#4a88a8] text-center">
              Limited books.
            </p>
            <p className="text-[10px] font-serif uppercase tracking-[0.25em] font-semibold text-[#4a88a8] text-center">
              Unlimited obsession.
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
            <ul className="space-y-2">
              <li>
                <Link href="/report" className="flex items-start gap-2 hover:text-stone-200 transition-colors group">
                  <AlertTriangle size={13} className="text-stone-500 group-hover:text-rose-400 transition-colors mt-0.5 shrink-0" />
                  <span>
                    <span className="text-sm block">Report Abuse / DMCA</span>
                    <span className="text-[11px] text-stone-600 leading-relaxed">Copyright, incorrect data, or other concerns</span>
                  </span>
                </Link>
              </li>
              {LINKS.legal.filter(l => l.href !== '/report').map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-stone-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-stone-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-stone-500">© {YEAR} LuxGrimoire. All rights reserved.</p>
          <p className="text-xs text-stone-400 text-center sm:text-right max-w-xl leading-relaxed">
            LuxGrimoire is an independent, fan-made database of book subscription boxes and special editions.
            We are not affiliated with or endorsed by any listed companies.
            Some brands featured on LuxGrimoire are displayed with permission from their respective owners.
            All trademarks, cover images, logos, and brand materials belong to their respective owners.
          </p>
        </div>
      </div>
    </footer>
  )
}

