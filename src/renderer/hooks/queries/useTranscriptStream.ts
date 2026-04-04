import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../../store/appStore'
import type { TranscriptChunk } from '../../../types/ipc'

/**
 * OPT-19: Uses a Map stored in a ref for O(1) chunk lookups instead of O(N) array scans.
 * React state is only updated at a throttled rate (every 300ms) for rendering,
 * not on every incoming chunk event.
 */
export function useTranscriptStream(meetingId: string | null) {
  const [renderTick, setRenderTick] = useState(0)
  const recordingState = useAppStore(s => s.recordingState)
  const isActivelyRecording = recordingState === 'recording' || recordingState === 'paused'

  const {
    data: historicalTranscripts = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['transcripts', meetingId],
    queryFn: async () => {
      if (!meetingId) return []
      const response = await window.electronAPI?.transcript?.get({ meetingId })
      if (!response?.success) {
        throw new Error(response.error?.message || 'Failed to fetch transcripts')
      }
      return response.data ?? []
    },
    enabled: !!meetingId,
  })

  // Throttled render tick — only run during active recording, not when viewing completed meetings
  useEffect(() => {
    if (!meetingId || !isActivelyRecording) return
    const interval = setInterval(() => setRenderTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [meetingId, isActivelyRecording])

  // Dual-buffer for Speculative UI Engine
  // Committed buffer stores highly accurate, slow Whisper output
  const committedChunksRef = useRef(new Map<string, TranscriptChunk>())
  // Phantom buffer stores hyper-fast, phonetic ASR output
  const phantomChunksRef = useRef(new Map<string, TranscriptChunk>())

  // Throttled render tick for phantom chunks to prevent UI locking,
  // while committed chunks force immediate re-renders.
  useEffect(() => {
    if (!meetingId) return

    committedChunksRef.current = new Map()
    phantomChunksRef.current = new Map()
    setRenderTick(0)

    const unsubscribe = window.electronAPI?.on?.transcriptChunk((chunk: TranscriptChunk) => {
      if (chunk.meetingId === meetingId) {
        if (chunk.isFinal) {
          // Promote to committed, remove from phantom
          committedChunksRef.current.set(chunk.transcriptId, chunk)
          phantomChunksRef.current.delete(chunk.transcriptId)
          // Force immediate tick for committed text to feel snappy
          setRenderTick(t => t + 1)
        } else {
          // Update phantom buffer
          phantomChunksRef.current.set(chunk.transcriptId, chunk)
        }

        // Memory cap — evict oldest from committed if > 500
        if (committedChunksRef.current.size > 500) {
          const firstKey = committedChunksRef.current.keys().next().value
          if (firstKey !== undefined) committedChunksRef.current.delete(firstKey)
        }
      }
    })

    return () => unsubscribe()
  }, [meetingId])

  // Combine database transcripts and live streamed chunks — deduplicate by ID
  const allTranscripts = useMemo(() => {
    // Build a Map for O(1) deduplication — live chunks override historical entries
    const deduped = new Map<string, TranscriptChunk>()

    // Insert historical first
    for (const t of historicalTranscripts) {
      const normalized = {
        ...t,
        transcriptId: t.id,
        meetingId: t.meeting_id,
        speakerId: t.speaker_id ?? undefined,
        startTime: t.start_time,
        endTime: t.end_time,
        isFinal: true,
      } as TranscriptChunk
      deduped.set(t.id, normalized)
    }

    // Live committed chunks override historical entries
    for (const [id, chunk] of committedChunksRef.current) {
      deduped.set(id, chunk)
    }

    // Phantom chunks sit on top of the committed state
    for (const [id, chunk] of phantomChunksRef.current) {
      deduped.set(id, chunk)
    }

    const combined = Array.from(deduped.values())
    combined.sort((a, b) => a.startTime - b.startTime)
    return combined
  }, [renderTick, historicalTranscripts]) // eslint-disable-line react-hooks/exhaustive-deps

  return { transcripts: allTranscripts, isLoading, error: queryError }
}
