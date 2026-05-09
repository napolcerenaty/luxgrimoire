'use client';

interface SalePriceStats {
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  count: number;
  currency: string;
}

interface EditionCommunityStatsProps {
  collectionCount: number;
  saleStats: SalePriceStats | null;
  userCurrency?: string;
}

export function EditionCommunityStats({ collectionCount, saleStats }: EditionCommunityStatsProps) {
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/50 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wide">Community Data</h3>

      {/* Collection count */}
      <div className="flex items-center gap-2 text-sm text-stone-400">
        <span className="text-lg">📚</span>
        <span>
          <span className="text-stone-100 font-medium">{collectionCount.toLocaleString()}</span>
          {' '}users have this edition in their collection
        </span>
      </div>

      {/* Sale price stats */}
      {saleStats && saleStats.count > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-stone-400">
            <span className="text-lg">💰</span>
            <span className="text-stone-300 font-medium">Resale Price Data</span>
            <span className="text-xs text-stone-500">({saleStats.count} reports)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-stone-800 rounded p-2 text-center">
              <div className="text-stone-400 text-xs">Average</div>
              <div className="text-stone-100 font-medium">
                {saleStats.avg !== null ? `€${saleStats.avg.toFixed(2)}` : '—'}
              </div>
            </div>
            <div className="bg-stone-800 rounded p-2 text-center">
              <div className="text-stone-400 text-xs">Median</div>
              <div className="text-stone-100 font-medium">
                {saleStats.median !== null ? `€${saleStats.median.toFixed(2)}` : '—'}
              </div>
            </div>
            <div className="bg-stone-800 rounded p-2 text-center">
              <div className="text-stone-400 text-xs">Min</div>
              <div className="text-stone-100 font-medium">
                {saleStats.min !== null ? `€${saleStats.min.toFixed(2)}` : '—'}
              </div>
            </div>
            <div className="bg-stone-800 rounded p-2 text-center">
              <div className="text-stone-400 text-xs">Max</div>
              <div className="text-stone-100 font-medium">
                {saleStats.max !== null ? `€${saleStats.max.toFixed(2)}` : '—'}
              </div>
            </div>
          </div>
          <p className="text-xs text-stone-500 italic">
            Based on anonymized, user-contributed resale data. Values in EUR.
          </p>
        </div>
      )}
    </div>
  );
}
