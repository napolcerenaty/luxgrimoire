'use client'

import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { groupIntoBundles, bundleRangeLabel } from '@/lib/bundleHelpers'
import { useSkipPolicyStatus } from '@/hooks/useSkipPolicyStatus'
import { ManageSkipsModal } from '@/components/subscriptions/ManageSkipsModal'

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function formatMonthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month]} ${year}`
}

interface Props {
  subscriptionSlug: string
  subscriptionName: string
  onSkipSuccess?: () => void
}

/**
 * Compact skip-status summary for the /my-subscriptions overview card — same
 * underlying data/mutations/bundle-grouping as SkipStatusPanel (via
 * useSkipPolicyStatus), condensed to fit a narrow grid column instead of a
 * full-width section.
 */
export default function SkipStatusCompact({ subscriptionSlug, subscriptionName, onSkipSuccess }: Props) {
  const {
    status, isLoading, error, isBundleMode,
    showManageSkips, setShowManageSkips,
    skipMutation, unskipMutation,
  } = useSkipPolicyStatus(subscriptionSlug, onSkipSuccess)

  const skipLimit = `${status?.skipsInWindow ?? 0} / ${status?.maxSkips ?? '∞'} skips used`

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Skips</h4>
        {status && status.policyType !== 'NONE' && (
          <button
            type="button"
            onClick={() => setShowManageSkips(true)}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-stone-700 text-stone-400 hover:text-stone-200 hover:border-stone-500 transition-colors"
          >
            <Settings2 size={11} />
            Manage
          </button>
        )}
      </div>

      {isLoading && !status ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 bg-stone-800 rounded" style={{ width: `${80 - i * 8}%` }} />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">Could not load skip status.</p>
      ) : status?.policyType === 'NONE' ? (
        <span className="inline-flex rounded-full border border-stone-300 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-400">
          No skipping offered
        </span>
      ) : status ? (
        <div className="space-y-3">
          <span className="inline-flex rounded-full border border-stone-300 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200">
            {skipLimit}
          </span>

          {status.maxSkips !== null && status.windowResetDate && (
            <p className="text-xs text-stone-500 dark:text-stone-500">
              Window resets:{' '}
              <span className="text-stone-600 dark:text-stone-400 font-medium">
                {new Date(status.windowResetDate).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
            </p>
          )}

          {!status.canSkip && status.isPastDeadline && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Skip deadline has already passed for the next eligible box.</p>
          )}

          {status.warnings.length > 0 && (() => {
            const skipsExhausted = status.maxSkips !== null && status.skipsInWindow >= status.maxSkips
            const visibleWarnings = skipsExhausted
              ? status.warnings.filter((w) => !/skip window.*passed|window.*passed/i.test(w))
              : status.warnings
            if (visibleWarnings.length === 0) return null
            return (
              <div className="space-y-1.5">
                {visibleWarnings.map((warning) => {
                  const isCritical = /consecutive|cancel/i.test(warning)
                  return isCritical ? (
                    <div key={warning} className="flex items-start gap-2 rounded-lg border border-red-400/50 bg-red-50 px-3 py-2 dark:border-red-500/50 dark:bg-red-950/40">
                      <span className="mt-px shrink-0">⚠️</span>
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300">{warning}</p>
                    </div>
                  ) : (
                    <p key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:border-transparent dark:bg-amber-500/10 dark:text-amber-300">
                      {warning}
                    </p>
                  )
                })}
              </div>
            )
          })()}

          {status.canSkip && status.targetMonth && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-700/60 dark:bg-stone-900/60">
              <p className="text-xs text-stone-500">{isBundleMode ? 'Next eligible bundle' : 'Next eligible month'}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-stone-800 dark:text-stone-100">
                  {isBundleMode
                    ? bundleRangeLabel(status.targetMonth.year, status.targetMonth.month, status.intervalMonths)
                    : formatMonthLabel(status.targetMonth.year, status.targetMonth.month)}
                </span>
                <button
                  type="button"
                  onClick={() => skipMutation.mutate(status.targetMonth!)}
                  disabled={skipMutation.isPending}
                  className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/30 disabled:opacity-50 dark:text-amber-300"
                >
                  {skipMutation.isPending ? 'Skipping…' : isBundleMode ? 'Skip bundle' : 'Skip'}
                </button>
              </div>
            </div>
          )}

          {skipMutation.error && (
            <p className="text-xs text-red-400">{(skipMutation.error as Error).message}</p>
          )}

          {status.skippedMonths.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-500">
                {isBundleMode
                  ? (() => {
                      const n = groupIntoBundles(status.skippedMonths, status.intervalMonths, status.startingMonth).length
                      return `${n} skipped bundle${n !== 1 ? 's' : ''}`
                    })()
                  : `${status.skippedMonths.length} skipped month${status.skippedMonths.length !== 1 ? 's' : ''}`}
              </p>
              <Link href={`/my-subscriptions/skipped-months?sub=${subscriptionSlug}`} className="text-xs text-amber-600 transition-colors hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300">View all →</Link>
            </div>
          )}

          {status.allowUnskip && status.skippedMonths.length > 0 && (() => {
            const now = new Date()
            const cy = now.getFullYear(), cm = now.getMonth() + 1
            const unskippable = status.skippedMonths
              .filter((m) => m.year > cy || (m.year === cy && m.month >= cm))
              .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
            if (unskippable.length === 0) return null
            const unskippableBundles = isBundleMode
              ? groupIntoBundles(unskippable, status.intervalMonths, status.startingMonth)
              : []
            return (
              <div className="space-y-2">
                <p className="text-xs text-stone-500">{isBundleMode ? 'Unskip upcoming bundles' : 'Unskip upcoming'}</p>
                <div className="flex flex-wrap gap-2">
                  {isBundleMode
                    ? unskippableBundles.map((bundle) => (
                        <button
                          key={bundle.key}
                          type="button"
                          onClick={() => unskipMutation.mutate({ year: bundle.startYear, month: bundle.startMonth })}
                          disabled={unskipMutation.isPending}
                          className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-800 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100"
                        >
                          Unskip {bundle.label}
                        </button>
                      ))
                    : unskippable.map((month) => (
                        <button
                          key={`${month.year}-${month.month}`}
                          type="button"
                          onClick={() => unskipMutation.mutate(month)}
                          disabled={unskipMutation.isPending}
                          className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-800 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100"
                        >
                          Unskip {formatMonthLabel(month.year, month.month)}
                        </button>
                      ))}
                </div>
                {unskipMutation.error && (
                  <p className="text-xs text-red-400">{(unskipMutation.error as Error).message}</p>
                )}
              </div>
            )
          })()}
        </div>
      ) : (
        <p className="text-sm text-stone-500">No skip details yet.</p>
      )}

      {showManageSkips && (
        <ManageSkipsModal
          subscriptionSlug={subscriptionSlug}
          subscriptionName={subscriptionName}
          onClose={() => setShowManageSkips(false)}
          onSaved={() => {
            setShowManageSkips(false)
            onSkipSuccess?.()
          }}
        />
      )}
    </>
  )
}
