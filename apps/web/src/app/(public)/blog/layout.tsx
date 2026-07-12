import Link from 'next/link'
import { getTags } from '@/lib/ghost'
import BlogNavLogo from '@/components/blog/BlogNavLogo'
import BlogFooter from '@/components/blog/BlogFooter'
import BlogThemeToggle from '@/components/blog/BlogThemeToggle'
import BlogSearchButton from '@/components/blog/BlogSearchButton'

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  const tags = await getTags(12).catch(() => [])

  return (
    <>
      <header className="sticky top-0 z-50 w-full" style={{ borderBottom: '1px solid var(--border)', background: 'var(--grad-header)' }}>
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6">
          {/* Top row */}
          <div className="flex items-center gap-4 py-3">
            <BlogNavLogo />

            <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

            <Link
              href="/blog"
              className="font-serif text-sm uppercase tracking-widest transition-colors hover:text-amber-400"
              style={{ color: 'var(--text-dim)' }}
            >
              Blog
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <BlogSearchButton />
              <BlogThemeToggle />
              <Link
                href="/"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-700/60 text-amber-400 hover:bg-amber-700 hover:text-stone-950 transition-colors text-xs font-semibold font-serif tracking-wide"
              >
                Open App →
              </Link>
            </div>
          </div>

          {/* Tags strip — second row, only if tags exist */}
          {tags.length > 0 && (
            <nav className="flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Blog categories">
              <Link
                href="/blog"
                className="shrink-0 inline-flex items-center h-7 px-3 rounded-full border text-xs font-serif uppercase tracking-wide transition-colors whitespace-nowrap hover:text-amber-400"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                All
              </Link>
              {tags.map(tag => (
                <Link
                  key={tag.id}
                  href={`/blog/tag/${tag.slug}`}
                  className="shrink-0 inline-flex items-center h-7 px-3 rounded-full border text-xs font-serif uppercase tracking-wide transition-colors whitespace-nowrap hover:text-amber-400"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  {tag.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>

      {children}
      <BlogFooter />
    </>
  )
}
