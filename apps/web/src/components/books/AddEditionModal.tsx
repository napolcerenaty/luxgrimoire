'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { PlusCircle, X } from 'lucide-react'
import CreateBookEditionForm from '@/components/admin/CreateBookEditionForm'

interface Props {
  bookId: string
}

export function AddEditionModal({ bookId }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (!user) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-amber-700/60 text-amber-400 hover:bg-amber-900/20 transition-colors"
      >
        <PlusCircle size={15} />
        Add Edition
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10 px-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl bg-stone-950 border border-stone-700 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-stone-800">
              <h2 className="font-serif font-semibold text-stone-100">Add Edition</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-stone-500 hover:text-stone-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-xs text-stone-500 mb-4 italic">
                Editions submitted by users are visible immediately with an &ldquo;Unverified&rdquo; badge until reviewed by our team.
              </p>
              <CreateBookEditionForm
                existingBookId={bookId}
                onSuccess={() => {
                  setOpen(false)
                  router.refresh()
                }}
                onCancel={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
