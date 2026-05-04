'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { BookOpen, Heart, DollarSign, User, BookMarked, ShoppingBag, CalendarDays } from 'lucide-react'
import { clsx } from 'clsx'

const NAV_LINKS = [
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/collection', label: 'My Collection', icon: BookOpen },
  { href: '/sold', label: 'Sold Books', icon: ShoppingBag },
  { href: '/my-subscriptions', label: 'Subscriptions', icon: BookMarked },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/spending', label: 'Spending', icon: DollarSign },
  { href: '/profile', label: 'Profile', icon: User },
]

export function PrivateShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="text-stone-400 font-serif text-lg animate-pulse">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-stone-800 pt-4 px-6 pb-6 gap-2 shrink-0">
        <nav className="flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800',
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 md:p-8 pb-24 md:pb-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-stone-950 border-t border-stone-800 flex items-center justify-around px-2 py-2 z-40">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs transition-colors',
              pathname === href ? 'text-amber-400' : 'text-stone-500 hover:text-stone-300',
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
