'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Clock, X } from 'lucide-react'

interface GhostPost {
  id: string; title: string; slug: string
  excerpt: string | null; custom_excerpt: string | null
  feature_image: string | null; reading_time: number; published_at: string
  primary_tag?: { name: string; slug: string } | null
}

async function clientSearchPosts(query: string): Promise<GhostPost[]> {
  if (!query.trim()) return []
  const safe = query.replace(/'/g, '')
  const res = await fetch(`/api/blog/search?q=${encodeURIComponent(safe)}`).catch(() => null)
  if (!res?.ok) return []
  return res.json()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function BlogSearchClient({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ q?: string }>
}) {
  const searchParams = use(searchParamsPromise)
  const router = useRouter()
  const [query, setQuery] = useState(searchParams.q ?? '')
  const [results, setResults] = useState<GhostPost[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (searchParams.q) {
      runSearch(searchParams.q)
    }
  }, [])

  async function runSearch(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setSearched(true)
    const res = await clientSearchPosts(q)
    setResults(res)
    setLoading(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    router.replace(`/blog/search?q=${encodeURIComponent(query)}`, { scroll: false })
    runSearch(query)
  }

  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(circle at top center, var(--accent-glow), transparent 30%), linear-gradient(180deg, var(--bg-surface) 0%, var(--bg) 60%, var(--bg-surface) 100%)' }}>
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 pt-10 pb-16">

        {/* Search bar */}
        <h1 className="font-serif mb-6 mt-0" style={{ fontSize: 'clamp(1.6rem,4vw,2.4rem)', color: 'var(--text-bright)' }}>
          Search Posts
        </h1>
        <form onSubmit={handleSubmit} className="flex gap-2 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by title…"
              className="w-full rounded-xl border pl-9 pr-10 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-bright)' }}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setResults([]); setSearched(false) }} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold font-serif transition-colors disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {loading ? '…' : 'Search'}
          </button>
        </form>

        {/* Results */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)' }} />
            ))}
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-4xl mb-3">🔍</p>
            <p>No posts found for <strong style={{ color: 'var(--text-dim)' }}>"{query}"</strong></p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</p>
            {results.map(post => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="flex gap-4 p-4 rounded-xl border transition-all duration-150 group"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
              >
                {post.feature_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.feature_image} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-base leading-snug group-hover:text-[var(--accent-bright)] transition-colors" style={{ color: 'var(--text-bright)' }}>{post.title}</p>
                  {(post.custom_excerpt ?? post.excerpt) && (
                    <p className="text-sm mt-1 line-clamp-1" style={{ color: 'var(--text-dim)' }}>{post.custom_excerpt ?? post.excerpt}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {post.primary_tag && <span style={{ color: 'var(--accent-bright)' }}>{post.primary_tag.name}</span>}
                    {post.reading_time > 0 && <span className="flex items-center gap-1"><Clock size={10} />{post.reading_time} min</span>}
                    <span>{formatDate(post.published_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!searched && (
          <div className="py-16 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-4xl mb-3">📚</p>
            <p>Type a title to search blog posts</p>
          </div>
        )}
      </div>
    </div>
  )
}
