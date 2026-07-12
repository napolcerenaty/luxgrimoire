import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock } from 'lucide-react'
import { getPosts, getTags, hasInternalTag, getSponsoredLabel, type GhostPost } from '@/lib/ghost'
import BlogViewTracker from '@/components/blog/BlogViewTracker'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Blog | LuxGrimoire',
  description: 'Stories, guides and features for special edition book collectors.',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function HeroPanel({ post, large }: { post: GhostPost; large?: boolean }) {
  const sponsored = getSponsoredLabel(post)
  return (
    <article
      className={`relative overflow-hidden rounded-[28px] border transition-all duration-[220ms] cursor-pointer blog-panel-card group ${large ? 'min-h-[458px]' : 'min-h-[220px]'} ${post.featured ? 'blog-featured-glow' : ''}`}
      style={{ borderColor: post.featured ? 'rgba(212,175,55,0.6)' : 'var(--border)' }}
    >
      {post.feature_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.feature_image} alt={post.feature_image_alt ?? post.title} className="absolute inset-0 w-full h-full object-cover" />
      ) : null}
      <div className="absolute inset-0 blog-panel-overlay" />
      {/* Featured star */}
      {post.featured && !sponsored && (
        <span className="absolute top-4 right-4 text-base leading-none" style={{ color: '#d4af37', textShadow: '0 0 8px rgba(212,175,55,0.8)' }} aria-label="Featured">✦</span>
      )}
      {/* Sponsored badge */}
      {sponsored && (
        <span className="absolute top-4 right-4 text-[10px] font-serif uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'rgba(100,100,100,0.55)', color: 'rgba(220,220,220,0.85)', backdropFilter: 'blur(4px)' }}>{sponsored}</span>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-[22px]">
        {post.primary_tag && (
          <span className="blog-panel-category">{post.primary_tag.name}</span>
        )}
        {large ? (
          <h1 className="font-serif mt-0 mb-2.5 leading-[1.12] text-white" style={{ fontSize: 'clamp(2rem,5vw,3rem)', maxWidth: '12ch' }}>
            {post.title}
          </h1>
        ) : (
          <h2 className="font-serif mt-0 mb-2.5 leading-[1.12] text-white" style={{ fontSize: 'clamp(1.3rem,2.6vw,1.7rem)' }}>
            {post.title}
          </h2>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'rgba(200,230,255,0.75)' }}>
          {post.authors[0] && <span>{post.authors[0].name}</span>}
          {post.reading_time > 0 && (
            <><span className="opacity-50">·</span><span className="flex items-center gap-1"><Clock size={12} /> {post.reading_time} min</span></>
          )}
          {post.published_at && (
            <><span className="opacity-50">·</span><span>{formatDate(post.published_at)}</span></>
          )}
        </div>
      </div>
    </article>
  )
}

