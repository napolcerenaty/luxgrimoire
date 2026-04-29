import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';

export function useSubscriptionEntry(subscriptionId: string, enabled = true) {
  return useQuery({
    queryKey: ['subscription', 'entry', subscriptionId],
    queryFn: () =>
      authFetch(`/api/subscriptions/${subscriptionId}/my-entry`),
    enabled: enabled && !!subscriptionId,
    staleTime: 5 * 60 * 1000,
  });
}