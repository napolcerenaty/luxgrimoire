'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { useTheme } from '@/components/ThemeProvider'
import { useLanguage, LANGUAGES } from '@/components/LanguageProvider'
import {
  Search, ChevronDown, User, BookOpen, Heart, DollarSign,
  Settings, LogOut, LayoutDashboard, Sun, Moon,
} from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

const NAV_LINKS = [
  { href: '/companies', label: 'Book Boxes' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/feature-requests', label: 'Feature Requests' },
  { href: '/data-requests', label: 'Request Data' },
]

const USER_NAV_LINKS = [
  { href: '/collection', label: 'Collection', icon: BookOpen },
  { href: '/favorites', label: 'Favorites', icon: Heart },
  { href: '/spending', label: 'Spending', icon: DollarSign },
]

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const { theme, toggleTheme } = useTheme()
  const { language, setLanguage } = useLanguage()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const langRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    queryClient.clear()   // wipe all cached data so next user doesn't see stale data
    setDropdownOpen(false)
    router.push('/')
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const currentLang = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0]

  return (
    <header className="sticky top-0 z-50">
      {/* Top bar — logo + controls */}
      <div
        className="border-b border-stone-700 px-4 sm:px-6 py-3 flex items-center gap-3"
        style={{ background: 'var(--grad-header)', position: 'relative' }}
      >
        {/* Radial glow — clipped separately so it doesn't affect dropdowns */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, var(--accent-glow) 0%, transparent 70%)' }}
        />

        <Link
          href="/"
          className="nav-logo relative z-10 font-serif font-bold tracking-widest text-amber-400 text-lg sm:text-xl shrink-0"
        >
          LuxGrimoire
        </Link>

        {/* Search bar — next to logo */}
        <form
          action="/search"
          method="get"
          className="relative z-10 flex-1 max-w-xs mx-3 hidden sm:flex items-center"
        >
          <div className="relative w-full">
            <input
              name="q"
              type="text"
              placeholder="Search books, editions…"
              className="w-full bg-stone-800/80 border border-stone-700 rounded-full pl-4 pr-9 py-1.5 text-xs text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-amber-600 transition-colors"
            />
            <button
              type="submit"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-amber-400 transition-colors"
            >
              <Search size={13} />
            </button>
          </div>
        </form>
        {/* Mobile search icon */}
        <Link href="/search" className="relative z-10 sm:hidden p-1.5 text-stone-400 hover:text-amber-400 transition-colors">
          <Search size={17} />
        </Link>

        <div className="relative z-10 ml-auto flex items-center gap-1 sm:gap-2">

          {/* Language dropdown */}
          <div ref={langRef} className="relative">
            <button
              onClick={() => setLangOpen(o => !o)}
              className="flex items-center gap-1 p-1.5 rounded-lg text-stone-400 hover:text-amber-400 transition-colors"
              title={currentLang.label}
            >
              <img
                src={`https://flagcdn.com/20x15/${currentLang.country}.png`}
                width={20} height={15}
                alt={currentLang.label}
                className="rounded-sm"
              />
              <ChevronDown size={10} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
            </button>

            {langOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-xl border border-stone-700 bg-stone-800 shadow-2xl overflow-hidden z-[200]">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { setLanguage(lang.code); setLangOpen(false) }}
                    className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors text-left
                      ${language === lang.code
                        ? 'text-amber-400 bg-stone-700'
                        : 'text-stone-300 hover:bg-stone-700 hover:text-amber-400'
                      }`}
                  >
                    <img
                      src={`https://flagcdn.com/20x15/${lang.country}.png`}
                      width={20} height={15}
                      alt={lang.label}
                      className="rounded-sm flex-shrink-0"
                    />
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-stone-400 hover:text-amber-400 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Separator */}
          <div className="w-px h-5 bg-stone-700 mx-1 hidden sm:block" />

          {/* Notification bell */}
          {user && <NotificationBell />}

          {user ? (
            /* User dropdown */
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-700 hover:border-amber-600 text-stone-300 hover:text-amber-400 transition-colors text-sm"
              >
                <User size={14} />
                <span className="hidden sm:inline max-w-[100px] truncate">{user.username}</span>
                <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-stone-700 bg-stone-800 shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-stone-700">
                    <p className="text-sm font-semibold text-stone-100">{user.username}</p>
                    <p className="text-xs text-stone-500 truncate">{user.email}</p>
                  </div>

                  <div className="py-1">
                    {[
                      { href: '/collection', icon: BookOpen, label: 'Collection' },
                      { href: '/favorites',  icon: Heart,    label: 'Favorites' },
                      { href: '/spending',   icon: DollarSign, label: 'Spending' },
                      { href: '/profile',    icon: Settings, label: 'Settings' },
                    ].map(({ href, icon: Icon, label }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-700 hover:text-amber-400 transition-colors"
                      >
                        <Icon size={14} /> {label}
                      </Link>
                    ))}

                    {(user.role === 'ADMIN' || user.role === 'MODERATOR' || user.role === 'COMPANY_MANAGER') && (
                      <>
                        <div className="h-px bg-stone-700 my-1" />
                        <Link
                          href="/admin"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-400 hover:bg-stone-700 hover:text-amber-400 transition-colors"
                        >
                          <LayoutDashboard size={14} /> Admin Panel
                        </Link>
                      </>
                    )}

                    <div className="h-px bg-stone-700 my-1" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-stone-500 hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="px-4 py-1.5 rounded-full border border-amber-700 text-amber-400 hover:bg-amber-700 hover:text-stone-950 transition-colors text-xs font-semibold font-serif tracking-wide"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Second bar — main navigation */}
      <nav className="border-b border-stone-700 bg-stone-800 overflow-x-auto scrollbar-none">
        <div className="flex items-center px-4 sm:px-6">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs font-serif uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap
                ${isActive(href)
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200 hover:border-stone-600'}
              `}
            >
              {label}
            </Link>
          ))}

          {user && USER_NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs font-serif uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap
                ${isActive(href)
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200 hover:border-stone-600'}
              `}
            >
              <Icon size={13} />
              {label}
            </Link>
          ))}

          {/* Admin Panel — far right, admins/mods only */}
          {user && (user.role === 'ADMIN' || user.role === 'MODERATOR' || user.role === 'COMPANY_MANAGER') && (
            <>
              <div className="ml-auto flex items-center">
                <div className="w-px h-4 bg-stone-700 mx-1 shrink-0" />
                <Link
                  href="/admin"
                  className={`
                    flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs font-serif uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap
                    ${isActive('/admin')
                      ? 'border-amber-400 text-amber-400'
                      : 'border-transparent text-amber-600 hover:text-amber-400 hover:border-amber-700'}
                  `}
                >
                  <LayoutDashboard size={13} />
                  Admin
                </Link>
              </div>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