function GuideCard({ post }: { post: GhostPost }) {
  const excerpt = post.custom_excerpt ?? post.excerpt
  const sponsored = getSponsoredLabel(post)
  return (
    <article
      className={`rounded-[24px] border p-5 h-full flex flex-col transition-all duration-[220ms] cursor-pointer blog-guide-card ${post.featured && !sponsored ? 'blog-featured-glow' : ''}`}
      style={{ borderColor: post.featured && !sponsored ? 'rgba(212,175,55,0.45)' : 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        {post.primary_tag ? (
          <div className="text-xs font-serif uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
            {post.primary_tag.name}
          </div>
        ) : <div />}
        {post.featured && !sponsored && (
          <span className="text-sm leading-none shrink-0" style={{ color: '#d4af37', textShadow: '0 0 6px rgba(212,175,55,0.7)' }} aria-label="Featured">✦</span>
        )}
        {sponsored && (
          <span className="text-[10px] font-serif uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{sponsored}</span>
        )}
      </div>
      <h3 className="font-serif text-[1.35rem] leading-[1.18] mb-2.5 mt-0" style={{ color: 'var(--text-bright)' }}>
        {post.title}
      </h3>
      {excerpt && (
        <p className="leading-[1.52] mb-3.5 line-clamp-3 flex-1" style={{ color: 'var(--text-dim)' }}>{excerpt}</p>
      )}
      <span className="text-sm mt-auto" style={{ color: 'var(--accent-bright)' }}>Read →</span>
    </article>
  )
}

export default async function BlogPage() {
  const [posts, tags, features] = await Promise.all([
    getPosts(30),
    getTags(),
    fetch(`${process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/homepage-features`, { next: { revalidate: 60 } })
      .then(r => r.ok ? r.json() : [])
      .catch(() => []) as Promise<{ title: string; description: string }[]>,
  ])

  const featureDesc = features?.[0]?.description ?? 'Add editions, track ownership status (preorder, shipping, own, sold) and reading status — all in one place.'

  // ── Hero selection ────────────────────────────────────────────────
  // Large = newest post regardless of featured status
  const heroLarge = posts[0] ?? null

  // Small slots: prefer #hero-1 / #hero-2 tags, fallback to newest featured
  const featuredPosts = posts.filter(p => p.featured && p.slug !== heroLarge?.slug)
  const heroSlot1 =
    posts.find(p => hasInternalTag(p, 'hero-1') && p.slug !== heroLarge?.slug) ??
    featuredPosts[0] ?? null
  const heroSlot2 =
    posts.find(p => hasInternalTag(p, 'hero-2') && p.slug !== heroLarge?.slug && p.slug !== heroSlot1?.slug) ??
    featuredPosts.find(p => p.slug !== heroSlot1?.slug) ?? null

  const heroSlugs = new Set([heroLarge?.slug, heroSlot1?.slug, heroSlot2?.slug].filter(Boolean) as string[])

  // ── Category sections (excluding hero posts) ──────────────────────
  const rest = posts.filter(p => !heroSlugs.has(p.slug))

  const byTag: Map<string, { name: string; slug: string; posts: GhostPost[] }> = new Map()
  for (const post of rest) {
    const key = post.primary_tag?.slug ?? 'more'
    if (!byTag.has(key)) byTag.set(key, { name: post.primary_tag?.name ?? 'More Posts', slug: key, posts: [] })
    byTag.get(key)!.posts.push(post)
  }
  // Pin featured posts first in each category
  for (const group of byTag.values()) {
    group.posts.sort((a, b) => {
      if (a.featured && !b.featured) return -1
      if (!a.featured && b.featured) return 1
      return 0
    })
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'radial-gradient(circle at top center, var(--accent-glow), transparent 30%), linear-gradient(180deg, var(--bg-surface) 0%, var(--bg) 60%, var(--bg-surface) 100%)' }}
    >
      <BlogViewTracker />
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 pb-16">

        {/* ── Hero mosaic ── */}
        <section aria-label="Featured posts">
          {heroLarge ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-[18px] pt-6">
              <Link href={`/blog/${heroLarge.slug}`} className="block">
                <HeroPanel post={heroLarge} large />
              </Link>
              <div className="grid gap-[18px]" style={{ gridTemplateRows: 'repeat(2, minmax(220px, 1fr))' }}>
                {heroSlot1 && (
                  <Link href={`/blog/${heroSlot1.slug}`} className="block">
                    <HeroPanel post={heroSlot1} />
                  </Link>
                )}
                {heroSlot2 && (
                  <Link href={`/blog/${heroSlot2.slug}`} className="block">
                    <HeroPanel post={heroSlot2} />
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="pt-16 pb-8 text-center">
              <div className="text-6xl mb-5">📚</div>
              <h2 className="font-serif text-2xl mb-2 mt-0" style={{ color: 'var(--text-bright)' }}>Stories Coming Soon</h2>
              <p style={{ color: 'var(--text-dim)' }}>{featureDesc}</p>
              <Link href="/" className="inline-flex items-center gap-2 mt-6 text-sm transition-colors hover:underline" style={{ color: 'var(--accent-bright)' }}>
                ← Back to App
              </Link>
            </div>
          )}
        </section>

        {/* ── Tag strip ── */}
        {tags.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto pt-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Topics">
            <Link
              href="/blog"
              className="inline-flex items-center h-11 px-4 rounded-full border text-sm font-serif uppercase tracking-wide whitespace-nowrap blog-tag active"
              style={{ borderColor: 'var(--border)' }}
            >
              All
            </Link>
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/blog/tag/${tag.slug}`}
                className="inline-flex items-center h-11 px-4 rounded-full border text-sm font-serif uppercase tracking-wide whitespace-nowrap blog-tag"
                style={{ borderColor: 'var(--border)' }}
              >
                {tag.name}
              </Link>
            ))}
          </div>
        )}

        {/* ── Sections by tag ── */}
        {Array.from(byTag.entries()).map(([, { name: tagName, slug: tagSlug, posts: tagPosts }]) => (
          <section key={tagSlug} className="pt-10">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="font-serif m-0 text-[clamp(1.35rem,3vw,2rem)]" style={{ color: 'var(--text-bright)' }}>{tagName}</h2>
              <Link
                href={`/blog/tag/${tagSlug}`}
                className="shrink-0 text-sm transition-colors hover:underline"
                style={{ color: 'var(--accent-bright)' }}
              >
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[18px]">
              {tagPosts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`} className="block h-full">
                  <GuideCard post={post} />
                </Link>
              ))}
            </div>
          </section>
        ))}


        {/* ── CTA ── */}
        <section className="pt-6">
          <div className="blog-cta-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h3 className="font-serif text-[clamp(1.3rem,2.5vw,1.8rem)] mb-2 mt-0" style={{ color: 'var(--text-bright)' }}>
                Track Your Collection
              </h3>
              <p className="m-0" style={{ color: 'var(--text-dim)' }}>
                {featureDesc}
              </p>
            </div>
            <Link href="/" className="blog-btn-primary shrink-0">Open the App →</Link>
          </div>
        </section>

      </div>
    </div>
  )
}
