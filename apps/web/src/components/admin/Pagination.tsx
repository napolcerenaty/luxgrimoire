'use client'

import { useState, useEffect } from 'react'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  total?: number
  className?: string
}

export function Pagination({ page, totalPages, onPageChange, total, className }: PaginationProps) {
  const [jumpValue, setJumpValue] = useState('')

  // Keep jump input in sync if page changes externally (e.g. filter reset)
  useEffect(() => { setJumpValue('') }, [page])

  if (totalPages <= 1) return null

  const handleJump = () => {
    const n = parseInt(jumpValue, 10)
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n)
      setJumpValue('')
    }
  }

  const btnClass =
    'px-3 py-1 rounded border border-stone-700 text-stone-400 disabled:opacity-40 hover:border-amber-500 hover:text-amber-400 transition-colors text-sm'

  return (
    <div className={`flex items-center gap-2 mt-4 flex-wrap ${className ?? ''}`}>
      {total !== undefined && (
        <span className="text-stone-500 text-sm mr-2">{total} total</span>
      )}
      <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} className={btnClass}>
        ← Prev
      </button>
      <span className="text-stone-500 text-sm">
        Page {page} / {totalPages}
      </span>
      <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className={btnClass}>
        Next →
      </button>
      <div className="flex items-center gap-1 ml-2">
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={e => setJumpValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJump()}
          placeholder="Go to…"
          className="w-20 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-300 text-sm focus:outline-none focus:border-amber-500"
        />
        <button onClick={handleJump} className={btnClass}>Go</button>
      </div>
    </div>
  )
}
