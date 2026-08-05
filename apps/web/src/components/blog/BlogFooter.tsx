import Link from 'next/link'
import { Instagram } from 'lucide-react'

const YEAR = new Date().getFullYear()

export default function BlogFooter() {
  return (
    <footer className="border-t mt-16" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex flex-col items-center sm:items-start gap-1">
            <span className="font-serif font-bold tracking-widest text-brand-400 text-base">LuxGrimoire</span>
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
              className="ml-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold font-serif transition-colors hover:bg-brand-700 hover:text-stone-950"
              style={{ borderColor: 'var(--accent-border)', color: 'var(--accent-bright)' }}
            >
              Open App →
            </Link>
          </nav>

          {/* Social */}
          <div className="flex items-center gap-4">
            <a
              href="https://www.instagram.com/luxgrimoire/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--accent-bright)]"
              aria-label="LuxGrimoire on Instagram"
            >
              <Instagram size={20} />
            </a>
            <a
              href="https://www.tiktok.com/@luxgrimoire"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--accent-bright)]"
              aria-label="LuxGrimoire on TikTok"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
            </a>
            <a
              href="https://www.threads.com/@luxgrimoire"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--accent-bright)]"
              aria-label="LuxGrimoire on Threads"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z"/></svg>
            </a>
          </div>
        </div>

        <p className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
          © {YEAR} LuxGrimoire. All rights reserved. Not affiliated with or endorsed by any listed companies.
        </p>
      </div>
    </footer>
  )
}
