'use client'

import { useEffect } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export default function BlogPostViewTracker({ slug, title }: { slug: string; title: string }) {
  useEffect(() => {
    fetch(
      `${API_BASE}/analytics/public/blog-post-view?slug=${encodeURIComponent(slug)}&title=${encodeURIComponent(title)}`,
      { method: 'GET' },
    ).catch(() => {})
  }, [slug, title])

  return null
}
