import type { Metadata } from 'next'
import BlogSearchClient from '@/components/blog/BlogSearchClient'

export const metadata: Metadata = {
  title: 'Search | LuxGrimoire Blog',
}

export default function BlogSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return <BlogSearchClient searchParamsPromise={searchParams} />
}
