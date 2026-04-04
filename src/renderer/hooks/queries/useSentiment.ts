import { useQuery } from '@tanstack/react-query'

export function useSentiment(meetingId?: string) {
  const { data: sentimentTimeline = [], isLoading } = useQuery({
    queryKey: ['sentiment', meetingId],
    queryFn: async () => {
      if (!meetingId) return []
      const res = await window.electronAPI?.sentiment?.getTimeline?.({ meetingId })
      if (!res?.success) throw new Error(res?.error?.message ?? 'Failed to fetch sentiment')
      return res.data ?? []
    },
    enabled: !!meetingId,
    initialData: [],
    refetchInterval: 5000, // Poll every 5s during active meeting
  })

  return { sentimentTimeline, isLoading }
}
