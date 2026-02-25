import { useQuery } from '@tanstack/react-query'
import type { ListMeetingsParams } from '../../../types/ipc'

export function useMeetings(params: ListMeetingsParams = { limit: 50, offset: 0 }) {
  return useQuery({
    queryKey: ['meetings', params],
    queryFn: async () => {
      const response = await window.electronAPI.meeting.list(params)
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch meetings')
      }
      return response.data!
    },
  })
}
