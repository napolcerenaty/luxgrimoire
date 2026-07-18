import type { Metadata } from 'next'
import { BooksByMonthClient } from '@/components/books-by-month/BooksByMonthClient'

export const metadata: Metadata = {
  title: 'Subscription Boxes by Month',
  description: 'Every book across every book subscription box for a given month — compare boxes, spot repeats, and see what\'s coming.',
}

export default function BooksByMonthPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      <h1 className="text-4xl font-serif font-bold text-stone-100 mb-1">Subscription Boxes by Month</h1>
      <p className="text-sm text-stone-400 mb-6">
        Every book across every book subscription box for the selected month — see your own subscriptions highlighted, or compare across boxes.
      </p>
      <BooksByMonthClient />
    </div>
  )
}
