import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useCalendar() {
  const queryClient = useQueryClient()

  const { data: upcomingEvents = [], isLoading } = useQuery({
    queryKey: ['calendar', 'upcoming'],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000)
      const oneWeekAhead = now + 7 * 86400
      const res = await window.electronAPI?.calendar?.list?.({ start: now, end: oneWeekAhead })
      if (!res?.success) throw new Error(res?.error?.message ?? 'Failed to fetch calendar events')
      return res.data ?? []
    },
    initialData: [],
  })

  const connectCalendar = useMutation({
    mutationFn: async (provider: 'google' | 'apple') => {
      const res = await window.electronAPI?.calendar?.sync?.({ provider })
      if (!res?.success) throw new Error(res?.error?.message ?? 'Calendar sync failed')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })

  return { upcomingEvents, isLoading, connectCalendar }
}
