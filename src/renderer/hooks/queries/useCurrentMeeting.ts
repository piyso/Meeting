import { useQuery } from '@tanstack/react-query'

export function useCurrentMeeting(meetingId: string | null) {
  return useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      if (!meetingId) return null
      const response = await window.electronAPI?.meeting?.get({ meetingId })
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch meeting details')
      }
      return response.data ?? null
    },
    enabled: !!meetingId,
    staleTime: 30_000, // Serve cached data for 30s — no IPC on re-navigation
    gcTime: 5 * 60_000, // Keep in cache for 5min after unmount
  })
}
