'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface SubscriberCountBadgeProps {
  subscriptionSlug: string;
}

export function SubscriberCountBadge({ subscriptionSlug }: SubscriberCountBadgeProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/subscriptions/${subscriptionSlug}/stats/subscribers`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setCount(data.count))
      .catch(() => {});
  }, [subscriptionSlug]);

  if (count === null || count === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm text-stone-400">
      <span>👥</span>
      <span>
        <span className="text-stone-200 font-medium">{count.toLocaleString()}</span>
        {' '}active subscribers
      </span>
    </div>
  );
}
