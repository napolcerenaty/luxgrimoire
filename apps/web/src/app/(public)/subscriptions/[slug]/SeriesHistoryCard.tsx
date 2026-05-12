import type { ApiSubscriptionSeries } from '@luxgrimoire/shared-types'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function SeriesHistoryCard({ series }: { series: ApiSubscriptionSeries }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const isCurrentlyActive =
    series.isActive &&
    (series.startYear < currentYear ||
      (series.startYear === currentYear && series.startMonth <= currentMonth)) &&
    (series.endYear > currentYear ||
      (series.endYear === currentYear && series.endMonth >= currentMonth))

  const isPast =
    series.endYear < currentYear ||
    (series.endYear === currentYear && series.endMonth < currentMonth)

  const months = series.months ?? []

  return (
    <div className={`rounded-xl border p-5 ${isCurrentlyActive ? 'border-purple-700/60 bg-purple-950/20' : 'border-stone-800 bg-stone-900/50'}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-stone-100 font-serif font-semibold text-lg leading-tight">{series.name}</h3>
            {isCurrentlyActive && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-700 text-purple-100">Active</span>
            )}
            {isPast && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-700 text-stone-400">Past</span>
            )}
            {!isCurrentlyActive && !isPast && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-800/60 text-amber-300">Upcoming</span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-stone-700 text-stone-400">
              {series.skipMode === 'NO_SKIP' ? 'No skips' :
               series.skipMode === 'SERIES_AS_ONE' || series.skipMode === 'SERIES_ONLY' ? 'Skip as series (1 skip)' :
               series.skipMode === 'SERIES_AS_MANY' ? 'Skip as series (per volume)' :
               'Individual skips'}
            </span>
            {!series.canCancelDuring && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-700/50 text-amber-600/80">no cancel during</span>
            )}
          </div>
          <p className="text-stone-400 text-sm mb-3">
            {MONTH_SHORT[series.startMonth - 1]} {series.startYear} – {MONTH_SHORT[series.endMonth - 1]} {series.endYear}
          </p>
          {series.description && (
            <p className="text-stone-400 text-sm mb-3 leading-relaxed">{series.description}</p>
          )}
          {months.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {months.map((m) => (
                <span
                  key={m.id}
                  className="text-[11px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700"
                >
                  {MONTH_SHORT[m.month - 1]} {m.year}
                  {m.theme ? ` · ${m.theme}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
