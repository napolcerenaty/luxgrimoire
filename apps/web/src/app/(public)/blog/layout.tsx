import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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

            <div className="hidden sm:block w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

            <Link
              href="/blog"
              className="shrink-0 font-serif text-sm uppercase tracking-widest transition-colors hover:text-brand-400"
              style={{ color: 'var(--text-dim)' }}
            >
              Blog
            </Link>

            <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
              <BlogSearchButton />
              <BlogThemeToggle />
              {/* Logo now goes to /blog (standard "logo = home of this section" convention),
                  so this is the only way back to the app — always visible, not hidden on
                  mobile, just icon-only there instead of the full labeled pill. */}
              <Link
                href="/"
                aria-label="Back to the LuxGrimoire app"
                title="Back to the LuxGrimoire app"
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-700/60 text-brand-400 hover:bg-brand-700 hover:text-stone-950 transition-colors font-semibold font-serif tracking-wide p-1.5 sm:pl-3 sm:pr-3.5 sm:py-1.5"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline text-xs">Open App</span>
              </Link>
            </div>
          </div>

          {/* Tags strip — second row, only if tags exist. pt-1.5 gives the hover lift
              (.blog-tag:hover translateY(-1px) + box-shadow glow) room above — overflow-x-auto
              implicitly sets overflow-y: auto too, so without it the hovered pill's top edge and
              glow get clipped right at the nav's own top edge. */}
          {tags.length > 0 && (
            <nav className="flex gap-1 overflow-x-auto pt-1.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Blog categories">
              <Link
                href="/blog"
                className="blog-tag shrink-0 inline-flex items-center h-7 px-3 rounded-full border text-xs font-serif uppercase tracking-wide whitespace-nowrap"
              >
                All
              </Link>
              {tags.map(tag => (
                <Link
                  key={tag.id}
                  href={`/blog/tag/${tag.slug}`}
                  className="blog-tag shrink-0 inline-flex items-center h-7 px-3 rounded-full border text-xs font-serif uppercase tracking-wide whitespace-nowrap"
                >
                  {tag.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>

      <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg) 40%, var(--bg) 100%)' }}>
        {children}
        <BlogFooter />
      </div>
    </>
  )
}
