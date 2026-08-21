'use client'

import { useEffect, useState } from 'react'
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
  Bell,
  Megaphone,
  LibraryBig,
  Bug,
  Lightbulb,
  Database,
  ScrollText,
  BarChart3,
  Image,
  Menu,
  X,
  Tags,
  BookMarked,
  Star,
  AlertTriangle,
  Newspaper,
  BadgeCheck,
} from 'lucide-react'
import { clsx } from 'clsx'

type NavItem = { href: string; label: string; icon: React.ElementType }
type NavGroup = { heading: string; items: NavItem[] }

const COMPANY_MANAGER_GROUPS: NavGroup[] = [
  {
    heading: 'Book Boxes',
    items: [
      { href: '/admin/companies', label: 'Companies', icon: Building2 },
      { href: '/admin/subscriptions', label: 'Subscriptions', icon: Package },
      { href: '/admin/book-box-collections', label: 'Collections', icon: LibraryBig },
    ],
  },
  {
    heading: 'Catalogue',
    items: [
      { href: '/admin/books', label: 'Books', icon: BookOpen },
      { href: '/admin/editions', label: 'Editions', icon: Layers },
      { href: '/admin/series', label: 'Series', icon: BookMarked },
    ],
  },
]

const MODERATOR_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    heading: 'Book Boxes',
    items: [
      { href: '/admin/companies', label: 'Companies', icon: Building2 },
      { href: '/admin/subscriptions', label: 'Subscriptions', icon: Package },
      { href: '/admin/book-box-collections', label: 'Collections', icon: LibraryBig },
      { href: '/admin/subscription-month-gaps', label: 'Month Gaps', icon: AlertTriangle },
    ],
  },
  {
    heading: 'Catalogue',
    items: [
      { href: '/admin/books', label: 'Books', icon: BookOpen },
      { href: '/admin/editions', label: 'Editions', icon: Layers },
      { href: '/admin/series', label: 'Series', icon: BookMarked },
      { href: '/admin/authors', label: 'Authors', icon: Users },
      { href: '/admin/artists', label: 'Artists', icon: Brush },
      { href: '/admin/sale-announcements', label: 'Sale Announcements', icon: Megaphone },
      { href: '/admin/homepage-features', label: 'Homepage Features', icon: Star },
      { href: '/admin/feature-categories', label: 'Feature Categories', icon: Tags },
    ],
  },
  {
    heading: 'Community',
    items: [
      { href: '/admin/community-images', label: 'Community Images', icon: Image },
      { href: '/admin/data-requests', label: 'Data Requests', icon: Database },
      { href: '/admin/sale-announcement-requests', label: 'Sale Requests', icon: Megaphone },
    ],
  },
]

const ADMIN_GROUPS: NavGroup[] = [
  ...MODERATOR_GROUPS,
  {
    heading: 'Community (Admin)',
    items: [
      { href: '/admin/notifications', label: 'Notifications', icon: Bell },
      { href: '/admin/bug-reports', label: 'Bug Reports', icon: Bug },
      { href: '/admin/feature-requests', label: 'Feature Requests', icon: Lightbulb },
      { href: '/admin/blog-posts', label: 'Blog Posts', icon: Newspaper },
    ],
  },
  {
    heading: 'System',
    items: [
      { href: '/admin/users', label: 'Users', icon: ShieldCheck },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/audit-logs', label: 'Audit Log', icon: ScrollText },
      { href: '/admin/company-image-purge', label: 'Image Purge', icon: Image },
      { href: '/admin/image-permissions', label: 'Image Permissions', icon: BadgeCheck },
    ],
  },
]

function NavContent({
  navGroups,
  pathname,
  userEmail,
  userRole,
  onNavigate,
}: {
  navGroups: NavGroup[]
  pathname: string
  userEmail: string
  userRole: string
  onNavigate?: () => void
}) {
  return (
    <>
      <nav className="flex-1 px-3 py-4 flex flex-col gap-4 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.heading}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-navy-600">
              {group.heading}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive =
                  href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                        : 'text-navy-400 hover:text-navy-100 hover:bg-navy-800',
                    )}
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-navy-800">
        <p className="text-navy-500 text-xs truncate">{userEmail}</p>
        <p className="text-brand-400/70 text-xs mt-0.5">{userRole}</p>
      </div>
    </>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isAuthorized =
    user?.role === 'ADMIN' || user?.role === 'MODERATOR' || user?.role === 'COMPANY_MANAGER'

  useEffect(() => {
    if (!loading && !isAuthorized) {
      if (!user) {
        router.push(`/login?returnTo=${encodeURIComponent(pathname)}`)
      } else {
        router.push('/')
      }
    }
  }, [loading, isAuthorized, user, router, pathname])

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthorized) return null

  const navGroups =
    user.role === 'ADMIN' ? ADMIN_GROUPS :
    user.role === 'MODERATOR' ? MODERATOR_GROUPS :
    COMPANY_MANAGER_GROUPS

  return (
    <div className="flex min-h-screen bg-navy-950">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-navy-950 border-r border-navy-800">
        <div className="px-6 py-5 border-b border-navy-800">
          <p className="text-brand-400 font-bold text-sm uppercase tracking-widest">Admin Panel</p>
        </div>
        <NavContent
          navGroups={navGroups}
          pathname={pathname}
          userEmail={user.email}
          userRole={user.role}
        />
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/80 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex flex-col w-72 bg-navy-950 border-r border-navy-800 transition-transform duration-300 md:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-navy-800">
          <p className="text-brand-400 font-bold text-sm uppercase tracking-widest">Admin Panel</p>
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-navy-400 hover:text-navy-100 transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <NavContent
          navGroups={navGroups}
          pathname={pathname}
          userEmail={user.email}
          userRole={user.role}
          onNavigate={() => setDrawerOpen(false)}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-navy-950 border-b border-navy-800 sticky top-0 z-30">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-navy-400 hover:text-navy-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <p className="text-brand-400 font-bold text-sm uppercase tracking-widest">Admin Panel</p>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
