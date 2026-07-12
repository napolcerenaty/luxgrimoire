'use client'

import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

export default function BlogSearchButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push('/blog/search')}
      className="p-1.5 rounded-lg transition-colors"
      style={{ color: 'var(--text-muted)' }}
      aria-label="Search blog"
      title="Search posts"
    >
      <Search size={16} />
    </button>
  )
}
