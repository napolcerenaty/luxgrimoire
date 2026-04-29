'use client';

import { Package } from 'lucide-react';

interface TrackPackageButtonProps {
  trackingNumber: string;
  entryId?: string;
  className?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function TrackPackageButton({ trackingNumber, entryId, className }: TrackPackageButtonProps) {
  const params = new URLSearchParams({ number: trackingNumber });
  if (entryId) params.set('entryId', entryId);

  const href = `${API_BASE}/tracking/click?${params.toString()}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a3a4a] border border-[#2a9ec4]/40 text-[#2a9ec4] hover:bg-[#1e4a5e] hover:border-[#2a9ec4]/70 transition-all text-sm font-medium'
      }
      aria-label={`Track package ${trackingNumber}`}
    >
      <Package className="w-4 h-4 shrink-0" />
      Track Package
    </a>
  );
}
