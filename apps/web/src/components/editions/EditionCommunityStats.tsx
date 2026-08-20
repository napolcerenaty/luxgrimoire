'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { API_BASE } from '@/lib/authFetch';

interface SalePriceStats {
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  count: number;
  currency: string;
}

interface EditionCommunityStatsProps {
  editionSlug: string;
  /** Fallback currency for unauthenticated users — should be edition.currency */
  fallbackCurrency?: string | null;
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

export function EditionCommunityStats({ editionSlug, fallbackCurrency }: EditionCommunityStatsProps) {
  const { user } = useAuth();
  const currency = user?.preferredCurrency ?? fallbackCurrency ?? 'EUR';

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [collectionCount, setCollectionCount] = useState<number | null>(null);
  const [saleStats, setSaleStats] = useState<SalePriceStats | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);

    fetch(`${API_BASE}/editions/${editionSlug}/stats/collection`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setCollectionCount(data.count))
      .catch(() => {});

    fetch(`${API_BASE}/editions/${editionSlug}/stats/sale-price?currency=${currency}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setSaleStats(data))
      .catch(() => {});
  }, [open, loaded, editionSlug, currency]);

  return (
    <div className="rounded-lg border border-navy-700 bg-navy-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-navy-800/40 transition-colors"
      >
        <span className="text-sm font-semibold text-navy-300 uppercase tracking-wide">Community Data</span>
        {open ? <ChevronUp size={14} className="text-navy-500" /> : <ChevronDown size={14} className="text-navy-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-navy-800">
          {!loaded ? (
            <div className="h-8 animate-pulse bg-navy-800 rounded mt-4" />
          ) : (
            <>
              {/* Collection count */}
              {collectionCount !== null && (
                <div className="flex items-center gap-2 text-sm text-navy-400 mt-3">
                  <span className="text-lg">📚</span>
                  <span>
                    <span className="text-navy-100 font-medium">{collectionCount.toLocaleString()}</span>
                    {' '}users have this edition in their collection
                  </span>
                </div>
              )}

              {/* Sale price stats */}
              {saleStats && saleStats.count > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-navy-400">
                    <span className="text-lg">💰</span>
                    <span className="text-navy-300 font-medium">Resale Price Data</span>
                    <span className="text-xs text-navy-500">({saleStats.count} reports)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-navy-800 rounded p-2 text-center">
                      <div className="text-navy-400 text-xs">Average</div>
                      <div className="text-navy-100 font-medium">{formatMoney(saleStats.avg, saleStats.currency)}</div>
                    </div>
                    <div className="bg-navy-800 rounded p-2 text-center">
                      <div className="text-navy-400 text-xs">Median</div>
                      <div className="text-navy-100 font-medium">{formatMoney(saleStats.median, saleStats.currency)}</div>
                    </div>
                    <div className="bg-navy-800 rounded p-2 text-center">
                      <div className="text-navy-400 text-xs">Min</div>
                      <div className="text-navy-100 font-medium">{formatMoney(saleStats.min, saleStats.currency)}</div>
                    </div>
                    <div className="bg-navy-800 rounded p-2 text-center">
                      <div className="text-navy-400 text-xs">Max</div>
                      <div className="text-navy-100 font-medium">{formatMoney(saleStats.max, saleStats.currency)}</div>
                    </div>
                  </div>
                  <p className="text-xs text-navy-500 italic">
                    Based on anonymized, user-contributed resale data. Values in {saleStats.currency}.
                  </p>
                </div>
              ) : (collectionCount !== null && collectionCount > 0) ? (
                <p className="text-xs text-navy-500 italic mt-1">
                  No resale price data available for this edition yet.
                </p>
              ) : (
                <p className="text-xs text-navy-500 mt-1">No community data yet for this edition.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
