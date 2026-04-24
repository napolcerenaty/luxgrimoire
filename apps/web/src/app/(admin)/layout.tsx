'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Brush,
  Layers,
  Building2,
  Package,
  ShieldCheck,
  Sparkles,
  Bell,
  Megaphone,
  LibraryBig,
  Bug,
} from 'lucide-react'
import { clsx } from 'clsx'

const COMPANY_MANAGER_LINKS = [
  { href: '/admin/companies', label: 'Book Boxes', icon: Building2 },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: Package },
  { href: '/admin/book-box-collections', label: 'Collections', icon: LibraryBig },
  { href: '/admin/books', label: 'Books', icon: BookOpen },
  { href: '/admin/editions', label: 'Editions', icon: Layers },
]

const MODERATOR_LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/companies', label: 'Book Boxes', icon: Building2 },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: Package },
  { href: '/admin/book-box-collections', label: 'Collections', icon: LibraryBig },
  { href: '/admin/books', label: 'Books', icon: BookOpen },
  { href: '/admin/editions', label: 'Editions', icon: Layers },
  { href: '/admin/authors', label: 'Authors', icon: Users },
  { href: '/admin/artists', label: 'Artists', icon: Brush },
  { href: '/admin/sale-announcements', label: 'Sale Announcements', icon: Megaphone },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/bug-reports', label: 'Bug Reports', icon: Bug },
]

const ADMIN_LINKS = [
  ...MODERATOR_LINKS,
  { href: '/admin/users', label: 'Users', icon: ShieldCheck },
  { href: '/admin/sponsored-slots', label: 'Sponsored Slots', icon: Sparkles },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isAuthorized =
    user?.role === 'ADMIN' || user?.role === 'MODERATOR' || user?.role === 'COMPANY_MANAGER'

  useEffect(() => {
    if (!loading && !isAuthorized) {
      router.push('/')
    }
  }, [loading, isAuthorized, router])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthorized) return null

  const navLinks =
    user.role === 'ADMIN' ? ADMIN_LINKS :
    user.role === 'MODERATOR' ? MODERATOR_LINKS :
    COMPANY_MANAGER_LINKS

  return (
    <div className="flex min-h-screen bg-stone-950">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-stone-950 border-r border-stone-800">
        <div className="px-6 py-5 border-b border-stone-800">
          <Link href="/admin" className="text-amber-400 font-bold text-lg tracking-wide">
            LuxGrimoire
          </Link>
          <p className="text-stone-500 text-xs mt-0.5">Admin Panel</p>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800',
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="px-4 py-4 border-t border-stone-800">
          <p className="text-stone-500 text-xs truncate">{user.email}</p>
          <p className="text-amber-400/70 text-xs mt-0.5">{user.role}</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 md:p-8">{children}</div>
      </main>
    </div>
  )
}
