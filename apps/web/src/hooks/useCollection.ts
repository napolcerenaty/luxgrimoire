import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';

export function useCollection(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['collection', page, pageSize],
    queryFn: () =>
      authFetch(`/api/collection?page=${page}&pageSize=${pageSize}`),
  });
}

export function useCollectionStats() {
  return useQuery({
    queryKey: ['collection', 'stats'],
    queryFn: () => authFetch('/api/collection/stats'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}