'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

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

  const [collectionCount, setCollectionCount] = useState<number | null>(null);
  const [saleStats, setSaleStats] = useState<SalePriceStats | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/editions/${editionSlug}/stats/collection`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setCollectionCount(data.count))
      .catch(() => {});
  }, [editionSlug]);

  useEffect(() => {
    fetch(`${API_URL}/editions/${editionSlug}/stats/sale-price?currency=${currency}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setSaleStats(data))
      .catch(() => {});
  }, [editionSlug, currency]);

  if (collectionCount === null && saleStats === null) return null;

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/50 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wide">Community Data</h3>

      {/* Collection count */}
      {collectionCount !== null && (
        <div className="flex items-center gap-2 text-sm text-stone-400">
          <span className="text-lg">📚</span>
          <span>
            <span className="text-stone-100 font-medium">{collectionCount.toLocaleString()}</span>
            {' '}users have this edition in their collection
          </span>
        </div>
      )}

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
              <div className="text-stone-100 font-medium">{formatMoney(saleStats.avg, saleStats.currency)}</div>
            </div>
            <div className="bg-stone-800 rounded p-2 text-center">
              <div className="text-stone-400 text-xs">Median</div>
              <div className="text-stone-100 font-medium">{formatMoney(saleStats.median, saleStats.currency)}</div>
            </div>
            <div className="bg-stone-800 rounded p-2 text-center">
              <div className="text-stone-400 text-xs">Min</div>
              <div className="text-stone-100 font-medium">{formatMoney(saleStats.min, saleStats.currency)}</div>
            </div>
            <div className="bg-stone-800 rounded p-2 text-center">
              <div className="text-stone-400 text-xs">Max</div>
              <div className="text-stone-100 font-medium">{formatMoney(saleStats.max, saleStats.currency)}</div>
            </div>
          </div>
          <p className="text-xs text-stone-500 italic">
            Based on anonymized, user-contributed resale data. Values in {saleStats.currency}.
          </p>
        </div>
      )}
    </div>
  );
}
