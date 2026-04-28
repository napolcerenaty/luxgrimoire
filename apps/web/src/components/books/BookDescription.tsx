'use client'

import { useState } from 'react'

interface Props {
  description: string
  maxChars?: number
}

export function BookDescription({ description, maxChars = 400 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isLong = description.length > maxChars
  const displayed = (!isLong || expanded) ? description : description.slice(0, maxChars).trimEnd() + '…'

  return (
    <div>
      <p className="text-stone-300 leading-relaxed text-base whitespace-pre-line">{displayed}</p>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-sm text-amber-500 hover:text-amber-400 transition-colors"
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  )
}
