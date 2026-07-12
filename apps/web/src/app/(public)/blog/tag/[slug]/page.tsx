import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Clock } from 'lucide-react'
import { getTagBySlug, getPostsByTag, getTags, type GhostPost } from '@/lib/ghost'

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
  return (
    <article className="rounded-[20px] border p-5 flex flex-col transition-all duration-200 cursor-pointer blog-guide-card" style={{ borderColor: 'var(--border)' }}>
      {post.feature_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.feature_image} alt={post.feature_image_alt ?? post.title} className="w-full h-40 object-cover rounded-[14px] mb-4" />
      )}
      <h3 className="font-serif text-[1.2rem] leading-snug mb-2 mt-0" style={{ color: 'var(--text-bright)' }}>{post.title}</h3>
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
  const [tag, posts] = await Promise.all([getTagBySlug(slug), getPostsByTag(slug, 50)])
  if (!tag) notFound()

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
