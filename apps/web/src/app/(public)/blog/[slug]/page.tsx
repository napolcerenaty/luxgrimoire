import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, Calendar } from 'lucide-react'
import { getPostBySlug, getPosts, getPostsByTag, type GhostPost } from '@/lib/ghost'
import BlogPostViewTracker from '@/components/blog/BlogPostViewTracker'
import BlogPostContent from '@/components/blog/BlogPostContent'

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

function RelatedPosts({
  posts,
  tagName,
  tagSlug,
  sidebar,
}: {
  posts: GhostPost[]
  tagName?: string
  tagSlug?: string
  sidebar?: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2
          className="font-serif m-0"
          style={{ fontSize: sidebar ? '1.1rem' : '1.4rem', color: 'var(--text-bright)' }}
        >
          More from{' '}
          <span style={{ color: 'var(--accent-bright)' }}>{tagName ?? 'the Blog'}</span>
        </h2>
        {tagSlug && (
          <Link
            href={`/blog/tag/${tagSlug}`}
            className="shrink-0 text-xs transition-colors hover:underline"
            style={{ color: 'var(--accent-bright)' }}
          >
            See all →
          </Link>
        )}
      </div>

      <div className={sidebar ? 'flex flex-col gap-3' : 'grid sm:grid-cols-3 gap-4'}>
        {posts.map(r => (
          <Link
            key={r.id}
            href={`/blog/${r.slug}`}
            className="group block rounded-[16px] border overflow-hidden transition-all duration-200"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
          >
            {r.feature_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.feature_image}
                alt={r.feature_image_alt ?? r.title}
                className={`w-full object-cover ${sidebar ? 'h-24' : 'h-28'}`}
              />
            ) : (
              <div
                className={`w-full flex items-center justify-center text-2xl ${sidebar ? 'h-16' : 'h-20'}`}
                style={{ background: 'var(--bg-raised)' }}
                aria-hidden="true"
              >📚</div>
            )}
            <div className="p-3">
              <p
                className="font-serif text-sm leading-snug line-clamp-2 transition-colors group-hover:text-[var(--accent-bright)]"
                style={{ color: 'var(--text-bright)' }}
              >
                {r.title}
              </p>
              {r.reading_time > 0 && (
                <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <Clock size={10} /> {r.reading_time} min
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const tagSlug = post.primary_tag?.slug
  const related = tagSlug ? await getPostsByTag(tagSlug, 4, slug) : []

  return (
    <div
      className="min-h-screen"
      style={{ background: 'radial-gradient(circle at top center, var(--accent-glow), transparent 30%), linear-gradient(180deg, var(--bg-surface) 0%, var(--bg) 60%, var(--bg-surface) 100%)' }}
    >
      <BlogPostViewTracker slug={post.slug} title={post.title} />

      <div className="max-w-[1260px] mx-auto px-4 sm:px-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm flex-wrap pt-6 pb-2" aria-label="Breadcrumb" style={{ color: 'var(--text-muted)' }}>
          <Link href="/" className="transition-colors hover:text-[var(--accent-bright)]">LuxGrimoire</Link>
          <span className="opacity-50">/</span>
          <Link href="/blog" className="transition-colors hover:text-[var(--accent-bright)]">Blog</Link>
          <span className="opacity-50">/</span>
          <span className="truncate max-w-[220px]" style={{ color: 'var(--text-dim)' }}>{post.title}</span>
        </nav>

        {/* Feature image — full width above grid */}
        {post.feature_image && (
          <div className="pt-4 pb-6">
            <div className="relative rounded-[24px] overflow-hidden" style={{ aspectRatio: '2.8 / 1' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.feature_image} alt={post.feature_image_alt ?? post.title} className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        {/* Two-column grid: article + sidebar */}
        <div className="grid xl:grid-cols-[1fr_300px] gap-12 items-start pb-16">

          {/* ── Main article ── */}
          <article className="min-w-0">
            {/* Tags */}
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {post.tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/blog/tag/${tag.slug}`}
                    className="inline-flex items-center h-7 px-3 rounded-full border text-xs font-serif uppercase tracking-[0.07em] transition-colors hover:border-[var(--accent)]"
                    style={{ borderColor: 'var(--accent-border)', color: 'var(--accent-bright)', background: 'var(--accent-glow)' }}
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}

            <h1 className="font-serif leading-[1.1] mb-5 mt-0" style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', color: 'var(--text-bright)' }}>
              {post.title}
            </h1>

            <div
              className="flex flex-wrap items-center gap-4 mb-8 pb-6 text-sm"
              style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}
            >
              {post.authors[0] && <span className="font-medium">{post.authors[0].name}</span>}
              <span className="flex items-center gap-1.5"><Calendar size={13} />{formatDate(post.published_at)}</span>
              {post.reading_time > 0 && (
                <span className="flex items-center gap-1.5"><Clock size={13} />{post.reading_time} min read</span>
              )}
            </div>

            {(post.custom_excerpt ?? post.excerpt) && (
              <p className="text-lg leading-relaxed mb-8 font-medium" style={{ color: 'var(--text-dim)' }}>
                {post.custom_excerpt ?? post.excerpt}
              </p>
            )}

            {post.html && <BlogPostContent html={post.html} />}

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

            {/* Related posts — mobile only (below article) */}
            {related.length > 0 && (
              <div className="mt-10 xl:hidden">
                <RelatedPosts posts={related} tagName={post.primary_tag?.name} tagSlug={tagSlug} />
              </div>
            )}
          </article>

          {/* ── Sidebar — desktop only ── */}
          {related.length > 0 && (
            <aside className="hidden xl:block sticky top-[108px] self-start max-h-[calc(100vh-120px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <RelatedPosts posts={related} tagName={post.primary_tag?.name} tagSlug={tagSlug} sidebar />
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
