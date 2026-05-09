interface SubscriberCountBadgeProps {
  count: number;
}

export function SubscriberCountBadge({ count }: SubscriberCountBadgeProps) {
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
