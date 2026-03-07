import { useQuery } from '@tanstack/react-query'

export function useCurrentMeeting(meetingId: string | null) {
  return useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      if (!meetingId) return null
      const response = await window.electronAPI.meeting.get({ meetingId })
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch meeting details')
      }
      return response.data ?? null
    },
    enabled: !!meetingId,
  })
}
