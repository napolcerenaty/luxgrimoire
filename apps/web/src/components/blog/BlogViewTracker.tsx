'use client'

import { useEffect } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export default function BlogViewTracker() {
  useEffect(() => {
    fetch(`${API_BASE}/analytics/public/blog-view`, { method: 'GET' }).catch(() => {})
  }, [])

  return null
}
