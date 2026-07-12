import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, Calendar } from 'lucide-react'
import { getPostBySlug, getPosts } from '@/lib/ghost'
import BlogPostViewTracker from '@/components/blog/BlogPostViewTracker'

export const revalidate = 60

export async function generateStaticParams() {
  const posts = await getPosts(50)
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}
  return {
    title: `${post.title} | LuxGrimoire Blog`,
    description: post.custom_excerpt ?? post.excerpt ?? undefined,
    openGraph: post.feature_image
      ? { images: [{ url: post.feature_image }] }
      : undefined,
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  return (
    <div
      className="min-h-screen"
      style={{ background: 'radial-gradient(circle at top center, var(--accent-glow), transparent 30%), linear-gradient(180deg, var(--bg-surface) 0%, var(--bg) 60%, var(--bg-surface) 100%)' }}
    >
      <BlogPostViewTracker slug={post.slug} title={post.title} />
      {/* Breadcrumb */}
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 pt-6 pb-2">
        <nav className="flex items-center gap-2 text-sm flex-wrap" aria-label="Breadcrumb" style={{ color: 'var(--text-muted)' }}>
          <Link href="/" className="transition-colors hover:text-[var(--accent-bright)]">LuxGrimoire</Link>
          <span className="opacity-50">/</span>
          <Link href="/blog" className="transition-colors hover:text-[var(--accent-bright)]">Blog</Link>
          <span className="opacity-50">/</span>
          <span className="truncate max-w-[220px]" style={{ color: 'var(--text-dim)' }}>{post.title}</span>
        </nav>
      </div>

      {/* Feature image */}
      {post.feature_image && (
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-4">
          <div className="relative rounded-[24px] overflow-hidden" style={{ aspectRatio: '2.5 / 1' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.feature_image}
              alt={post.feature_image_alt ?? post.title}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Article */}
      <article className="max-w-[860px] mx-auto px-4 sm:px-6 pt-8 pb-12">
        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center h-7 px-3 rounded-full border text-xs font-serif uppercase tracking-[0.07em]"
                style={{ borderColor: 'var(--accent-border)', color: 'var(--accent-bright)', background: 'var(--accent-glow)' }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h1 className="font-serif leading-[1.1] mb-5 mt-0" style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', color: 'var(--text-bright)' }}>
          {post.title}
        </h1>

        {/* Meta */}
        <div
          className="flex flex-wrap items-center gap-4 mb-8 pb-6 text-sm"
          style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}
        >
          {post.authors[0] && <span className="font-medium">{post.authors[0].name}</span>}
          <span className="flex items-center gap-1.5">
            <Calendar size={13} />
            {formatDate(post.published_at)}
          </span>
          {post.reading_time > 0 && (
            <span className="flex items-center gap-1.5">
              <Clock size={13} />
              {post.reading_time} min read
            </span>
          )}
        </div>

        {/* Excerpt */}
        {(post.custom_excerpt ?? post.excerpt) && (
          <p className="text-lg leading-relaxed mb-8 font-medium" style={{ color: 'var(--text-dim)' }}>
            {post.custom_excerpt ?? post.excerpt}
          </p>
        )}

        {/* Ghost HTML content */}
        {post.html && (
          <div
            className="blog-post-content"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
        )}

        {/* Back link */}
        <div className="mt-12 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm transition-colors hover:text-[var(--accent-bright)]"
            style={{ color: 'var(--text-dim)' }}
          >
            <ArrowLeft size={15} />
            Back to Blog
          </Link>
        </div>
      </article>

      {/* CTA */}
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 pb-16">
        <div className="blog-cta-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h3 className="font-serif text-xl mb-1.5 mt-0" style={{ color: 'var(--text-bright)' }}>Track Your Collection</h3>
            <p className="m-0 text-sm" style={{ color: 'var(--text-dim)' }}>
              Log variants, signatures and shelf notes in LuxGrimoire — the premium archive for special edition book collectors.
            </p>
          </div>
          <Link href="/" className="blog-btn-primary shrink-0">Open the App →</Link>
        </div>
      </div>
    </div>
  )
}
