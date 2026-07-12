import Link from 'next/link'
import { getTags } from '@/lib/ghost'
import BlogNavLogo from '@/components/blog/BlogNavLogo'

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  const tags = await getTags(12).catch(() => [])

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-stone-800" style={{ background: 'var(--grad-header)' }}>
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6">
          {/* Top row */}
          <div className="flex items-center gap-4 py-3">
            <BlogNavLogo />

            <div className="w-px h-5 bg-stone-700 shrink-0" />

            <Link
              href="/blog"
              className="font-serif text-sm uppercase tracking-widest text-stone-300 hover:text-amber-400 transition-colors"
            >
              Blog
            </Link>

            <div className="ml-auto flex items-center gap-3">
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
                className="shrink-0 inline-flex items-center h-7 px-3 rounded-full border border-stone-700 text-xs font-serif uppercase tracking-wide text-stone-400 hover:text-amber-400 hover:border-amber-700 transition-colors whitespace-nowrap"
              >
                All
              </Link>
              {tags.map(tag => (
                <span
                  key={tag.id}
                  className="shrink-0 inline-flex items-center h-7 px-3 rounded-full border border-stone-700 text-xs font-serif uppercase tracking-wide text-stone-400 hover:text-amber-400 hover:border-amber-700 transition-colors whitespace-nowrap cursor-default"
                >
                  {tag.name}
                </span>
              ))}
            </nav>
          )}
        </div>
      </header>

      {children}
    </>
  )
}
