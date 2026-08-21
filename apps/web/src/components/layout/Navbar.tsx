'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { useTheme } from '@/components/ThemeProvider'
import {
  Search, ChevronDown, User, BookOpen, BarChart2,
  Settings, LogOut, LayoutDashboard, Sun, Moon, CalendarDays, Menu, X,
  Heart, BookMarked, Banknote, Library, Bell,
} from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { SearchDropdown } from '@/components/search/SearchDropdown'

const NAV_LINKS = [
  { href: '/companies', label: 'Book Boxes' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/books-by-month', label: 'Boxes by Month' },
  { href: '/sale-announcements', label: 'Sale Announcements' },
  { href: '/sales-calendar', label: 'Sales Calendar' },
  { href: '/blog', label: 'Blog' },
]

const USER_NAV_LINKS = [
  { href: '/calendar',         label: 'Calendar',      icon: CalendarDays },
  { href: '/collection',       label: 'My Collection', icon: BookOpen },
  { href: '/sold',             label: 'Sold Books',    icon: Banknote },
  { href: '/my-subscriptions', label: 'Subscriptions', icon: BookMarked },
  { href: '/wishlist',         label: 'Wishlist',      icon: Heart },
  { href: '/statistics',       label: 'Statistics',    icon: BarChart2 },
  { href: '/profile',          label: 'Profile',       icon: User },
]

export function Navbar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const { theme, toggleTheme } = useTheme()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await logout() // calls API, clears cookie, clears user state, redirects to /
    queryClient.clear()
    setDropdownOpen(false)
  }

  // Boundary-aware: startsWith alone would match "/companies-permissions" against "/companies",
  // wrongly highlighting the Book Boxes tab there. Only an exact match or a real sub-path counts.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  const isBlog = pathname.startsWith('/blog')

  if (isBlog) return null

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Top bar — logo + controls */}
      <div
        className="border-b border-navy-700 px-4 sm:px-6 py-3 flex items-center gap-3 w-full"
        style={{ background: 'var(--grad-header)', position: 'relative' }}
      >
        {/* Radial glow — clipped separately so it doesn't affect dropdowns */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, var(--accent-glow) 0%, transparent 70%)' }}
        />

        <Link
          href="/"
          className="nav-logo relative z-10 flex items-center gap-2 shrink-0"
          aria-label="LuxGrimoire"
        >
          <Image
            src={theme === 'dark' ? '/logo-light.png' : '/logo-dark.png'}
            alt="LuxGrimoire"
            width={38}
            height={38}
            className="h-9 w-auto"
            priority
          />
          <span className="hidden sm:inline font-serif font-bold tracking-widest text-brand-400 text-lg sm:text-xl">
            LuxGrimoire
          </span>
        </Link>

        {/* Search bar — next to logo */}
        <div className="relative z-10 flex-1 max-w-xs mx-3 hidden sm:flex items-center">
          <SearchDropdown />
        </div>
        {/* Mobile search icon */}
        <Link href="/search" className="relative z-10 sm:hidden p-1.5 text-navy-400 hover:text-brand-400 transition-colors">
          <Search size={17} />
        </Link>

        <div className="relative z-10 ml-auto flex items-center gap-1 sm:gap-2">
          {/* Mobile hamburger — shown only on small screens */}
          <button
            className="md:hidden p-1.5 text-navy-400 hover:text-brand-400 transition-colors"
            onClick={() => setMobileNavOpen(v => !v)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-navy-400 hover:text-brand-400 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Separator */}
          <div className="w-px h-5 bg-navy-700 mx-1 hidden sm:block" />

          {/* Notification bell */}
          {user && <NotificationBell />}

          {user ? (
            /* User dropdown */
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-700 hover:border-brand-600 text-navy-300 hover:text-brand-400 transition-colors text-sm"
              >
                <User size={14} />
                <span className="hidden sm:inline max-w-[100px] truncate">{user.username}</span>
                <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-navy-700 bg-navy-800 shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-navy-700">
                    <p className="text-sm font-semibold text-navy-100">{user.username}</p>
                    <p className="text-xs text-navy-500 truncate">{user.email}</p>
                  </div>

                  <div className="py-1">
                    {/* My Library */}
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-navy-600">My Library</p>
                    {[
                      { href: '/calendar',         icon: CalendarDays, label: 'Calendar' },
                      { href: '/collection',        icon: BookOpen,     label: 'Collection' },
                      { href: '/sold',              icon: Banknote,     label: 'Sold Books' },
                      { href: '/my-subscriptions',  icon: BookMarked,   label: 'Subscriptions' },
                      { href: '/wishlist',          icon: Heart,        label: 'Wishlist' },
                    ].map(({ href, icon: Icon, label }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-navy-300 hover:bg-navy-700 hover:text-brand-400 transition-colors"
                      >
                        <Icon size={14} /> {label}
                      </Link>
                    ))}

                    <div className="h-px bg-navy-700 my-1" />
                    {/* Finance & Account */}
                    {[
                      { href: '/statistics', icon: BarChart2, label: 'Statistics' },
                      { href: '/profile',  icon: Settings,   label: 'Settings' },
                    ].map(({ href, icon: Icon, label }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-navy-300 hover:bg-navy-700 hover:text-brand-400 transition-colors"
                      >
                        <Icon size={14} /> {label}
                      </Link>
                    ))}

                    {(user.role === 'ADMIN' || user.role === 'MODERATOR' || user.role === 'COMPANY_MANAGER') && (
                      <>
                        <div className="h-px bg-navy-700 my-1" />
                        <Link
                          href="/admin"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-navy-400 hover:bg-navy-700 hover:text-brand-400 transition-colors"
                        >
                          <LayoutDashboard size={14} /> Admin Panel
                        </Link>
                      </>
                    )}

                    <div className="h-px bg-navy-700 my-1" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-navy-500 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href={`/login${pathname && !pathname.startsWith('/login') && !pathname.startsWith('/register') ? `?returnTo=${encodeURIComponent(pathname)}` : ''}`}
              className="px-4 py-1.5 rounded-full border border-brand-700 text-brand-400 hover:bg-brand-700 hover:text-navy-950 transition-colors text-xs font-semibold font-serif tracking-wide"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Second bar — desktop only */}
      <nav className="hidden md:block border-b border-navy-700 bg-navy-800">
        <div className="flex items-center px-4 sm:px-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-1.5 px-3 lg:px-4 py-3 text-xs font-serif uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap shrink-0
                ${isActive(href)
                  ? 'border-brand-400 text-brand-400'
                  : 'border-transparent text-navy-400 hover:text-navy-200 hover:border-navy-600'}
              `}
            >
              {label}
            </Link>
          ))}

          {/* User area links — visible when logged in */}
          {user && (
            <>
              <div className="w-px h-4 bg-navy-700 mx-2 shrink-0" />
              <Link
                href="/calendar"
                className={`
                  flex items-center gap-1.5 px-3 lg:px-4 py-3 text-xs font-serif uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap shrink-0
                  ${['/collection', '/calendar', '/wishlist', '/my-subscriptions', '/statistics', '/sold'].some(p => pathname === p || pathname.startsWith(p + '/'))
                    ? 'border-brand-400 text-brand-400'
                    : 'border-transparent text-navy-400 hover:text-navy-200 hover:border-navy-600'}
                `}
              >
                <Library size={12} />
                My Library
              </Link>
            </>
          )}

          {/* Admin Panel — far right, admins/mods only */}
          {user && (user.role === 'ADMIN' || user.role === 'MODERATOR' || user.role === 'COMPANY_MANAGER') && (
            <div className="ml-auto flex items-center shrink-0">
              <div className="w-px h-4 bg-navy-700 mx-1 shrink-0" />
              <Link
                href="/admin"
                className={`
                  flex items-center gap-1.5 px-3 lg:px-4 py-3 text-xs font-serif uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap
                  ${isActive('/admin')
                    ? 'border-brand-400 text-brand-400'
                    : 'border-transparent text-brand-600 hover:text-brand-400 hover:border-brand-700'}
                `}
              >
                <LayoutDashboard size={13} />
                Admin
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile nav dropdown — shown when hamburger is open */}
      {mobileNavOpen && (
        <div className="md:hidden bg-navy-900 border-b border-navy-800 shadow-xl">
          <div className="px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileNavOpen(false)}
                className={`
                  flex items-center px-3 py-2.5 rounded-xl text-sm font-serif uppercase tracking-widest transition-colors
                  ${isActive(href)
                    ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                    : 'text-navy-400 hover:text-navy-100 hover:bg-navy-800'}
                `}
              >
                {label}
              </Link>
            ))}
            {user && (
              <>
                <div className="h-px bg-navy-800 my-1" />
                {USER_NAV_LINKS.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-serif uppercase tracking-widest transition-colors
                      ${isActive(href)
                        ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                        : 'text-navy-400 hover:text-navy-100 hover:bg-navy-800'}
                    `}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                ))}
              </>
            )}
            {user && (user.role === 'ADMIN' || user.role === 'MODERATOR' || user.role === 'COMPANY_MANAGER') && (
              <>
                <div className="h-px bg-navy-800 my-1" />
                <Link
                  href="/admin"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-serif uppercase tracking-widest text-brand-600 hover:text-brand-400 hover:bg-navy-800 transition-colors"
                >
                  <LayoutDashboard size={15} />
                  Admin
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
