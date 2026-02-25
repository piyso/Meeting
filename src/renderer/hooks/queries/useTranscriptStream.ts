import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TranscriptChunk } from '../../../types/ipc'

export function useTranscriptStream(meetingId: string | null) {
  const [streamedChunks, setStreamedChunks] = useState<TranscriptChunk[]>([])

  const { data: historicalTranscripts = [], isLoading, error: queryError } = useQuery({
    queryKey: ['transcripts', meetingId],
    queryFn: async () => {
      if (!meetingId) return []
      const response = await window.electronAPI.transcript.get({ meetingId })
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch transcripts')
      }
      return response.data!
    },
    enabled: !!meetingId,
  })

  useEffect(() => {
    if (!meetingId) return

    setStreamedChunks([])

    const unsubscribe = window.electronAPI.on.transcriptChunk((chunk: TranscriptChunk) => {
      if (chunk.meetingId === meetingId) {
        setStreamedChunks((prev) => {
          // If the chunk replaces an existing unfinalized chunk, we should probably update it.
          // In basic implementation, we just append or rely on transcriptId.
          const idx = prev.findIndex(c => c.transcriptId === chunk.transcriptId)
          if (idx >= 0) {
            const copy = [...prev]
            copy[idx] = chunk
            return copy
          }
          const updated = [...prev, chunk]
          // Cap at 500 segments — older segments remain in SQLite, queryable on scroll-up
          if (updated.length > 500) {
            return updated.slice(updated.length - 500)
          }
          return updated
        })
      }
    })

    return () => unsubscribe()
  }, [meetingId])

  // Combine database transcripts and live streamed chunks
  const allTranscripts = [
    ...historicalTranscripts.map(t => ({
      ...t,
      transcriptId: t.id,
      startTime: t.start_time,
      endTime: t.end_time,
      isFinal: true
    })),
    ...streamedChunks
  ]

  // Sort them so they appear chronologically
  allTranscripts.sort((a, b) => a.startTime - b.startTime)

  return { transcripts: allTranscripts, isLoading, error: queryError }
}
