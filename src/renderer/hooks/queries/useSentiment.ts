import { useQuery } from '@tanstack/react-query'

/**
 * Fetches sentiment timeline for a meeting.
 *
 * @param meetingId - The meeting to fetch sentiment for
 * @param isRecording - When true, polls every 5s for live updates.
 *                      When false (viewing completed meetings), fetches once and caches.
 */
export function useSentiment(meetingId?: string, isRecording = false) {
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
    // Only poll during active recording — viewing past meetings fetches once and caches
    refetchInterval: isRecording ? 5000 : false,
  })

  return { sentimentTimeline, isLoading }
}
