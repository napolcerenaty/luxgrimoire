import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-stone-800 bg-stone-950 text-stone-400 py-10 mt-16">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <p className="font-serif text-amber-400 font-semibold">LuxGrimoire</p>
        <div className="flex items-center gap-6">
          <Link href="/companies" className="hover:text-stone-200 transition-colors">Companies</Link>
          <Link href="/subscriptions" className="hover:text-stone-200 transition-colors">Subscriptions</Link>
          <Link href="/search" className="hover:text-stone-200 transition-colors">Search</Link>
        </div>
        <p className="text-xs text-stone-600">© {new Date().getFullYear()} LuxGrimoire. All rights reserved.</p>
      </div>
    </footer>
  )
}
