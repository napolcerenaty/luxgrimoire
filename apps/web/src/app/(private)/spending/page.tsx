'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { Modal } from '@/components/ui/Modal'
import { Plus, Trash2, TrendingUp } from 'lucide-react'

type Currency = 'EUR' | 'USD' | 'GBP' | 'PLN'

interface SpendingTransaction {
  id: string
  amount: number
  currency: Currency
  purchasedAt: string
  platform: string | null
  notes: string | null
  type: 'SUBSCRIPTION_BOX' | 'INDIVIDUAL_BOOK' | 'OTHER' | null
}

interface SpendingStats {
  totalThisYear: number
  currency: string
  monthlyData: Array<{ month: number; year: number; total: number }>
  byType: {
    subscriptionBox: number
    individualBook: number
    other: number
  }
}

interface AddTransactionForm {
  amount: string
  currency: Currency
  purchasedAt: string
  platform: string
  notes: string
}

const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'PLN']

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

export default function SpendingPage() {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState<AddTransactionForm>({
    amount: '',
    currency: 'EUR',
    purchasedAt: new Date().toISOString().split('T')[0],
    platform: '',
    notes: '',
  })
  const [formError, setFormError] = useState<string | null>(null)

  const { data: stats } = useQuery({
    queryKey: ['spending-stats'],
    queryFn: () => authFetch<SpendingStats>('/spending/stats?currency=EUR'),
  })

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['spending'],
    queryFn: () => authFetch<SpendingTransaction[]>('/spending'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch<void>(`/spending/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['spending'] })
      void queryClient.invalidateQueries({ queryKey: ['spending-stats'] })
    },
  })

  const addMutation = useMutation({
    mutationFn: (data: Omit<AddTransactionForm, 'amount'> & { amount: number }) =>
      authFetch<SpendingTransaction>('/spending', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['spending'] })
      void queryClient.invalidateQueries({ queryKey: ['spending-stats'] })
      setAddOpen(false)
      setForm({ amount: '', currency: 'EUR', purchasedAt: new Date().toISOString().split('T')[0], platform: '', notes: '' })
      setFormError(null)
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid amount')
      return
    }
    addMutation.mutate({ ...form, amount })
  }

  // Build last 12 months bar chart data
  const barData = (() => {
    const now = new Date()
    const months: Array<{ label: string; total: number }> = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const m = d.getMonth() + 1
      const y = d.getFullYear()
      const found = stats?.monthlyData.find((md) => md.month === m && md.year === y)
      months.push({ label: MONTH_LABELS[m - 1], total: found?.total ?? 0 })
    }
    return months
  })()

  const maxBar = Math.max(...barData.map((b) => b.total), 1)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-100">Spending</h1>
          <p className="text-stone-400 text-sm mt-1">Track your book budget</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          <Plus size={16} />
          Add Transaction
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 col-span-2 sm:col-span-1">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">This Year</p>
          <p className="text-2xl font-serif font-bold text-amber-400">
            {stats ? formatMoney(stats.totalThisYear, stats.currency) : '—'}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Subscriptions</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {stats ? formatMoney(stats.byType.subscriptionBox, stats.currency) : '—'}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Individual</p>
          <p className="text-2xl font-serif font-bold text-stone-100">
            {stats ? formatMoney(stats.byType.individualBook, stats.currency) : '—'}
          </p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
          <p className="text-stone-400 text-xs uppercase tracking-wider mb-1">Transactions</p>
          <p className="text-2xl font-serif font-bold text-stone-100">{transactions.length}</p>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider">Monthly Spending (Last 12 months)</h2>
        </div>
        <div className="flex items-end gap-1.5 h-32">
          {barData.map((bar, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-amber-500/80 rounded-t-sm transition-all"
                style={{ height: `${(bar.total / maxBar) * 100}%`, minHeight: bar.total > 0 ? '4px' : '0' }}
                title={`${bar.label}: ${bar.total.toFixed(2)}`}
              />
              <span className="text-[10px] text-stone-500">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Transactions list */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-stone-800">
          <h2 className="font-serif font-semibold text-stone-100">Transactions</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-stone-400 animate-pulse">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-stone-500">No transactions yet</div>
        ) : (
          <div className="divide-y divide-stone-800">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-4 px-4 py-3 hover:bg-stone-800/50 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-stone-100">
                      {tx.platform ?? 'Purchase'}
                    </span>
                    {tx.type && (
                      <span className="text-xs text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full">
                        {tx.type === 'SUBSCRIPTION_BOX' ? 'Subscription' : tx.type === 'INDIVIDUAL_BOOK' ? 'Book' : 'Other'}
                      </span>
                    )}
                  </div>
                  {tx.notes && <p className="text-xs text-stone-500 truncate mt-0.5">{tx.notes}</p>}
                  <p className="text-xs text-stone-500 mt-0.5">
                    {new Date(tx.purchasedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-amber-400">
                    {formatMoney(tx.amount, tx.currency)}
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(tx.id)}
                  disabled={deleteMutation.isPending}
                  className="text-stone-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-2"
                  aria-label="Delete transaction"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Transaction modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setFormError(null) }} title="Add Transaction">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as Currency }))}
                className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 transition-colors"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1">Date</label>
            <input
              type="date"
              required
              value={form.purchasedAt}
              onChange={(e) => setForm((f) => ({ ...f, purchasedAt: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1">Platform / Store</label>
            <input
              type="text"
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
              placeholder="e.g. Fairyloot, Amazon"
              className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…"
              rows={2}
              className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors resize-none"
            />
          </div>
          {formError && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            {addMutation.isPending ? 'Saving…' : 'Add Transaction'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
