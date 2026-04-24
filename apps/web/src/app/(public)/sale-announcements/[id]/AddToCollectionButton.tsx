'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createPurchaseGroup } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'

interface Props {
  saleAnnouncementId: string
  editionIds: string[]
  basePrice?: number
  currency: string
}

export function AddToCollectionButton({ saleAnnouncementId, editionIds, basePrice, currency }: Props) {
  const [open, setOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    totalAmount: basePrice != null ? String(basePrice) : '',
    currency: currency,
    shippingAmount: '',
    purchasedAt: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
  const LBL = 'block text-sm text-stone-400 mb-1'

  const mutation = useMutation({
    mutationFn: () =>
      createPurchaseGroup({
        saleAnnouncementId,
        totalAmount: Number(form.totalAmount),
        currency: form.currency,
        shippingAmount: form.shippingAmount ? Number(form.shippingAmount) : undefined,
        purchasedAt: form.purchasedAt,
        notes: form.notes || undefined,
        editionIds,
      }),
    onSuccess: () => {
      setSuccess(true)
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
      }, 2000)
    },
  })

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        Add to My Collection
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Bundle to Collection">
        {success ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✓</div>
            <p className="text-green-400 font-semibold">Added to your collection!</p>
          </div>
        ) : (
          <form
            onSubmit={e => { e.preventDefault(); mutation.mutate() }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Total Amount *</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  className={INP}
                  value={form.totalAmount}
                  onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                />
              </div>
              <div>
                <label className={LBL}>Currency</label>
                <input
                  className={INP}
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className={LBL}>Shipping Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={INP}
                value={form.shippingAmount}
                onChange={e => setForm(f => ({ ...f, shippingAmount: e.target.value }))}
              />
            </div>

            <div>
              <label className={LBL}>Purchase Date *</label>
              <input
                required
                type="date"
                className={INP}
                value={form.purchasedAt}
                onChange={e => setForm(f => ({ ...f, purchasedAt: e.target.value }))}
              />
            </div>

            <div>
              <label className={LBL}>Notes</label>
              <input
                className={INP}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <p className="text-xs text-stone-500">
              This will add {editionIds.length} edition{editionIds.length !== 1 ? 's' : ''} to your collection as a bundle.
            </p>

            {mutation.isError && (
              <p className="text-red-400 text-sm">{(mutation.error as Error).message}</p>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Adding…' : 'Add to Collection'}
            </button>
          </form>
        )}
      </Modal>
    </>
  )
}
