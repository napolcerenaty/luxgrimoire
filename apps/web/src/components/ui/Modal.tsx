'use client'

import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-navy-900 border border-navy-700 rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-navy-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-navy-400 hover:text-navy-100 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
