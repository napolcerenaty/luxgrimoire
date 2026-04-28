'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

interface Props {
  className?: string
  children?: ReactNode
}

/** Navigates to the previous browser history entry. */
export function BackButton({ className, children }: Props) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={className}
    >
      {children ?? '← Back'}
    </button>
  )
}
