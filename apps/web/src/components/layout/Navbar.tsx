import Link from 'next/link'
import { Search } from 'lucide-react'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-800 bg-stone-950/95 backdrop-blur-sm">
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-xl font-serif font-bold text-amber-400 tracking-wide shrink-0"
        >
          LuxGrimoire
        </Link>

        <div className="flex items-center gap-6 text-sm font-medium text-stone-300">
          <Link href="/companies" className="hover:text-amber-400 transition-colors hidden sm:block">
            Companies
          </Link>
          <Link href="/subscriptions" className="hover:text-amber-400 transition-colors hidden sm:block">
            Subscriptions
          </Link>
          <Link
            href="/search"
            className="hover:text-amber-400 transition-colors flex items-center gap-1"
          >
            <Search size={16} />
            <span className="hidden sm:inline">Search</span>
          </Link>
          <Link
            href="/login"
            className="ml-2 px-4 py-1.5 rounded-full border border-amber-700 text-amber-400 hover:bg-amber-700 hover:text-white transition-colors text-xs font-semibold"
          >
            Login
          </Link>
        </div>
      </nav>
      {/* Mobile secondary nav */}
      <div className="sm:hidden flex items-center gap-6 px-4 py-2 border-t border-stone-800 text-sm text-stone-300">
        <Link href="/companies" className="hover:text-amber-400 transition-colors">Companies</Link>
        <Link href="/subscriptions" className="hover:text-amber-400 transition-colors">Subscriptions</Link>
      </div>
    </header>
  )
}
