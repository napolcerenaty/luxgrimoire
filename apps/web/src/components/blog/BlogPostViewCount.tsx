import { Eye } from 'lucide-react'

export default function BlogPostViewCount({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <Eye size={13} />
      {new Intl.NumberFormat('en-US').format(count)} views
    </span>
  )
}
