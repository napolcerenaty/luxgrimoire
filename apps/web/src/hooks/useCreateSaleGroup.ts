import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSaleGroup } from '@/lib/api'

export function useCreateSaleGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createSaleGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-groups'] })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['spending-stats-v2'] })
    },
  })
}
