import Link from 'next/link'
import { Instagram } from 'lucide-react'

const YEAR = new Date().getFullYear()

export default function BlogFooter() {
  return (
    <footer className="border-t mt-16" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex flex-col items-center sm:items-start gap-1">
            <span className="font-serif font-bold tracking-widest text-amber-400 text-base">LuxGrimoire</span>
            <p className="text-[11px] font-serif uppercase tracking-[0.2em]" style={{ color: 'var(--accent-bright)', opacity: 0.7 }}>
              Limited books. Unlimited obsession.
            </p>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            <Link href="/blog" className="transition-colors hover:text-[var(--accent-bright)]">Blog</Link>
            <Link href="/blog/about" className="transition-colors hover:text-[var(--accent-bright)]">About</Link>
            <Link href="/privacy" className="transition-colors hover:text-[var(--accent-bright)]">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--accent-bright)]">Terms</Link>
            <Link href="/contact" className="transition-colors hover:text-[var(--accent-bright)]">Contact</Link>
            <Link
              href="/"
              className="ml-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold font-serif transition-colors hover:bg-amber-700 hover:text-stone-950"
              style={{ borderColor: 'var(--accent-border)', color: 'var(--accent-bright)' }}
            >
              Open App →
            </Link>
          </nav>

          {/* Social */}
          <a
            href="https://www.instagram.com/luxgrimoire/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--accent-bright)]"
            aria-label="LuxGrimoire on Instagram"
          >
            <Instagram size={20} />
          </a>
        </div>

        <p className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
          © {YEAR} LuxGrimoire. All rights reserved. Not affiliated with or endorsed by any listed companies.
        </p>
      </div>
    </footer>
  )
}
