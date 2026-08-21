import Link from 'next/link'
import Image from 'next/image'
import { AlertTriangle, Instagram } from 'lucide-react'

const YEAR = new Date().getFullYear()

const LINKS = {
  discover: [
    { href: '/subscriptions',      label: 'Subscription Boxes' },
    { href: '/companies',          label: 'Book Box Companies' },
    { href: '/sale-announcements', label: 'Sale Announcements' },
    { href: '/search',             label: 'Search' },
    { href: '/blog',               label: 'Blog' },
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
    { href: '/report',                  label: 'Report Abuse / DMCA' },
    { href: '/privacy',                 label: 'Privacy Policy' },
    { href: '/terms',                   label: 'Terms of Use' },
    { href: '/companies-permissions',   label: 'Companies & Permissions' },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-navy-800 bg-navy-950 text-navy-400 mt-16">
      <div className="container mx-auto px-4 sm:px-6 py-12">
        {/* Main grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1 flex flex-col items-center">
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
            <div className="mt-4 flex items-center gap-4">
              <a
                href="https://www.instagram.com/luxgrimoire/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy-500 hover:text-navy-200 transition-colors"
                aria-label="LuxGrimoire on Instagram"
              >
                <Instagram size={24} />
              </a>
              <a
                href="https://www.tiktok.com/@luxgrimoire"
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy-500 hover:text-navy-200 transition-colors"
                aria-label="LuxGrimoire on TikTok"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
              </a>
              <a
                href="https://www.threads.com/@luxgrimoire"
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy-500 hover:text-navy-200 transition-colors"
                aria-label="LuxGrimoire on Threads"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z"/></svg>
              </a>
            </div>
          </div>

          {/* Discover */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-500 mb-3">Discover</p>
            <ul className="space-y-2">
              {LINKS.discover.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-navy-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-500 mb-3">Community</p>
            <ul className="space-y-2">
              {LINKS.community.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-navy-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-500 mt-5 mb-3">Account</p>
            <ul className="space-y-2">
              {LINKS.account.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-navy-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-500 mb-3">Company</p>
            <ul className="space-y-2">
              {LINKS.company.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-navy-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Report / Legal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-500 mb-3">Legal &amp; Safety</p>
            <ul className="space-y-2">
              <li>
                <Link href="/report" className="flex items-start gap-2 hover:text-navy-200 transition-colors group">
                  <AlertTriangle size={13} className="text-navy-500 group-hover:text-rose-400 transition-colors mt-0.5 shrink-0" />
                  <span>
                    <span className="text-sm block">Report Abuse / DMCA</span>
                    <span className="text-[11px] text-navy-600 leading-relaxed">Copyright, incorrect data, or other concerns</span>
                  </span>
                </Link>
              </li>
              {LINKS.legal.filter(l => l.href !== '/report').map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-sm hover:text-navy-200 transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-navy-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-navy-500">© {YEAR} LuxGrimoire. All rights reserved.</p>
          <p className="text-xs text-navy-400 text-center sm:text-right max-w-xl leading-relaxed">
            LuxGrimoire is an independent, fan-made database of book subscription boxes and special editions.
            We are not affiliated with or endorsed by any listed companies.
            Some brands featured on LuxGrimoire are displayed with{' '}
            <Link href="/companies-permissions" className="underline underline-offset-2 hover:text-navy-200 transition-colors">
              permission
            </Link>{' '}
            from their respective owners.
            All trademarks, cover images, logos, and brand materials belong to their respective owners.
          </p>
        </div>
      </div>
    </footer>
  )
}

