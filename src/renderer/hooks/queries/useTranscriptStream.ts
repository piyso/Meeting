import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { TranscriptChunk } from '../../../types/ipc'

/**
 * OPT-19: Uses a single Unified Map stored in a ref for O(1) chunk lookups.
 * React state is only updated at a throttled rate (every 300ms) for rendering.
 * JS Map iteration order guarantees chronological sorting natively.
 */
export function useTranscriptStream(meetingId: string | null) {
  const [renderTick, setRenderTick] = useState(0)

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
        throw new Error(response?.error?.message || 'Failed to fetch transcripts')
      }
      return response.data ?? []
    },
    enabled: !!meetingId,
  })

  // Track latest meetingId to prevent stale closures in the IPC listener
  const latestMeetingIdRef = useRef(meetingId)
  useEffect(() => {
    latestMeetingIdRef.current = meetingId
  }, [meetingId])

  // Removed throttled 1000ms interval — renderTick is now only incremented when new chunks actually arrive

  const transcriptsMapRef = useRef(new Map<string, TranscriptChunk>())
  const lastTickRef = useRef(0)
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed the map with historical transcripts when they load
  useEffect(() => {
    if (!historicalTranscripts?.length) return

    // We don't clear the map here so we don't wipe out live chunks that arrived before DB load
    for (const t of historicalTranscripts) {
      if (!transcriptsMapRef.current.has(t.id)) {
        transcriptsMapRef.current.set(t.id, {
          ...t,
          transcriptId: t.id,
          meetingId: t.meeting_id,
          speakerId: t.speaker_id ?? undefined,
          startTime: t.start_time,
          endTime: t.end_time,
          isFinal: true,
        } as TranscriptChunk)
      }
    }
    setRenderTick(t => t + 1)
  }, [historicalTranscripts])

  useEffect(() => {
    if (!meetingId) return

    transcriptsMapRef.current.clear()
    setRenderTick(0)

    const unsubscribe = window.electronAPI?.on?.transcriptChunk((chunk: TranscriptChunk) => {
      if (chunk.meetingId !== latestMeetingIdRef.current) return

      // Map preserves insertion order when keys are updated.
      // Since chunks arrive chronologically, they are naturally sorted.
      transcriptsMapRef.current.set(chunk.transcriptId, chunk)

      if (chunk.isFinal) {
        if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
        setRenderTick(t => t + 1)
        lastTickRef.current = Date.now()
      } else {
        const now = Date.now()
        if (now - lastTickRef.current > 300) {
          setRenderTick(t => t + 1)
          lastTickRef.current = now
        } else {
          // Trailing edge to ensure the last phantom word isn't permanently dropped
          if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
          throttleTimerRef.current = setTimeout(() => {
            setRenderTick(t => t + 1)
            lastTickRef.current = Date.now()
          }, 300)
        }
      }
    })

    return () => {
      unsubscribe?.()
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current)
    }
  }, [meetingId])

  // Lightning fast O(N) extraction. No sorting required.
  const allTranscripts = useMemo(() => {
    return Array.from(transcriptsMapRef.current.values())
  }, [renderTick])

  return { transcripts: allTranscripts, isLoading, error: queryError }
}
