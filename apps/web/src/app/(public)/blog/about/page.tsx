import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getPage } from '@/lib/ghost'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('about')
  if (!page) return { title: 'About | LuxGrimoire Blog' }
  return {
    title: `${page.title} | LuxGrimoire Blog`,
    description: page.custom_excerpt ?? page.excerpt ?? undefined,
  }
}

export default async function BlogAboutPage() {
  const page = await getPage('about')
  if (!page) notFound()

  return (
    <div
      className="min-h-screen"
      style={{ background: 'radial-gradient(circle at top center, var(--accent-glow), transparent 30%), linear-gradient(180deg, var(--bg-surface) 0%, var(--bg) 60%, var(--bg-surface) 100%)' }}
    >
      <article className="max-w-[860px] mx-auto px-4 sm:px-6 pt-10 pb-16">
        {/* Back */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm mb-8 transition-colors hover:text-[var(--accent-bright)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft size={14} />
          Back to Blog
        </Link>

        {/* Feature image */}
        {page.feature_image && (
          <div className="relative rounded-[20px] overflow-hidden mb-8" style={{ aspectRatio: '2.5 / 1' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.feature_image} alt={page.feature_image_alt ?? page.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Title */}
        <h1 className="font-serif leading-[1.1] mb-6 mt-0" style={{ fontSize: 'clamp(2rem,5vw,3rem)', color: 'var(--text-bright)' }}>
          {page.title}
        </h1>

        {/* Excerpt */}
        {(page.custom_excerpt ?? page.excerpt) && (
          <p className="text-lg leading-relaxed mb-8 font-medium" style={{ color: 'var(--text-dim)' }}>
            {page.custom_excerpt ?? page.excerpt}
          </p>
        )}

        {/* Ghost HTML content */}
        {page.html && (
          <div className="blog-post-content" dangerouslySetInnerHTML={{ __html: page.html }} />
        )}
      </article>
    </div>
  )
}
