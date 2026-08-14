'use client'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
    if (totalPages <= 7) return i + 1
    if (page <= 4) return i + 1
    if (page >= totalPages - 3) return totalPages - 6 + i
    return page - 3 + i
  })

  return (
    <nav className="flex items-center justify-center gap-1 mt-8" aria-label="Pagination">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 text-sm rounded border border-navy-700 text-navy-300 disabled:opacity-40 hover:bg-navy-800 transition-colors"
      >
        ← Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-3 py-1.5 text-sm rounded border transition-colors ${
            p === page
              ? 'bg-brand-700 border-brand-700 text-white'
              : 'border-navy-700 text-navy-300 hover:bg-navy-800'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1.5 text-sm rounded border border-navy-700 text-navy-300 disabled:opacity-40 hover:bg-navy-800 transition-colors"
      >
        Next →
      </button>
    </nav>
  )
}
