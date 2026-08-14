'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { BookOpen, Heart, BarChart2, User, RefreshCw, CalendarDays, Banknote } from 'lucide-react'
import { clsx } from 'clsx'
import { PushEnableBanner } from '@/components/notifications/PushEnableBanner'

const NAV_LINKS = [
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/collection', label: 'My Collection', icon: BookOpen },
  { href: '/sold', label: 'Sold Books', icon: Banknote },
  { href: '/my-subscriptions', label: 'Subscriptions', icon: RefreshCw },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/statistics', label: 'Statistics', icon: BarChart2 },
  { href: '/profile', label: 'Profile', icon: User },
]

export function PrivateShell({ children }: { children: React.ReactNode }) {
  const { user, loading, isLoggingOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user && !isLoggingOut.current) {
      router.push(`/login?returnTo=${encodeURIComponent(pathname)}`)
    }
  }, [user, loading, router, pathname])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="text-navy-400 font-serif text-lg animate-pulse">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-navy-800 pt-4 px-6 pb-6 gap-2 shrink-0">
        <nav className="flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                  : 'text-navy-400 hover:text-navy-100 hover:bg-navy-800',
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <PushEnableBanner />
        <main className="flex-1 p-6 md:p-8 pb-24 md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-navy-950 border-t border-navy-800 flex items-center justify-around px-2 py-2 z-40">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs transition-colors',
              pathname === href ? 'text-brand-400' : 'text-navy-500 hover:text-navy-300',
            )}
          >
            <Icon size={20} />
            <span className="hidden xs:inline">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
