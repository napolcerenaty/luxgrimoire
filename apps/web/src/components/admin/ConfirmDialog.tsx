'use client'

interface ConfirmDialogProps {
  open: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ open, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-stone-100 mb-2">Are you sure?</h3>
        <p className="text-stone-400 text-sm mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="bg-stone-700 text-stone-200 px-4 py-2 rounded-lg hover:bg-stone-600 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm font-semibold"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
