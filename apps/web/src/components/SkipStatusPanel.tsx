'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import type { ApiSkipStatus, ApiSubscriptionMonth } from '@luxgrimoire/shared-types'

interface Props {
  subscriptionSlug: string
  months: ApiSubscriptionMonth[]
  onSkipSuccess?: () => void
}

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export default function SkipStatusPanel({ subscriptionSlug, months, onSkipSuccess }: Props) {
  const queryClient = useQueryClient()
  const [skipTarget, setSkipTarget] = useState<{ year: number; month: number } | null>(null)
  const [unskipTarget, setUnskipTarget] = useState<{ year: number; month: number } | null>(null)

  const { data: status, isLoading, error } = useQuery<ApiSkipStatus>({
    queryKey: ['skip-status', subscriptionSlug],
    queryFn: () => authFetch<ApiSkipStatus>(`/skip-policy/${subscriptionSlug}/status`),
    retry: false,
  })

  const skipMutation = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      authFetch<ApiSkipStatus>(`/skip-policy/${subscriptionSlug}/skip/${year}/${month}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['skip-status', subscriptionSlug] })
      void queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] })
      setSkipTarget(null)
      onSkipSuccess?.()
    },
  })

  const unskipMutation = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      authFetch<ApiSkipStatus>(`/skip-policy/${subscriptionSlug}/skip/${year}/${month}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['skip-status', subscriptionSlug] })
      void queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] })
      setUnskipTarget(null)
      onSkipSuccess?.()
    },
  })

  // Not subscribed or policy not configured → don't render
  if (isLoading) return null
  if (error || !status) return null
  if (status.policyType === 'NONE') {
    return (
      <div className="rounded-lg border border-stone-700 p-4 text-sm text-stone-400">
        <span className="font-medium text-stone-300">Skips:</span> Not available for this subscription
      </div>
    )
  }

  const upcoming = months
    .filter((m) => {
      // Use targetMonth from the API as the earliest skippable month.
      // This respects the renewalDay window: before renewalDay → current month is skippable,
      // after renewalDay → earliest is next month.
      const tm = status?.targetMonth
      if (!tm) return false
      return m.year > tm.year || (m.year === tm.year && m.month >= tm.month)
    })
    .filter((m) => !status?.skippedMonths?.some((s) => s.year === m.year && s.month === m.month))
    .filter((m) => {
      // Exclude user's first deliverable month (cannot skip first box/series)
      const fdm = status?.firstDeliverableMonth
      if (!fdm) return true
      return !(m.year === fdm.year && m.month === fdm.month)
    })
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

  const limitText =
    status.maxSkips !== null
      ? `${status.skipsInWindow} / ${status.maxSkips} skips used`
      : `${status.totalSkips} skip${status.totalSkips !== 1 ? 's' : ''} used`

  return (
    <div className="rounded-lg border border-stone-700 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-stone-200">Skip Policy</p>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            status.canSkip ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'
          }`}
        >
          {status.canSkip ? 'Can skip' : 'Cannot skip'}
        </span>
      </div>

      <p className="text-xs text-stone-400">
        {limitText}
        {status.skippedMonths && status.skippedMonths.length > 0 && (
          <span className="text-stone-500">
            {' '}({status.skippedMonths
              .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
              .map((s) => `${MONTH_NAMES[s.month]} ${s.year}`)
              .join(', ')})
          </span>
        )}
      </p>

      {status.maxSkips !== null && status.windowResetDate && (
        <p className="text-xs text-stone-500">
          Window resets:{' '}
          <span className="text-stone-300 font-medium">
            {new Date(status.windowResetDate).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </span>
        </p>
      )}

      {status.notes && <p className="text-xs text-stone-500 italic whitespace-pre-line">{status.notes}</p>}

      {/* Deadline banner */}
      {status.nextDeadline && (
        <div className={`text-xs rounded px-3 py-2 flex flex-col gap-0.5 ${
          status.isPastDeadline
            ? 'bg-red-950/40 text-red-300'
            : 'bg-stone-800 text-stone-300'
        }`}>
          <span>
            {status.isPastDeadline ? '⛔ Deadline passed — ' : '⏳ Skip deadline: '}
            <span className="font-semibold">
              {new Date(status.nextDeadline).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
            {!status.isPastDeadline && (() => {
              const days = Math.ceil((new Date(status.nextDeadline).getTime() - Date.now()) / 86_400_000)
              return days > 0 ? <span className="text-stone-400"> ({days} day{days !== 1 ? 's' : ''} left)</span> : null
            })()}
          </span>
          {status.skipHow && (
            <span className="text-stone-400">
              How to skip: <span className="text-stone-200">{status.skipHow}</span>
            </span>
          )}
        </div>
      )}

      {status.warnings.map((w, i) => (
        <div key={i} className="text-xs text-amber-400 bg-amber-950/30 rounded px-2 py-1">
          ⚠ {w}
        </div>
      ))}

      {status.canSkip && upcoming.length > 0 && (
        <div>
          <p className="text-xs text-stone-400 mb-1">Track skip of:</p>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((m) => (
              <button
                key={`${m.year}-${m.month}`}
                type="button"
                onClick={() => setSkipTarget({ year: m.year, month: m.month })}
                className="text-xs px-2 py-1 rounded bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors"
              >
                {MONTH_NAMES[m.month]} {m.year}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unskip section */}
      {status.allowUnskip && status.skippedMonths && status.skippedMonths.length > 0 && (
        <div className="border-t border-stone-700 pt-3 flex flex-col gap-2">
          <p className="text-xs text-stone-400 font-medium">Skipped months:</p>

          {/* Unskip deadline banner */}
          {status.nextUnskipDeadline && (
            <div className={`text-xs rounded px-3 py-2 flex flex-col gap-0.5 ${
              status.isUnskipPastDeadline
                ? 'bg-red-950/40 text-red-300'
                : 'bg-stone-800 text-stone-300'
            }`}>
              <span>
                {status.isUnskipPastDeadline ? '⛔ Unskip deadline passed — ' : '↩ Unskip deadline: '}
                <span className="font-semibold">
                  {new Date(status.nextUnskipDeadline).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
                {!status.isUnskipPastDeadline && (() => {
                  const days = Math.ceil((new Date(status.nextUnskipDeadline!).getTime() - Date.now()) / 86_400_000)
                  return days > 0 ? <span className="text-stone-400"> ({days} day{days !== 1 ? 's' : ''} left)</span> : null
                })()}
              </span>
              {status.unskipHow && (
                <span className="text-stone-400">
                  How to unskip: <span className="text-stone-200">{status.unskipHow}</span>
                </span>
              )}
            </div>
          )}

          {status.unskipNotes && (
            <p className="text-xs text-stone-500 italic">{status.unskipNotes}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {status.skippedMonths
              .filter((s) => { const n = new Date(); const cy = n.getFullYear(), cm = n.getMonth() + 1; return s.year > cy || (s.year === cy && s.month >= cm) })
              .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
              .map((s) => (
                <button
                  key={`unskip-${s.year}-${s.month}`}
                  type="button"
                  onClick={() => setUnskipTarget({ year: s.year, month: s.month })}
                  className="text-xs px-2 py-1 rounded bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors flex items-center gap-1"
                >
                  <span>↩</span>
                  <span>{MONTH_NAMES[s.month]} {s.year}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Confirm skip dialog */}
      {skipTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
            <p className="text-stone-100 font-semibold">
              Skip {MONTH_NAMES[skipTarget.month]} {skipTarget.year}?
            </p>
            <p className="text-sm text-stone-400">
              This will record a skip for this month. Box from this period will not be added to your collection.
            </p>
            {skipMutation.error && (
              <p className="text-xs text-red-400">
                {(skipMutation.error as Error).message}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setSkipTarget(null)}
                className="px-3 py-1.5 rounded text-sm text-stone-300 hover:text-stone-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => skipMutation.mutate(skipTarget)}
                disabled={skipMutation.isPending}
                className="bg-amber-400 text-stone-950 font-semibold px-4 py-1.5 rounded text-sm hover:bg-amber-300 disabled:opacity-50 transition-colors"
              >
                {skipMutation.isPending ? 'Skipping…' : 'Confirm Skip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm unskip dialog */}
      {unskipTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
            <p className="text-stone-100 font-semibold">
              Reverse skip for {MONTH_NAMES[unskipTarget.month]} {unskipTarget.year}?
            </p>
            <p className="text-sm text-stone-400">
              This will remove the skip record for this month. The box will be added back to your expected deliveries.
            </p>
            {unskipMutation.error && (
              <p className="text-xs text-red-400">
                {(unskipMutation.error as Error).message}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setUnskipTarget(null)}
                className="px-3 py-1.5 rounded text-sm text-stone-300 hover:text-stone-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => unskipMutation.mutate(unskipTarget)}
                disabled={unskipMutation.isPending}
                className="bg-emerald-600 text-white font-semibold px-4 py-1.5 rounded text-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                {unskipMutation.isPending ? 'Reversing…' : 'Confirm Unskip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
