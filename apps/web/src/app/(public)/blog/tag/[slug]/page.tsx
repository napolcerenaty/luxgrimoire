import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Clock } from 'lucide-react'
import { getTagBySlug, getPostsByTag, getTags, getSponsoredLabel, type GhostPost } from '@/lib/ghost'

export const revalidate = 60

export async function generateStaticParams() {
  const tags = await getTags(50)
  return tags.map(t => ({ slug: t.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const tag = await getTagBySlug(slug)
  if (!tag) return {}
  return {
    title: `${tag.name} | LuxGrimoire Blog`,
    description: tag.description ?? `Posts tagged with ${tag.name}`,
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function PostCard({ post }: { post: GhostPost }) {
  const excerpt = post.custom_excerpt ?? post.excerpt
  const sponsored = getSponsoredLabel(post)
  return (
    <article
      className={`rounded-[20px] border p-5 flex flex-col transition-all duration-200 cursor-pointer blog-guide-card ${post.featured && !sponsored ? 'blog-featured-glow' : ''}`}
      style={{ borderColor: post.featured && !sponsored ? 'rgba(212,175,55,0.45)' : 'var(--border)', background: sponsored ? 'var(--bg-raised)' : undefined, opacity: sponsored ? 0.82 : 1 }}
    >
      {post.feature_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.feature_image} alt={post.feature_image_alt ?? post.title} className="w-full h-40 object-cover rounded-[14px] mb-4" />
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-serif text-[1.2rem] leading-snug mt-0 flex-1" style={{ color: 'var(--text-bright)' }}>{post.title}</h3>
        {post.featured && !sponsored && (
          <span className="text-sm leading-none shrink-0 mt-1" style={{ color: '#d4af37', textShadow: '0 0 6px rgba(212,175,55,0.7)' }} aria-label="Featured">✦</span>
        )}
        {sponsored && (
          <span className="text-[10px] font-serif uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{sponsored}</span>
        )}
      </div>
      {excerpt && <p className="text-sm leading-relaxed mb-3 line-clamp-3 flex-1" style={{ color: 'var(--text-dim)' }}>{excerpt}</p>}
      <div className="flex items-center gap-3 text-xs mt-auto" style={{ color: 'var(--text-muted)' }}>
        {post.reading_time > 0 && <span className="flex items-center gap-1"><Clock size={11} /> {post.reading_time} min</span>}
        <span>{formatDate(post.published_at)}</span>
      </div>
    </article>
  )
}

export default async function BlogTagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [tag, allPosts] = await Promise.all([getTagBySlug(slug), getPostsByTag(slug, 50)])
  if (!tag) notFound()

  // Pin featured posts first
  const posts = [...allPosts].sort((a, b) => {
    if (a.featured && !b.featured) return -1
    if (!a.featured && b.featured) return 1
    return 0
  })

  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(circle at top center, var(--accent-glow), transparent 30%), linear-gradient(180deg, var(--bg-surface) 0%, var(--bg) 60%, var(--bg-surface) 100%)' }}>
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 pb-16 pt-8">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center h-7 px-3 rounded-full border mb-4 text-xs font-serif uppercase tracking-wide" style={{ borderColor: 'var(--accent-border)', color: 'var(--accent-bright)', background: 'var(--accent-glow)' }}>
            {tag.name}
          </div>
          <h1 className="font-serif leading-tight mt-0 mb-2" style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', color: 'var(--text-bright)' }}>
            {tag.name}
          </h1>
          {tag.description && <p className="text-base" style={{ color: 'var(--text-dim)' }}>{tag.description}</p>}
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{posts.length} post{posts.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Posts grid */}
        {posts.length === 0 ? (
          <div className="py-20 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-4xl mb-4">📚</p>
            <p>No posts in this category yet.</p>
            <Link href="/blog" className="inline-flex mt-4 text-sm transition-colors hover:text-[var(--accent-bright)]" style={{ color: 'var(--text-dim)' }}>← Back to Blog</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {posts.map(post => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="block">
                <PostCard post={post} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
