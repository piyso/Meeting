import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateNoteParams, UpdateNoteParams, DeleteNoteParams } from '../../../types/ipc'

export function useNotes(meetingId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notes', meetingId],
    queryFn: async () => {
      if (!meetingId) return []
      const response = await window.electronAPI.note.get({ meetingId })
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch notes')
      }
      return response.data!
    },
    enabled: !!meetingId,
  })

  const createNote = useMutation({
    mutationFn: async (params: CreateNoteParams) => {
      const response = await window.electronAPI.note.create(params)
      if (!response.success) throw new Error(response.error?.message)
      return response.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', meetingId] })
    }
  })

  const updateNote = useMutation({
    mutationFn: async (params: UpdateNoteParams) => {
      const response = await window.electronAPI.note.update(params)
      if (!response.success) throw new Error(response.error?.message)
      return response.data!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', meetingId] })
    }
  })

  const deleteNote = useMutation({
    mutationFn: async (params: DeleteNoteParams) => {
      const response = await window.electronAPI.note.delete(params)
      if (!response.success) throw new Error(response.error?.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', meetingId] })
    }
  })

  return {
    ...query,
    createNote,
    updateNote,
    deleteNote,
  }
}
