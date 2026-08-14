'use client'

import React from 'react'
import { X } from 'lucide-react'

interface FormModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}

export default function FormModal({ open, title, onClose, children }: FormModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-800 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-800 shrink-0">
          <h2 className="text-lg font-semibold text-navy-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-navy-400 hover:text-navy-200 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  )
}
