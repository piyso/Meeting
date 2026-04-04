import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useActionItems(meetingId?: string) {
  const queryClient = useQueryClient()

  const { data: actionItems = [], isLoading } = useQuery({
    queryKey: ['actions', meetingId],
    queryFn: async () => {
      const res = await window.electronAPI?.actionItem?.list?.({ ...(meetingId && { meetingId }) })
      if (!res?.success) throw new Error(res?.error?.message ?? 'Failed to fetch action items')
      return res.data ?? []
    },
    enabled: true,
    initialData: [],
  })

  const updateStatus = useMutation({
    mutationFn: async ({ actionId, status }: { actionId: string; status: string }) => {
      const res = await window.electronAPI?.actionItem?.update?.({
        id: actionId,
        updates: { status: status as 'open' | 'completed' },
      })
      if (!res?.success) throw new Error(res?.error?.message)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions', meetingId] })
    },
  })

  return { actionItems, isLoading, updateStatus }
}
